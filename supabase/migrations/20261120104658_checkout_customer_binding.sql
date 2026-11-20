CREATE OR REPLACE FUNCTION kelvin_private.complete_pos_sale(
    p_sale uuid, p_branch uuid, p_items jsonb, p_payments jsonb, p_details jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    staff_id uuid := auth.uid();
    staff_name text;
    previous public.sales%ROWTYPE;
    shop public.shop_settings%ROWTYPE;
    product public.products%ROWTYPE;
    customer public.customers%ROWTYPE;
    buyer_id uuid := nullif(p_details->>'customer_id','')::uuid;
    discount numeric := coalesce((p_details->>'discount')::numeric,0);
    sale_notes text := nullif(btrim(p_details->>'notes'),'');
    item record;
    line record;
    payment record;
    lines jsonb := '[]';
    validated_payments jsonb := '[]';
    stock_balance numeric;
    current_line_gross numeric;
    gross_before_discount numeric := 0;
    gross_to_line numeric := 0;
    discounts_to_line numeric := 0;
    line_discount numeric;
    tax numeric := 0;
    total numeric;
    payment_total numeric := 0;
    payment_amount numeric;
    payment_tendered numeric;
    change_due numeric := 0;
    credit_sale boolean := false;
    number_suffix text;
BEGIN
    IF staff_id IS NULL OR public.is_cashier_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'An active sales staff account is required' USING ERRCODE='42501';
    END IF;
    IF p_sale IS NULL THEN RAISE EXCEPTION 'A checkout identifier is required'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('kelvin-checkout:' || p_sale::text,0));
    SELECT * INTO previous FROM public.sales WHERE id=p_sale;
    IF FOUND THEN
        IF previous.cashier_id=staff_id AND previous.branch_id=p_branch
           AND EXISTS (SELECT 1 FROM public.receipts WHERE sale_id=p_sale AND type='sale') THEN
            RETURN p_sale;
        END IF;
        RAISE EXCEPTION 'This checkout identifier is already in use';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch';
    END IF;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_typeof(p_payments) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Provide sale items and payments';
    END IF;
    IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
        OR jsonb_array_length(p_payments) NOT BETWEEN 1 AND 3 THEN
        RAISE EXCEPTION 'Enter 1–100 products and 1–3 payments';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_items) AS i(product_id uuid,quantity numeric,unit_price numeric)
        WHERE product_id IS NULL OR quantity IS NULL OR quantity NOT BETWEEN 0.0001 AND 99999
           OR quantity<>round(quantity,4) OR unit_price IS NULL
    ) OR (SELECT count(DISTINCT product_id) FROM jsonb_to_recordset(p_items) AS i(product_id uuid))
         <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'The cart has invalid or duplicate items';
    END IF;
    IF discount NOT BETWEEN 0 AND 9999999999.99 OR discount<>round(discount,2)
        OR length(coalesce(sale_notes,''))>500 THEN
        RAISE EXCEPTION 'Enter a valid discount and a note of at most 500 characters';
    END IF;
    IF discount>0 AND public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'A manager or administrator must apply discounts' USING ERRCODE='42501';
    END IF;
    SELECT * INTO STRICT shop FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
    SELECT full_name INTO staff_name FROM public.users WHERE id=staff_id;

    FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS i(product_id uuid,quantity numeric,unit_price numeric) ORDER BY product_id
    LOOP
        SELECT * INTO product FROM public.products WHERE id=item.product_id FOR UPDATE;
        IF NOT FOUND OR NOT product.is_active OR product.is_deleted
            OR (product.branch_id IS NOT NULL AND product.branch_id<>p_branch) THEN
            RAISE EXCEPTION 'An item is no longer available at this branch';
        END IF;
        IF product.selling_price<0 OR product.selling_price<>item.unit_price THEN
            RAISE EXCEPTION 'The price of % changed. Refresh the catalog before retrying.',product.name;
        END IF;
        IF product.track_stock AND NOT shop.allow_negative_stock THEN
            SELECT coalesce(sum(qty_in-qty_out),0) INTO stock_balance FROM public.stock_entries
            WHERE product_id=product.id AND branch_id=p_branch;
            IF stock_balance<item.quantity THEN
                RAISE EXCEPTION 'Insufficient stock for % (available: %)',product.name,greatest(stock_balance,0);
            END IF;
        END IF;
        current_line_gross := round(product.selling_price*item.quantity,2);
        gross_before_discount := gross_before_discount+current_line_gross;
        lines := lines || jsonb_build_object(
            'product_id',product.id,'name',product.name,'sku',product.sku,'quantity',item.quantity,
            'unit_price',product.selling_price,'unit_cost',product.buying_price,
            'min_price',product.min_price,'line_gross',current_line_gross,'tax_class',product.tax_class
        );
    END LOOP;

    IF discount>gross_before_discount OR gross_before_discount>9999999999.99 THEN
        RAISE EXCEPTION 'The discount or sale total is outside the supported range';
    END IF;
    total := gross_before_discount-discount;
    FOR line IN
        SELECT * FROM jsonb_to_recordset(lines) AS l(
            product_id uuid,name text,quantity numeric,min_price numeric,line_gross numeric,tax_class public.tax_class
        ) ORDER BY product_id
    LOOP
        gross_to_line := gross_to_line+line.line_gross;
        line_discount := coalesce(round(discount*gross_to_line/nullif(gross_before_discount,0),2),0)-discounts_to_line;
        IF line_discount>0 AND line.min_price IS NOT NULL
            AND line.line_gross-line_discount < round(line.min_price*line.quantity,2) THEN
            RAISE EXCEPTION 'Discount would take % below its minimum price',line.name;
        END IF;
        discounts_to_line := discounts_to_line+line_discount;
        IF line.tax_class='standard' AND shop.tax_rate>0 THEN
            tax := tax+round((line.line_gross-line_discount)*shop.tax_rate/(100+shop.tax_rate),2);
        END IF;
    END LOOP;

    IF (SELECT count(DISTINCT method) FROM jsonb_to_recordset(p_payments) AS p(method text))
        <> jsonb_array_length(p_payments) THEN
        RAISE EXCEPTION 'Each payment method can be used once per sale';
    END IF;
    FOR payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS p(method text,amount numeric,tendered numeric,reference text)
    LOOP
        IF payment.method IS NULL OR payment.method NOT IN ('cash','card','mpesa','credit')
            OR length(coalesce(payment.reference,''))>120 THEN
            RAISE EXCEPTION 'Choose a payment method and a valid reference';
        END IF;
        payment_amount := CASE WHEN jsonb_array_length(p_payments)=1 THEN coalesce(payment.amount,total) ELSE payment.amount END;
        IF payment_amount IS NULL OR payment_amount NOT BETWEEN 0 AND total
            OR payment_amount<>round(payment_amount,2) OR (total>0 AND payment_amount=0) THEN
            RAISE EXCEPTION 'Each payment must be a valid amount with at most two decimal places';
        END IF;
        payment_tendered := payment_amount;
        IF payment.method='cash' THEN
            payment_tendered := payment.tendered;
            IF payment_tendered IS NULL OR payment_tendered NOT BETWEEN payment_amount AND 9999999999.99
                OR payment_tendered<>round(payment_tendered,2) THEN
                RAISE EXCEPTION 'Cash received must cover the cash portion of the sale';
            END IF;
            change_due := payment_tendered-payment_amount;
        ELSIF payment.method='credit' THEN
            IF jsonb_array_length(p_payments)<>1 OR buyer_id IS NULL OR NOT shop.allow_credit_sales OR total=0 THEN
                RAISE EXCEPTION 'An on-account sale needs a customer and must use credit for the full amount';
            END IF;
            credit_sale := true;
            payment_tendered := 0;
        ELSIF nullif(btrim(payment.reference),'') IS NULL THEN
            RAISE EXCEPTION 'Enter the payment reference for %',payment.method;
        END IF;
        payment_total := payment_total+payment_amount;
        validated_payments := validated_payments || jsonb_build_object(
            'method',payment.method,'amount',payment_amount,'tendered',payment_tendered,
            'reference',nullif(btrim(payment.reference),'')
        );
    END LOOP;
    IF payment_total<>total OR total+change_due>9999999999.99 THEN
        RAISE EXCEPTION 'Payments must add up to the exact sale total';
    END IF;
    IF buyer_id IS NOT NULL THEN
        SELECT c.* INTO customer FROM public.customers c WHERE c.id=buyer_id AND c.is_active FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'This customer account is inactive or unavailable'; END IF;
        IF credit_sale AND (customer.credit_limit<=0 OR customer.credit_used+total>customer.credit_limit) THEN
            RAISE EXCEPTION 'This sale exceeds the customer’s available credit';
        END IF;
    END IF;
    number_suffix := nextval('kelvin_private.checkout_number')::text;

    INSERT INTO public.sales (
        id,sale_number,branch_id,cashier_id,customer_id,customer_name,cashier_name,status,subtotal,discount_amount,
        tax_amount,total_amount,amount_paid,change_amount,notes,completed_at,is_credit,credit_due_date
    ) VALUES (
        p_sale,'POS-' || number_suffix,p_branch,staff_id,customer.id,customer.name,staff_name,'completed',
        gross_before_discount-tax,discount,tax,total,CASE WHEN credit_sale THEN 0 ELSE total+change_due END,
        change_due,sale_notes,now(),credit_sale,CASE WHEN credit_sale
            THEN (now() AT TIME ZONE shop.timezone)::date
                + CASE WHEN customer.payment_terms_days>0 THEN customer.payment_terms_days ELSE shop.default_credit_days END
            END
    );

    INSERT INTO public.sale_items (
        sale_id,product_id,name,sku,quantity,unit_price,original_price,unit_cost,total_price,discount_amount,tax_amount
    )
    WITH products AS (
        SELECT *,sum(line_gross) OVER (ORDER BY product_id) AS running_gross
        FROM jsonb_to_recordset(lines) AS l(
            product_id uuid,name text,sku text,quantity numeric,unit_price numeric,unit_cost numeric,
            line_gross numeric,tax_class public.tax_class
        )
    ), discounts AS (
        SELECT *,coalesce(round(discount*running_gross/nullif(gross_before_discount,0),2)
              - round(discount*(running_gross-line_gross)/nullif(gross_before_discount,0),2),0) AS item_discount
        FROM products
    )
    SELECT p_sale,product_id,name,sku,quantity,unit_price,unit_price,unit_cost,line_gross-item_discount,item_discount,
        CASE WHEN tax_class='standard' AND shop.tax_rate>0
            THEN round((line_gross-item_discount)*shop.tax_rate/(100+shop.tax_rate),2) ELSE 0 END
    FROM discounts ORDER BY product_id;

    INSERT INTO public.sale_payments (sale_id,payment_method,amount,tendered_amount,reference)
    SELECT p_sale,method,amount,tendered,reference
    FROM jsonb_to_recordset(validated_payments) AS p(method text,amount numeric,tendered numeric,reference text);
    INSERT INTO public.receipts (sale_id,receipt_number) VALUES (p_sale,'KPS-' || number_suffix);
    RETURN p_sale;
END;
$$;

ALTER POLICY pos_catalog_images_write ON storage.objects
    WITH CHECK (bucket_id='pos-product-images' AND (SELECT public.is_manager_or_above())
        AND EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id::text=(storage.foldername(objects.name))[1] AND NOT p.is_deleted
        ));

-- Credit triggers run from checkout routines with an empty search path.
ALTER FUNCTION public.check_credit_limit() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_customer_credit() SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.pos_sales_page(
    p_branch uuid,p_start date,p_end date,p_status text,p_method text,p_search text,p_employee uuid,p_offset int
) RETURNS TABLE (
    id uuid,sale_number text,created_at timestamptz,status public.sale_status,total_amount numeric,
    customer_name text,cashier_name text,receipt_number text,methods text[],void_reason text,total_rows bigint
) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    time_zone text;
    pattern text := '%' || replace(replace(replace(coalesce(btrim(p_search),''), '\', '\\'),'%','\%'),'_','\_') || '%';
BEGIN
    IF public.is_cashier_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Sales permissions are required' USING ERRCODE='42501';
    END IF;
    IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_offset NOT BETWEEN 0 AND 100000 THEN
        RAISE EXCEPTION 'Enter a valid sales period';
    END IF;
    SELECT s.timezone INTO STRICT time_zone FROM public.shop_settings s ORDER BY s.created_at,s.id LIMIT 1;
    RETURN QUERY WITH matching AS (
        SELECT s.id,s.sale_number,s.created_at,s.status,s.total_amount,s.void_reason,
            coalesce(s.customer_name,c.name) AS customer,coalesce(s.cashier_name,u.full_name) AS cashier
        FROM public.sales s
        LEFT JOIN public.customers c ON c.id=s.customer_id
        LEFT JOIN public.users u ON u.id=s.cashier_id
        WHERE s.branch_id=p_branch AND NOT s.is_deleted
            AND s.status IN ('completed','voided','refunded')
            AND s.created_at>=p_start::timestamp AT TIME ZONE time_zone
            AND s.created_at<(p_end+1)::timestamp AT TIME ZONE time_zone
            AND (p_status IS NULL OR s.status::text=p_status)
            AND (p_employee IS NULL OR s.cashier_id=p_employee)
            AND (p_method IS NULL OR EXISTS (
                SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id=s.id AND sp.payment_method=p_method
            ))
            AND (nullif(btrim(p_search),'') IS NULL OR s.sale_number ILIKE pattern
                OR coalesce(s.customer_name,c.name) ILIKE pattern OR coalesce(s.cashier_name,u.full_name) ILIKE pattern
                OR EXISTS (SELECT 1 FROM public.receipts r WHERE r.sale_id=s.id AND r.receipt_number ILIKE pattern)
                OR EXISTS (SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id=s.id AND sp.reference ILIKE pattern))
    ), page AS (
        SELECT m.*,count(*) OVER () AS rows_found FROM matching m
        ORDER BY m.created_at DESC,m.id OFFSET p_offset LIMIT 30
    )
    SELECT m.id,m.sale_number,m.created_at,m.status,m.total_amount,m.customer,m.cashier,
           (SELECT r.receipt_number FROM public.receipts r WHERE r.sale_id=m.id AND r.type='sale' ORDER BY r.created_at,r.id LIMIT 1),
           ARRAY(SELECT DISTINCT p.payment_method FROM public.sale_payments p WHERE p.sale_id=m.id ORDER BY p.payment_method),
           m.void_reason,m.rows_found
    FROM page m ORDER BY m.created_at DESC,m.id;
END;
$$;
