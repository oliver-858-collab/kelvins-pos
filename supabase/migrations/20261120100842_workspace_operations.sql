-- Staff registration creates a pending profile. Role approval belongs to an existing administrator.
DROP TRIGGER IF EXISTS kelvin_first_owner ON auth.users;
DROP TRIGGER IF EXISTS kelvin_confirmed_staff_profile ON auth.users;
CREATE OR REPLACE FUNCTION kelvin_private.create_pending_staff_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.email IS NOT NULL
       AND NEW.raw_user_meta_data ->> 'kelvin_staff_request' = 'true'
       AND length(btrim(NEW.raw_user_meta_data ->> 'full_name')) BETWEEN 1 AND 120 THEN
        INSERT INTO public.users (id, email, full_name, account_status)
        VALUES (NEW.id, NEW.email, btrim(NEW.raw_user_meta_data ->> 'full_name'), 'pending')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER kelvin_staff_profile_on_signup
    AFTER INSERT ON auth.users FOR EACH ROW
    EXECUTE FUNCTION kelvin_private.create_pending_staff_profile();

INSERT INTO public.users (id, email, full_name, account_status)
SELECT id, email, btrim(raw_user_meta_data ->> 'full_name'), 'pending'
FROM auth.users
WHERE email IS NOT NULL
  AND raw_user_meta_data ->> 'kelvin_staff_request' = 'true'
  AND length(btrim(raw_user_meta_data ->> 'full_name')) BETWEEN 1 AND 120
ON CONFLICT DO NOTHING;

CREATE POLICY shop_settings_storekeeper_read ON public.shop_settings
    FOR SELECT TO authenticated USING (public.current_user_role() = 'storekeeper');
CREATE POLICY branches_storekeeper_read ON public.branches
    FOR SELECT TO authenticated USING (public.current_user_role() = 'storekeeper');
CREATE POLICY product_images_storekeeper_read ON public.product_images
    FOR SELECT TO authenticated USING (public.current_user_role() = 'storekeeper');
ALTER TABLE public.product_images ADD COLUMN storage_path text UNIQUE;

CREATE INDEX IF NOT EXISTS pos_ledger_by_product_branch
    ON public.stock_entries (product_id, branch_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS pos_movements_by_branch
    ON public.stock_entries (branch_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS pos_sales_by_branch_date
    ON public.sales (branch_id, created_at DESC, id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS pos_sales_by_customer_date
    ON public.sales (customer_id, created_at DESC, id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS pos_payments_by_sale_method
    ON public.sale_payments (sale_id, payment_method);
CREATE INDEX IF NOT EXISTS pos_attendance_by_date
    ON public.attendance (date DESC, employee_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pos-product-images', 'pos-product-images', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY pos_catalog_images_read ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'pos-product-images'
           AND (SELECT public.current_user_role()) IN ('super_admin', 'manager', 'cashier', 'storekeeper'));
CREATE POLICY pos_catalog_images_write ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'pos-product-images' AND (SELECT public.is_manager_or_above())
      AND EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id::text = (storage.foldername(name))[1] AND NOT p.is_deleted
      ));
CREATE POLICY pos_catalog_images_remove ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'pos-product-images' AND (SELECT public.is_manager_or_above()));

CREATE FUNCTION public.manage_product_image(p_product uuid, p_path text, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    primary_path text;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'A manager or administrator account is required' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.products WHERE id=p_product AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This product is unavailable'; END IF;
    IF p_path IS NULL OR split_part(p_path,'/',1) <> p_product::text THEN
        RAISE EXCEPTION 'This file does not belong to the product';
    END IF;

    IF p_action = 'attach' THEN
        IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='pos-product-images' AND name=p_path) THEN
            RAISE EXCEPTION 'Upload the file before attaching it';
        END IF;
        INSERT INTO public.product_images (product_id,url,storage_path,is_primary)
        VALUES (p_product,p_path,p_path,NOT EXISTS (
            SELECT 1 FROM public.product_images WHERE product_id=p_product AND is_primary
        )) ON CONFLICT (storage_path) DO NOTHING;
    ELSIF p_action = 'primary' THEN
        IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id=p_product AND storage_path=p_path) THEN
            RAISE EXCEPTION 'This image is unavailable';
        END IF;
        UPDATE public.product_images SET is_primary = coalesce(storage_path = p_path, false) WHERE product_id=p_product;
    ELSIF p_action = 'remove' THEN
        DELETE FROM public.product_images WHERE product_id=p_product AND storage_path=p_path;
        IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id=p_product AND is_primary) THEN
            SELECT storage_path INTO primary_path FROM public.product_images
            WHERE product_id=p_product ORDER BY sort_order, created_at, id LIMIT 1;
            UPDATE public.product_images SET is_primary = true
            WHERE product_id=p_product AND storage_path=primary_path;
        END IF;
    ELSE
        RAISE EXCEPTION 'Choose a valid image action';
    END IF;
END;
$$;

CREATE FUNCTION public.save_inventory_product(p_id uuid, p_branch uuid, p_product jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    details record;
    previous public.products%ROWTYPE;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can change the catalog' USING ERRCODE='42501';
    END IF;
    IF p_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch and product';
    END IF;

    SELECT * INTO details FROM jsonb_to_record(p_product) AS d(
        name text, sku text, barcode text, brand text, category_id uuid, supplier_id uuid,
        location_shelf text, description text, selling_price numeric, buying_price numeric,
        min_price numeric, tax_class public.tax_class, track_stock boolean, is_active boolean,
        reorder_level int, reorder_qty int, opening_stock numeric
    );
    IF details.name IS NULL OR length(btrim(details.name)) NOT BETWEEN 1 AND 120
        OR length(coalesce(details.sku,'')) > 80 OR length(coalesce(details.barcode,'')) > 100
        OR length(coalesce(details.brand,'')) > 120 OR length(coalesce(details.location_shelf,'')) > 100
        OR length(coalesce(details.description,'')) > 1500
        OR details.selling_price IS NULL OR details.selling_price NOT BETWEEN 0 AND 9999999999.99
        OR details.buying_price IS NULL OR details.buying_price NOT BETWEEN 0 AND 9999999999.99
        OR details.selling_price <> round(details.selling_price,2)
        OR details.buying_price <> round(details.buying_price,2)
        OR details.min_price NOT BETWEEN 0 AND details.selling_price
        OR details.min_price <> round(details.min_price,2)
        OR details.tax_class IS NULL OR details.track_stock IS NULL OR details.is_active IS NULL
        OR details.reorder_level IS NULL OR details.reorder_level NOT BETWEEN 0 AND 99999999
        OR details.reorder_qty IS NULL OR details.reorder_qty NOT BETWEEN 0 AND 99999999
        OR details.opening_stock NOT BETWEEN 0 AND 99999999
        OR details.opening_stock <> round(details.opening_stock,4)
        OR (NOT details.track_stock AND coalesce(details.opening_stock,0) > 0) THEN
        RAISE EXCEPTION 'Enter valid product details and nonnegative stock values';
    END IF;
    IF details.category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.categories WHERE id=details.category_id AND type='product'
    ) THEN RAISE EXCEPTION 'Choose a product category'; END IF;
    IF details.supplier_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.suppliers WHERE id=details.supplier_id
    ) THEN RAISE EXCEPTION 'Choose an existing supplier'; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('pos-product:' || p_id::text,0));
    SELECT * INTO previous FROM public.products WHERE id=p_id FOR UPDATE;
    IF FOUND THEN
        IF previous.is_deleted OR (previous.branch_id IS NOT NULL AND previous.branch_id <> p_branch) THEN
            RAISE EXCEPTION 'This product is unavailable at this branch';
        END IF;
        UPDATE public.products SET
            name=btrim(details.name), sku=nullif(btrim(details.sku),''), barcode=nullif(btrim(details.barcode),''),
            brand=nullif(btrim(details.brand),''), category_id=details.category_id, supplier_id=details.supplier_id,
            location_shelf=nullif(btrim(details.location_shelf),''), description=nullif(btrim(details.description),''),
            selling_price=details.selling_price, buying_price=details.buying_price, min_price=details.min_price,
            tax_class=details.tax_class, track_stock=details.track_stock, is_active=details.is_active,
            reorder_level=details.reorder_level, reorder_qty=details.reorder_qty
        WHERE id=p_id;
    ELSE
        INSERT INTO public.products (
            id,branch_id,name,sku,barcode,brand,category_id,supplier_id,location_shelf,description,
            selling_price,buying_price,min_price,tax_class,track_stock,is_active,reorder_level,reorder_qty,created_by
        ) VALUES (
            p_id,p_branch,btrim(details.name),nullif(btrim(details.sku),''),nullif(btrim(details.barcode),''),
            nullif(btrim(details.brand),''),details.category_id,details.supplier_id,nullif(btrim(details.location_shelf),''),
            nullif(btrim(details.description),''),details.selling_price,details.buying_price,details.min_price,
            details.tax_class,details.track_stock,details.is_active,details.reorder_level,details.reorder_qty,auth.uid()
        );
        IF details.opening_stock > 0 THEN
            INSERT INTO public.stock_entries (
                product_id,branch_id,type,qty_in,qty_on_hand,buying_price,supplier_id,created_by,notes
            ) VALUES (
                p_id,p_branch,'adjustment',details.opening_stock,details.opening_stock,
                details.buying_price,details.supplier_id,auth.uid(),'Opening stock'
            );
        END IF;
    END IF;
    RETURN p_id;
END;
$$;

CREATE FUNCTION kelvin_private.post_inventory_movement(p_id uuid, p_branch uuid, p_product uuid, p_movement jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    movement record;
    product public.products%ROWTYPE;
    prior public.stock_entries%ROWTYPE;
    balance numeric;
    quantity_change numeric;
    stock_type public.stock_entry_type;
    movement_notes text;
    count_id uuid;
BEGIN
    IF auth.uid() IS NULL OR public.is_storekeeper_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Inventory permissions are required' USING ERRCODE='42501';
    END IF;
    IF p_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch and movement';
    END IF;

    SELECT * INTO movement FROM jsonb_to_record(p_movement) AS m(
        mode text, quantity numeric, reason text, notes text, reference text,
        unit_cost numeric, supplier_id uuid, batch text, expires_on date
    );
    IF movement.mode IS NULL OR movement.mode NOT IN ('receive','issue','count')
        OR movement.quantity IS NULL OR movement.quantity NOT BETWEEN 0 AND 99999999
        OR movement.quantity <> round(movement.quantity,4)
        OR (movement.mode <> 'count' AND movement.quantity = 0)
        OR (movement.mode='issue' AND coalesce(movement.reason,'') NOT IN ('Damage','Loss','Expiry','Correction','Supplier return'))
        OR length(coalesce(movement.notes,'')) > 1000 OR length(coalesce(movement.reference,'')) > 120
        OR length(coalesce(movement.batch,'')) > 120
        OR movement.unit_cost NOT BETWEEN 0 AND 9999999999.99
        OR movement.unit_cost <> round(movement.unit_cost,2) THEN
        RAISE EXCEPTION 'Enter a valid quantity and movement details';
    END IF;

    SELECT * INTO product FROM public.products
    WHERE id=p_product AND NOT is_deleted AND track_stock AND (branch_id IS NULL OR branch_id=p_branch)
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This product does not track stock at the selected branch'; END IF;
    SELECT * INTO prior FROM public.stock_entries WHERE id=p_id;
    IF FOUND THEN
        IF prior.product_id=p_product AND prior.branch_id=p_branch AND prior.created_by=auth.uid() THEN
            RETURN prior.qty_on_hand;
        END IF;
        RAISE EXCEPTION 'This movement identifier is already in use';
    END IF;

    SELECT coalesce(sum(qty_in - qty_out),0) INTO balance
    FROM public.stock_entries WHERE product_id=p_product AND branch_id=p_branch;
    stock_type := CASE WHEN movement.mode='receive' THEN 'purchase' ELSE 'adjustment' END;
    quantity_change := CASE movement.mode
        WHEN 'count' THEN movement.quantity - balance
        WHEN 'issue' THEN -movement.quantity
        ELSE movement.quantity
    END;
    IF movement.mode='issue' AND balance + quantity_change < 0 THEN
        RAISE EXCEPTION 'Only % units are available', greatest(balance,0);
    END IF;
    movement_notes := concat_ws(' · ',CASE movement.mode
        WHEN 'count' THEN 'Counted ' || movement.quantity::text || ' (expected ' || balance::text || ')'
        WHEN 'issue' THEN movement.reason
        ELSE 'Stock received' END,nullif(btrim(movement.notes),''));

    IF movement.mode='count' THEN
        INSERT INTO public.stock_takes (branch_id,completed_at,status,created_by,notes)
        VALUES (p_branch,now(),'completed',auth.uid(),movement_notes) RETURNING id INTO count_id;
        INSERT INTO public.stock_take_items (stock_take_id,product_id,expected_qty,counted_qty,notes)
        VALUES (count_id,p_product,balance,movement.quantity,nullif(btrim(movement.notes),''));
    END IF;

    INSERT INTO public.stock_entries (
        id,product_id,branch_id,type,qty_in,qty_out,qty_on_hand,buying_price,supplier_id,
        reference,batch_number,expiry_date,created_by,notes
    ) VALUES (
        p_id,p_product,p_branch,stock_type,greatest(quantity_change,0),greatest(-quantity_change,0),balance+quantity_change,
        coalesce(movement.unit_cost,product.buying_price),CASE WHEN movement.mode='receive' THEN coalesce(movement.supplier_id,product.supplier_id) END,
        coalesce(count_id::text,nullif(btrim(movement.reference),'')),nullif(btrim(movement.batch),''),
        movement.expires_on,auth.uid(),movement_notes
    );
    RETURN balance + quantity_change;
END;
$$;

CREATE FUNCTION public.post_inventory_movement(p_id uuid,p_branch uuid,p_product uuid,p_movement jsonb)
RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.post_inventory_movement(p_id,p_branch,p_product,p_movement);
$$;

-- Keep historical prices and costs on the sale. Older sales have unknown historical cost.
ALTER TABLE public.sale_items ADD COLUMN unit_cost numeric(12,2);
ALTER TABLE public.sales ADD COLUMN customer_name text;
ALTER TABLE public.sales ADD COLUMN cashier_name text;
ALTER TABLE public.sale_payments ADD COLUMN tendered_amount numeric(12,2);

DROP POLICY customers_cashier_all ON public.customers;
CREATE POLICY customers_cashier_read ON public.customers FOR SELECT TO authenticated
    USING (public.current_user_role()='cashier');
CREATE POLICY customers_cashier_insert ON public.customers FOR INSERT TO authenticated
    WITH CHECK (public.current_user_role()='cashier' AND created_by=(SELECT auth.uid())
        AND credit_limit=0 AND credit_used=0 AND payment_terms_days=0 AND is_active);
DROP POLICY customer_payments_cashier_all ON public.customer_payments;

CREATE FUNCTION kelvin_private.complete_pos_sale(
    p_sale uuid, p_branch uuid, p_items jsonb, p_payments jsonb, p_details jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    staff_id uuid := auth.uid();
    staff_name text;
    previous public.sales%ROWTYPE;
    shop public.shop_settings%ROWTYPE;
    product public.products%ROWTYPE;
    customer public.customers%ROWTYPE;
    customer_id uuid := nullif(p_details->>'customer_id','')::uuid;
    discount numeric := coalesce((p_details->>'discount')::numeric,0);
    sale_notes text := nullif(btrim(p_details->>'notes'),'');
    item record;
    line record;
    payment record;
    lines jsonb := '[]';
    validated_payments jsonb := '[]';
    stock_balance numeric;
    line_gross numeric;
    gross_before_discount numeric := 0;
    gross_to_line numeric := 0;
    discounts_to_line numeric := 0;
    line_discount numeric;
    line_tax numeric;
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
        line_gross := round(product.selling_price*item.quantity,2);
        gross_before_discount := gross_before_discount+line_gross;
        lines := lines || jsonb_build_object(
            'product_id',product.id,'name',product.name,'sku',product.sku,'quantity',item.quantity,
            'unit_price',product.selling_price,'unit_cost',product.buying_price,
            'min_price',product.min_price,'line_gross',line_gross,'tax_class',product.tax_class
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
            IF jsonb_array_length(p_payments)<>1 OR customer_id IS NULL OR NOT shop.allow_credit_sales OR total=0 THEN
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
    IF customer_id IS NOT NULL THEN
        SELECT c.* INTO customer FROM public.customers c WHERE c.id=complete_pos_sale.customer_id AND c.is_active FOR UPDATE;
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

CREATE FUNCTION public.complete_pos_sale(p_sale uuid,p_branch uuid,p_items jsonb,p_payments jsonb,p_details jsonb)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.complete_pos_sale(p_sale,p_branch,p_items,p_payments,p_details);
$$;

CREATE OR REPLACE FUNCTION kelvin_private.record_checkout(
    p_sale_id uuid,p_branch_id uuid,p_items jsonb,p_method text,p_cash_received numeric,p_reference text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.complete_pos_sale(p_sale_id,p_branch_id,p_items,
        jsonb_build_array(jsonb_build_object('method',p_method,'tendered',p_cash_received,'reference',p_reference)),'{}');
$$;

CREATE FUNCTION public.void_pos_sale(p_sale uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    sale public.sales%ROWTYPE;
    entry record;
    balance numeric;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can void sales' USING ERRCODE='42501';
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 300 THEN
        RAISE EXCEPTION 'Enter a reason between 3 and 300 characters';
    END IF;
    SELECT * INTO sale FROM public.sales WHERE id=p_sale AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This sale could not be found'; END IF;
    IF sale.status='voided' THEN RETURN; END IF;
    IF sale.status<>'completed' THEN RAISE EXCEPTION 'Only a completed sale can be voided'; END IF;
    IF sale.is_credit AND sale.amount_paid>0 THEN
        RAISE EXCEPTION 'An on-account sale with recorded repayments cannot be voided here';
    END IF;
    PERFORM 1 FROM public.products p WHERE p.id IN (
        SELECT product_id FROM public.stock_entries
        WHERE branch_id=sale.branch_id AND reference=p_sale::text AND type='sale'
    ) ORDER BY p.id FOR UPDATE;
    IF sale.is_credit AND sale.customer_id IS NOT NULL THEN
        PERFORM 1 FROM public.customers WHERE id=sale.customer_id FOR UPDATE;
    END IF;

    -- Restore what was actually deducted, even if product tracking settings changed later.
    FOR entry IN
        SELECT product_id,variant_id,sum(qty_out-qty_in) AS quantity FROM public.stock_entries
        WHERE branch_id=sale.branch_id AND reference=p_sale::text AND type='sale'
        GROUP BY product_id,variant_id HAVING sum(qty_out-qty_in)>0 ORDER BY product_id,variant_id
    LOOP
        SELECT coalesce(sum(qty_in-qty_out),0) INTO balance FROM public.stock_entries
        WHERE product_id=entry.product_id AND branch_id=sale.branch_id;
        INSERT INTO public.stock_entries (
            product_id,variant_id,branch_id,qty_in,qty_on_hand,type,reference,created_by,notes
        ) VALUES (
            entry.product_id,entry.variant_id,sale.branch_id,entry.quantity,balance+entry.quantity,
            'return',p_sale::text,auth.uid(),'Voided ' || sale.sale_number
        );
    END LOOP;
    UPDATE public.sales SET status='voided',voided_by=auth.uid(),voided_at=now(),void_reason=btrim(p_reason)
    WHERE id=p_sale;
END;
$$;

CREATE FUNCTION public.record_customer_collection(
    p_id uuid,p_customer uuid,p_sale uuid,p_amount numeric,p_method text,p_reference text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    credit_sale public.sales%ROWTYPE;
    existing public.customer_payments%ROWTYPE;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can record collections' USING ERRCODE='42501';
    END IF;
    IF p_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
       OR p_method IS NULL OR p_method NOT IN ('cash','mpesa','card')
       OR (p_method<>'cash' AND nullif(btrim(p_reference),'') IS NULL)
       OR length(coalesce(p_reference,''))>120 THEN
        RAISE EXCEPTION 'Enter the amount received and payment details';
    END IF;
    SELECT * INTO credit_sale FROM public.sales
    WHERE id=p_sale AND customer_id=p_customer AND is_credit AND status='completed' AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an open on-account sale'; END IF;
    SELECT * INTO existing FROM public.customer_payments WHERE id=p_id;
    IF FOUND THEN
        IF existing.customer_id=p_customer AND existing.sale_id=p_sale THEN RETURN p_id; END IF;
        RAISE EXCEPTION 'This collection identifier is already in use';
    END IF;
    IF p_amount>credit_sale.total_amount-credit_sale.amount_paid THEN
        RAISE EXCEPTION 'Amount exceeds this sale’s outstanding balance';
    END IF;
    PERFORM 1 FROM public.customers WHERE id=p_customer FOR UPDATE;
    INSERT INTO public.customer_payments (
        id,customer_id,sale_id,amount,payment_method,reference,created_by
    ) VALUES (p_id,p_customer,p_sale,p_amount,p_method,nullif(btrim(p_reference),''),auth.uid());
    UPDATE public.sales SET amount_paid=amount_paid+p_amount WHERE id=p_sale;
    UPDATE public.customers SET credit_used=greatest(0,credit_used-p_amount) WHERE id=p_customer;
    RETURN p_id;
END;
$$;

CREATE FUNCTION public.pos_sales_report(p_branch uuid,p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    time_zone text;
    from_time timestamptz;
    until_time timestamptz;
    compare_from timestamptz;
    report jsonb;
BEGIN
    IF public.is_cashier_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Sales permissions are required' USING ERRCODE='42501';
    END IF;
    IF p_start IS NULL OR p_end IS NULL OR p_end-p_start NOT BETWEEN 0 AND 365 THEN
        RAISE EXCEPTION 'Choose a report period of up to 366 days';
    END IF;
    SELECT timezone INTO STRICT time_zone FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
    from_time := p_start::timestamp AT TIME ZONE time_zone;
    until_time := (p_end+1)::timestamp AT TIME ZONE time_zone;
    compare_from := (p_start-(p_end-p_start+1))::timestamp AT TIME ZONE time_zone;

    WITH sale_period AS MATERIALIZED (
        SELECT id,created_at,status,total_amount,amount_paid,tax_amount,discount_amount,
               is_credit,customer_id,cashier_id,cashier_name
        FROM public.sales
        WHERE branch_id=p_branch AND NOT is_deleted AND created_at>=from_time AND created_at<until_time
    ), completed AS MATERIALIZED (
        SELECT * FROM sale_period WHERE status='completed'
    ), line_items AS MATERIALIZED (
        SELECT i.* FROM completed c JOIN public.sale_items i ON i.sale_id=c.id
    ), daily_actual AS (
        SELECT (created_at AT TIME ZONE time_zone)::date AS day,sum(total_amount) AS revenue,count(*) AS orders
        FROM completed GROUP BY 1
    ), daily AS (
        SELECT p_start+period_day AS day,coalesce(a.revenue,0) AS revenue,coalesce(a.orders,0) AS orders
        FROM generate_series(0,p_end-p_start) AS series(period_day)
        LEFT JOIN daily_actual a ON a.day=p_start+period_day
    ), payments AS (
        SELECT p.payment_method AS method,sum(p.amount) AS amount,count(*) AS transactions
        FROM completed c JOIN public.sale_payments p ON p.sale_id=c.id
        GROUP BY p.payment_method
    ), popular AS (
        SELECT product_id,max(name) AS name,sum(quantity) AS quantity,sum(total_price) AS revenue
        FROM line_items GROUP BY product_id,CASE WHEN product_id IS NULL THEN name END
        ORDER BY revenue DESC,name LIMIT 12
    ), performers AS (
        SELECT cashier_id,coalesce(max(c.cashier_name),max(u.full_name),'Staff member') AS name,
               count(*) AS orders,sum(total_amount) AS revenue
        FROM completed c LEFT JOIN public.users u ON u.id=c.cashier_id
        GROUP BY cashier_id ORDER BY revenue DESC,name LIMIT 20
    ), stock_activity AS (
        SELECT type,sum(qty_in) AS received,sum(qty_out) AS issued,count(*) AS movements
        FROM public.stock_entries WHERE branch_id=p_branch AND created_at>=from_time AND created_at<until_time
        GROUP BY type
    ), prior AS (
        SELECT count(*) AS orders,coalesce(sum(total_amount),0) AS revenue
        FROM public.sales WHERE branch_id=p_branch AND status='completed' AND NOT is_deleted
        AND created_at>=compare_from AND created_at<from_time
    )
    SELECT jsonb_build_object(
        'summary',(SELECT jsonb_build_object(
            'orders',count(*),'revenue',coalesce(sum(total_amount),0),'average',coalesce(round(avg(total_amount),2),0),
            'tax',coalesce(sum(tax_amount),0),'discount',coalesce(sum(discount_amount),0),
            'customers',count(DISTINCT customer_id),
            'credit_outstanding',coalesce(sum(greatest(total_amount-amount_paid,0)) FILTER (WHERE is_credit),0),
            'voided',(SELECT count(*) FROM sale_period WHERE status='voided'),
            'units',(SELECT coalesce(sum(quantity),0) FROM line_items),
            'cost_coverage',(SELECT count(unit_cost) FROM line_items),
            'lines',(SELECT count(*) FROM line_items),
            'tracked_margin',(SELECT coalesce(sum(total_price-tax_amount-round(unit_cost*quantity,2)),0)
                FROM line_items WHERE unit_cost IS NOT NULL)
        ) FROM completed),
        'prior',(SELECT to_jsonb(prior) FROM prior),
        'daily',coalesce((SELECT jsonb_agg(to_jsonb(daily) ORDER BY day) FROM daily),'[]'),
        'payments',coalesce((SELECT jsonb_agg(to_jsonb(payments) ORDER BY amount DESC,method) FROM payments),'[]'),
        'products',coalesce((SELECT jsonb_agg(to_jsonb(popular) ORDER BY revenue DESC,name) FROM popular),'[]'),
        'staff',coalesce((SELECT jsonb_agg(to_jsonb(performers) ORDER BY revenue DESC,name) FROM performers),'[]'),
        'stock',coalesce((SELECT jsonb_agg(to_jsonb(stock_activity) ORDER BY type) FROM stock_activity),'[]')
    ) INTO report;
    RETURN report;
END;
$$;

CREATE FUNCTION public.pos_sales_page(
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
    SELECT timezone INTO STRICT time_zone FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
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

CREATE FUNCTION public.pos_customer_detail(p_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    result jsonb;
BEGIN
    IF public.is_cashier_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Customer permissions are required' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id=p_customer) THEN
        RAISE EXCEPTION 'Customer could not be found';
    END IF;
    WITH sales AS MATERIALIZED (
        SELECT id,sale_number,created_at,status,total_amount,amount_paid,is_credit,credit_due_date
        FROM public.sales WHERE customer_id=p_customer AND NOT is_deleted AND status IN ('completed','voided','refunded')
    ), recent AS (
        SELECT * FROM sales ORDER BY created_at DESC,id LIMIT 30
    ), open_credit AS (
        SELECT * FROM sales WHERE status='completed' AND is_credit AND total_amount>amount_paid
        ORDER BY credit_due_date,id LIMIT 200
    ), collections AS (
        SELECT id,sale_id,amount,payment_method,reference,created_at
        FROM public.customer_payments WHERE customer_id=p_customer ORDER BY created_at DESC,id LIMIT 30
    )
    SELECT jsonb_build_object(
        'orders',(SELECT count(*) FROM sales WHERE status='completed'),
        'spend',(SELECT coalesce(sum(total_amount),0) FROM sales WHERE status='completed'),
        'last_visit',(SELECT max(created_at) FROM sales WHERE status='completed'),
        'recent',coalesce((SELECT jsonb_agg(to_jsonb(recent) ORDER BY created_at DESC,id) FROM recent),'[]'),
        'outstanding',coalesce((SELECT jsonb_agg(to_jsonb(open_credit) ORDER BY credit_due_date,id) FROM open_credit),'[]'),
        'collections',coalesce((SELECT jsonb_agg(to_jsonb(collections) ORDER BY created_at DESC,id) FROM collections),'[]')
    ) INTO result;
    RETURN result;
END;
$$;

ALTER TABLE public.employees ADD COLUMN employment_end date;
ALTER TABLE public.employees ADD COLUMN home_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.attendance ADD COLUMN branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.attendance ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.attendance ADD COLUMN reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.attendance ADD COLUMN shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;
UPDATE public.attendance SET reviewed_at=created_at WHERE reviewed_at IS NULL;
ALTER TABLE public.payroll_items ADD COLUMN compensation_snapshot jsonb;

DROP POLICY shifts_own ON public.shifts;
CREATE POLICY shifts_own ON public.shifts FOR SELECT TO authenticated
    USING (employee_id=(SELECT auth.uid()) AND public.current_user_role() IS NOT NULL);
DROP POLICY attendance_self_insert ON public.attendance;
DROP POLICY leave_self ON public.leave_requests;
CREATE POLICY leave_self_read ON public.leave_requests FOR SELECT TO authenticated
    USING (employee_id=(SELECT auth.uid()) AND public.current_user_role() IS NOT NULL);
CREATE POLICY leave_self_request ON public.leave_requests FOR INSERT TO authenticated
    WITH CHECK (employee_id=(SELECT auth.uid()) AND status='pending' AND approved_by IS NULL
                AND approved_at IS NULL AND public.current_user_role() IS NOT NULL);
DROP POLICY payroll_runs_manager ON public.payroll_runs;
CREATE POLICY payroll_runs_manager ON public.payroll_runs FOR SELECT TO authenticated USING (public.is_manager_or_above());
DROP POLICY payroll_items_manager ON public.payroll_items;
CREATE POLICY payroll_items_manager ON public.payroll_items FOR SELECT TO authenticated USING (public.is_manager_or_above());
DROP POLICY payroll_items_self ON public.payroll_items;
CREATE POLICY payroll_runs_self ON public.payroll_runs FOR SELECT TO authenticated
    USING (status IN ('approved','paid') AND public.current_user_role() IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.payroll_items pi WHERE pi.payroll_run_id=payroll_runs.id AND pi.employee_id=(SELECT auth.uid())));
CREATE POLICY payroll_items_self ON public.payroll_items FOR SELECT TO authenticated
    USING (employee_id=(SELECT auth.uid()) AND public.current_user_role() IS NOT NULL);

CREATE FUNCTION public.save_staff_record(p_employee uuid,p_branch uuid,p_details jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    details record;
BEGIN
    IF public.is_super_admin() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only an administrator can change employment and wage settings' USING ERRCODE='42501';
    END IF;
    SELECT * INTO details FROM jsonb_to_record(p_details) AS d(
        employee_number text,department text,position text,contract_type public.contract_type,
        phone text,start_date date,employment_end date,wage_type public.wage_type,wage_rate numeric,
        commission_rate numeric,pay_period public.pay_period_type
    );
    IF details.employee_number IS NULL OR length(btrim(details.employee_number)) NOT BETWEEN 1 AND 60
        OR length(coalesce(details.department,''))>100 OR length(coalesce(details.position,''))>100
        OR length(coalesce(details.phone,''))>50
        OR details.contract_type IS NULL OR details.start_date IS NULL OR details.wage_type IS NULL
        OR details.employment_end<details.start_date
        OR details.wage_rate IS NULL OR details.wage_rate NOT BETWEEN 0 AND 9999999999.99
        OR details.wage_rate<>round(details.wage_rate,2) OR details.commission_rate IS NULL
        OR details.commission_rate NOT BETWEEN 0 AND 100 OR details.commission_rate<>round(details.commission_rate,2)
        OR details.pay_period IS NULL OR (details.wage_type='monthly' AND details.pay_period<>'monthly')
        OR (details.wage_type='weekly' AND details.pay_period='monthly') THEN
        RAISE EXCEPTION 'Check the employee details and choose a pay cycle that matches the wage type';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose the employee’s active home branch';
    END IF;
    PERFORM 1 FROM public.users WHERE id=p_employee AND role_id IS NOT NULL AND account_status IN ('active','suspended') AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approve this staff account before setting up employment'; END IF;

    INSERT INTO public.employees (id,home_branch_id,employee_number,department,position,contract_type,employment_end)
    VALUES (p_employee,p_branch,btrim(details.employee_number),nullif(btrim(details.department),''),
            nullif(btrim(details.position),''),details.contract_type,details.employment_end)
    ON CONFLICT (id) DO UPDATE SET home_branch_id=EXCLUDED.home_branch_id,employee_number=EXCLUDED.employee_number,
        department=EXCLUDED.department,position=EXCLUDED.position,contract_type=EXCLUDED.contract_type,employment_end=EXCLUDED.employment_end;
    UPDATE public.users SET phone=nullif(btrim(details.phone),''),start_date=details.start_date,wage_type=details.wage_type,
        wage_rate=details.wage_rate,commission_rate=details.commission_rate,pay_period=details.pay_period
    WHERE id=p_employee;
    RETURN p_employee;
END;
$$;

CREATE FUNCTION kelvin_private.staff_clock(p_branch uuid,p_event text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    staff_id uuid := auth.uid();
    today date;
    work public.attendance%ROWTYPE;
    shift uuid;
    entry uuid;
BEGIN
    IF staff_id IS NULL OR public.current_user_role() IS NULL THEN
        RAISE EXCEPTION 'An active staff account is required' USING ERRCODE='42501';
    END IF;
    PERFORM 1 FROM public.employees WHERE id=staff_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ask your administrator to create your employee record'; END IF;

    SELECT * INTO work FROM public.attendance WHERE employee_id=staff_id AND shift_id IS NOT NULL
        AND clock_out IS NULL ORDER BY date DESC LIMIT 1 FOR UPDATE;
    IF p_event='out' THEN
        IF work.id IS NULL THEN RAISE EXCEPTION 'There is no open shift to close'; END IF;
        UPDATE public.attendance SET clock_out=now(),reviewed_by=NULL,reviewed_at=NULL WHERE id=work.id;
        UPDATE public.shifts SET end_time=now(),status='closed' WHERE id=work.shift_id;
        RETURN work.id;
    END IF;
    IF p_event IS DISTINCT FROM 'in' THEN RAISE EXCEPTION 'Choose clock in or clock out'; END IF;
    IF work.id IS NOT NULL THEN RETURN work.id; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch';
    END IF;
    SELECT (now() AT TIME ZONE timezone)::date INTO STRICT today FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
    IF EXISTS (SELECT 1 FROM public.attendance WHERE employee_id=staff_id AND date=today) THEN
        RAISE EXCEPTION 'Attendance is already recorded today. Ask your manager to correct it if needed';
    END IF;
    INSERT INTO public.shifts (employee_id,branch_id,start_time)
    VALUES (staff_id,p_branch,now()) RETURNING id INTO shift;
    INSERT INTO public.attendance (employee_id,branch_id,date,clock_in,shift_id)
    VALUES (staff_id,p_branch,today,now(),shift) RETURNING id INTO entry;
    RETURN entry;
END;
$$;

CREATE FUNCTION public.staff_clock(p_branch uuid,p_event text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.staff_clock(p_branch,p_event);
$$;

CREATE FUNCTION public.save_staff_attendance(
    p_employee uuid,p_branch uuid,p_day date,p_status public.attendance_status,
    p_clock_in time,p_clock_out time,p_break_minutes int,p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    start_at timestamptz;
    end_at timestamptz;
    time_zone text;
    result uuid;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can verify attendance' USING ERRCODE='42501';
    END IF;
    SELECT timezone INTO STRICT time_zone FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
    IF p_day IS NULL OR p_day>(now() AT TIME ZONE time_zone)::date OR p_status IS NULL
        OR p_break_minutes IS NULL OR p_break_minutes NOT BETWEEN 0 AND 360
        OR length(coalesce(p_notes,''))>500 OR NOT EXISTS (
            SELECT 1 FROM public.branches WHERE id=p_branch AND is_active
        ) THEN RAISE EXCEPTION 'Enter valid attendance details and a current or past date'; END IF;
    PERFORM 1 FROM public.employees WHERE id=p_employee FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an employee record'; END IF;

    IF p_status IN ('present','late','half_day') THEN
        IF p_clock_in IS NULL OR p_clock_out IS NULL OR p_clock_in=p_clock_out THEN
            RAISE EXCEPTION 'Enter clock-in and clock-out times for a worked day';
        END IF;
        start_at := (p_day+p_clock_in) AT TIME ZONE time_zone;
        end_at := (p_day+(p_clock_out<p_clock_in)::int+p_clock_out) AT TIME ZONE time_zone;
        IF end_at>now() OR end_at-start_at<=make_interval(mins=>p_break_minutes) THEN
            RAISE EXCEPTION 'Check the shift end time and break duration';
        END IF;
    ELSIF p_break_minutes<>0 THEN
        RAISE EXCEPTION 'Breaks can only be recorded on worked days';
    END IF;

    INSERT INTO public.attendance (
        employee_id,branch_id,date,status,clock_in,clock_out,break_start,break_end,notes,reviewed_at,reviewed_by
    ) VALUES (
        p_employee,p_branch,p_day,p_status,start_at,end_at,start_at,
        CASE WHEN start_at IS NOT NULL THEN start_at+make_interval(mins=>p_break_minutes) END,
        nullif(btrim(p_notes),''),now(),auth.uid()
    ) ON CONFLICT (employee_id,date) DO UPDATE SET
        branch_id=EXCLUDED.branch_id,status=EXCLUDED.status,clock_in=EXCLUDED.clock_in,clock_out=EXCLUDED.clock_out,
        break_start=EXCLUDED.break_start,break_end=EXCLUDED.break_end,notes=EXCLUDED.notes,
        reviewed_at=EXCLUDED.reviewed_at,reviewed_by=EXCLUDED.reviewed_by
    WHERE attendance.shift_id IS NULL OR attendance.clock_out IS NOT NULL
    RETURNING id INTO result;
    IF result IS NULL THEN RAISE EXCEPTION 'Close the active shift before editing its attendance'; END IF;
    RETURN result;
END;
$$;

CREATE FUNCTION public.review_staff_attendance(p_entry uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can verify attendance' USING ERRCODE='42501';
    END IF;
    UPDATE public.attendance SET reviewed_at=now(),reviewed_by=auth.uid()
    WHERE id=p_entry AND (clock_out IS NOT NULL OR status NOT IN ('present','late','half_day'));
    IF NOT FOUND THEN RAISE EXCEPTION 'Close the shift before approving it'; END IF;
END;
$$;

CREATE FUNCTION kelvin_private.update_payroll_totals(p_run uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    UPDATE public.payroll_runs r SET
        total_gross=t.gross,total_net=t.net,total_deductions=t.gross-t.net
    FROM (
        SELECT coalesce(sum(gross_pay),0) AS gross,coalesce(sum(net_pay),0) AS net
        FROM public.payroll_items WHERE payroll_run_id=p_run
    ) t WHERE r.id=p_run;
$$;

CREATE FUNCTION public.draft_staff_payroll(p_run uuid,p_branch uuid,p_start date,p_end date,p_cycle public.pay_period_type)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    shop_timezone text;
    roster_count integer;
    duration integer := p_end-p_start+1;
    prior public.payroll_runs%ROWTYPE;
BEGIN
    IF public.is_super_admin() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only an administrator can create wage runs' USING ERRCODE='42501';
    END IF;
    SELECT timezone INTO STRICT shop_timezone FROM public.shop_settings ORDER BY created_at,id LIMIT 1;
    IF p_run IS NULL OR p_start IS NULL OR p_end IS NULL OR p_cycle IS NULL
       OR p_end>(now() AT TIME ZONE shop_timezone)::date
       OR (p_cycle='weekly' AND duration<>7) OR (p_cycle='biweekly' AND duration<>14)
       OR (p_cycle='monthly' AND (extract(day FROM p_start)<>1 OR p_end<>(p_start+interval '1 month - 1 day')::date))
       OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND is_active) THEN
        RAISE EXCEPTION 'Choose a finished 7-day, 14-day, or full calendar-month pay period';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('pos-payroll',0));
    SELECT * INTO prior FROM public.payroll_runs WHERE id=p_run;
    IF FOUND THEN
        IF prior.branch_id=p_branch AND prior.period_start=p_start AND prior.period_end=p_end
            AND prior.pay_period_type=p_cycle THEN RETURN p_run; END IF;
        RAISE EXCEPTION 'This payroll identifier is already in use';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.employees e JOIN public.users u ON u.id=e.id
        JOIN public.payroll_items i ON i.employee_id=e.id
        JOIN public.payroll_runs r ON r.id=i.payroll_run_id
        WHERE e.home_branch_id=p_branch AND u.pay_period=p_cycle AND u.wage_type IS NOT NULL AND NOT u.is_deleted
          AND (u.start_date IS NULL OR u.start_date<=p_end)
          AND (e.employment_end IS NULL OR e.employment_end>=p_start)
          AND r.period_start<=p_end AND r.period_end>=p_start
    ) THEN
        RAISE EXCEPTION 'An employee already has a wage run covering part of this period';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.employees e JOIN public.users u ON u.id=e.id
        JOIN public.attendance a ON a.employee_id=e.id
        WHERE e.home_branch_id=p_branch AND u.pay_period=p_cycle AND NOT u.is_deleted AND u.wage_type IS NOT NULL
          AND a.date BETWEEN greatest(p_start,u.start_date) AND least(p_end,e.employment_end)
          AND (a.reviewed_at IS NULL OR (a.status IN ('present','late','half_day') AND a.clock_out IS NULL))
    ) THEN
        RAISE EXCEPTION 'Approve all recorded shifts in the pay period before creating the draft';
    END IF;

    INSERT INTO public.payroll_runs (id,branch_id,period_start,period_end,pay_period_type,run_by)
    VALUES (p_run,p_branch,p_start,p_end,p_cycle,auth.uid());
    WITH roster AS (
        SELECT e.id,u.wage_type,u.wage_rate,coalesce(u.commission_rate,0) AS commission_rate,
            greatest(p_start,u.start_date) AS first_day,least(p_end,e.employment_end) AS final_day
        FROM public.employees e JOIN public.users u ON u.id=e.id
        WHERE e.home_branch_id=p_branch AND u.pay_period=p_cycle AND u.wage_type IS NOT NULL AND NOT u.is_deleted
            AND (u.start_date IS NULL OR u.start_date<=p_end)
            AND (e.employment_end IS NULL OR e.employment_end>=p_start)
    ), hours AS (
        SELECT r.id,coalesce(sum(a.hours_worked),0) AS hours,
            coalesce(sum(CASE WHEN a.status='half_day' THEN 0.5 ELSE 1 END) FILTER (WHERE a.id IS NOT NULL),0) AS days
        FROM roster r LEFT JOIN public.attendance a ON a.employee_id=r.id AND a.date BETWEEN r.first_day AND r.final_day
            AND a.reviewed_at IS NOT NULL AND a.status IN ('present','late','half_day') AND a.clock_out IS NOT NULL
        GROUP BY r.id
    ), sales AS (
        SELECT r.id,coalesce(sum(s.total_amount-s.tax_amount),0) AS net_sales
        FROM roster r LEFT JOIN public.sales s ON s.cashier_id=r.id AND s.status='completed' AND NOT s.is_deleted
          AND s.created_at>=r.first_day::timestamp AT TIME ZONE shop_timezone
          AND s.created_at<(r.final_day+1)::timestamp AT TIME ZONE shop_timezone
        GROUP BY r.id
    ), totals AS (
        SELECT r.*,h.days,h.hours,s.net_sales,
            round(coalesce(r.wage_rate,0)*CASE r.wage_type
                WHEN 'hourly' THEN h.hours
                WHEN 'daily' THEN h.days
                WHEN 'weekly' THEN (r.final_day-r.first_day+1)/7.0
                WHEN 'commission' THEN 0
                ELSE (r.final_day-r.first_day+1)::numeric/duration END,2) AS basic,
            CASE WHEN r.wage_type IN ('commission','hybrid') THEN round(s.net_sales*r.commission_rate/100,2)
                 ELSE 0 END AS commission
        FROM roster r JOIN hours h USING (id) JOIN sales s USING (id)
    )
    INSERT INTO public.payroll_items (
        payroll_run_id,employee_id,days_worked,hours_worked,basic_pay,commission_earned,gross_pay,net_pay,compensation_snapshot
    )
    SELECT p_run,id,days,hours,basic,commission,basic+commission,basic+commission,
        jsonb_build_object('wage_type',wage_type,'wage_rate',wage_rate,'commission_rate',commission_rate,'net_sales',net_sales)
    FROM totals;

    GET DIAGNOSTICS roster_count=ROW_COUNT;
    IF roster_count=0 THEN RAISE EXCEPTION 'There are no employees with this home branch and pay cycle'; END IF;
    PERFORM kelvin_private.update_payroll_totals(p_run);
    RETURN p_run;
END;
$$;

CREATE FUNCTION public.adjust_staff_payroll(
    p_item uuid,p_overtime numeric,p_bonus numeric,p_allowance numeric,p_deduction numeric,p_notes text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    draft_id uuid;
    base numeric;
    gross numeric;
BEGIN
    IF public.is_super_admin() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only an administrator can adjust wage runs' USING ERRCODE='42501';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(ARRAY[p_overtime,p_bonus,p_allowance,p_deduction]) AS v(amount)
        WHERE amount IS NULL OR amount NOT BETWEEN 0 AND 9999999999.99 OR amount<>round(amount,2))
        OR length(coalesce(p_notes,''))>500 THEN
        RAISE EXCEPTION 'Enter valid pay adjustments to two decimal places';
    END IF;
    SELECT r.id,i.basic_pay+i.commission_earned INTO draft_id,base
    FROM public.payroll_items i JOIN public.payroll_runs r ON r.id=i.payroll_run_id
    WHERE i.id=p_item AND r.status='draft' FOR UPDATE OF r;
    IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft wage run can be adjusted'; END IF;
    gross := base+p_overtime+p_bonus+p_allowance;
    IF p_deduction>gross THEN RAISE EXCEPTION 'Deductions cannot exceed gross pay'; END IF;
    UPDATE public.payroll_items SET overtime_pay=p_overtime,bonuses=jsonb_build_object('manual',p_bonus),
        allowances=jsonb_build_object('manual',p_allowance),deductions=jsonb_build_object('manual',p_deduction),
        gross_pay=gross,net_pay=gross-p_deduction,notes=nullif(btrim(p_notes),'')
    WHERE id=p_item;
    PERFORM kelvin_private.update_payroll_totals(draft_id);
END;
$$;

CREATE FUNCTION public.set_staff_payroll_state(p_run uuid,p_action text,p_method text,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    payroll public.payroll_runs%ROWTYPE;
BEGIN
    IF public.is_super_admin() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only an administrator can approve or record payroll payments' USING ERRCODE='42501';
    END IF;
    SELECT * INTO payroll FROM public.payroll_runs WHERE id=p_run FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wage run could not be found'; END IF;
    IF p_action='approve' THEN
        IF payroll.status IN ('approved','paid') THEN RETURN; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.payroll_items WHERE payroll_run_id=p_run) THEN
            RAISE EXCEPTION 'This wage run has no employee statements';
        END IF;
        UPDATE public.payroll_runs SET status='approved',approved_by=auth.uid() WHERE id=p_run;
    ELSIF p_action='pay' THEN
        IF payroll.status='paid' THEN RETURN; END IF;
        IF payroll.status<>'approved' THEN RAISE EXCEPTION 'Approve the wage run before recording payment'; END IF;
        IF p_method IS NULL OR p_method NOT IN ('cash','bank','mpesa','other')
           OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 1 AND 120 THEN
            RAISE EXCEPTION 'Enter the payroll payment method and reference';
        END IF;
        UPDATE public.payroll_items SET payment_method=p_method,payment_reference=btrim(p_reference)
        WHERE payroll_run_id=p_run;
        UPDATE public.payroll_runs SET status='paid',paid_at=now(),payment_reference=btrim(p_reference) WHERE id=p_run;
    ELSIF p_action='discard' THEN
        IF payroll.status<>'draft' THEN RAISE EXCEPTION 'Only draft wage runs can be discarded'; END IF;
        DELETE FROM public.payroll_runs WHERE id=p_run;
    ELSE
        RAISE EXCEPTION 'Choose a valid payroll action';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION kelvin_private.update_payroll_totals(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kelvin_private.complete_pos_sale(uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kelvin_private.staff_clock(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION kelvin_private.post_inventory_movement(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION kelvin_private.update_payroll_totals(uuid),
    kelvin_private.complete_pos_sale(uuid,uuid,jsonb,jsonb,jsonb),kelvin_private.staff_clock(uuid,text),
    kelvin_private.post_inventory_movement(uuid,uuid,uuid,jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.manage_product_image(uuid,text,text),public.save_inventory_product(uuid,uuid,jsonb),
    public.post_inventory_movement(uuid,uuid,uuid,jsonb),public.complete_pos_sale(uuid,uuid,jsonb,jsonb,jsonb),
    public.void_pos_sale(uuid,text),public.record_customer_collection(uuid,uuid,uuid,numeric,text,text),
    public.pos_sales_report(uuid,date,date),public.pos_sales_page(uuid,date,date,text,text,text,uuid,int),
    public.pos_customer_detail(uuid),public.save_staff_record(uuid,uuid,jsonb),public.staff_clock(uuid,text),
    public.save_staff_attendance(uuid,uuid,date,public.attendance_status,time,time,int,text),public.review_staff_attendance(uuid),
    public.draft_staff_payroll(uuid,uuid,date,date,public.pay_period_type),
    public.adjust_staff_payroll(uuid,numeric,numeric,numeric,numeric,text),
    public.set_staff_payroll_state(uuid,text,text,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.manage_product_image(uuid,text,text),public.save_inventory_product(uuid,uuid,jsonb),
    public.post_inventory_movement(uuid,uuid,uuid,jsonb),public.complete_pos_sale(uuid,uuid,jsonb,jsonb,jsonb),
    public.void_pos_sale(uuid,text),public.record_customer_collection(uuid,uuid,uuid,numeric,text,text),
    public.pos_sales_report(uuid,date,date),public.pos_sales_page(uuid,date,date,text,text,text,uuid,int),
    public.pos_customer_detail(uuid),public.save_staff_record(uuid,uuid,jsonb),public.staff_clock(uuid,text),
    public.save_staff_attendance(uuid,uuid,date,public.attendance_status,time,time,int,text),public.review_staff_attendance(uuid),
    public.draft_staff_payroll(uuid,uuid,date,date,public.pay_period_type),
    public.adjust_staff_payroll(uuid,numeric,numeric,numeric,numeric,text),
    public.set_staff_payroll_state(uuid,text,text,text) TO authenticated;
