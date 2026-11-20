-- Keep cashier transaction writes behind the atomic checkout function.
DROP POLICY sales_cashier_own ON public.sales;
CREATE POLICY sales_cashier_own ON public.sales FOR SELECT TO authenticated
    USING (public.current_user_role() = 'cashier' AND cashier_id = (SELECT auth.uid()));

DROP POLICY sale_items_cashier ON public.sale_items;
CREATE POLICY sale_items_cashier ON public.sale_items FOR SELECT TO authenticated
    USING (public.current_user_role() = 'cashier' AND EXISTS (
        SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.cashier_id = (SELECT auth.uid())
    ));

DROP POLICY sale_payments_cashier ON public.sale_payments;
CREATE POLICY sale_payments_cashier ON public.sale_payments FOR SELECT TO authenticated
    USING (public.current_user_role() = 'cashier' AND EXISTS (
        SELECT 1 FROM public.sales s WHERE s.id = sale_payments.sale_id AND s.cashier_id = (SELECT auth.uid())
    ));

INSERT INTO public.branches (name, is_main)
SELECT 'Main Branch', true WHERE NOT EXISTS (SELECT 1 FROM public.branches);

-- New receipts have sequence-backed numbers, independent of the legacy numbering triggers.
CREATE SEQUENCE kelvin_private.checkout_number;

CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    sale_branch uuid;
    sale_cashier uuid;
    balance numeric;
BEGIN
    IF NEW.product_id IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM 1 FROM public.products WHERE id = NEW.product_id AND track_stock FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT branch_id, cashier_id INTO sale_branch, sale_cashier
    FROM public.sales WHERE id = NEW.sale_id AND status = 'completed';
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(sum(qty_in - qty_out), 0) INTO balance
    FROM public.stock_entries WHERE product_id = NEW.product_id AND branch_id = sale_branch;

    INSERT INTO public.stock_entries (
        product_id, variant_id, branch_id, qty_out, qty_on_hand, type, reference, created_by
    ) VALUES (
        NEW.product_id, NEW.variant_id, sale_branch, NEW.quantity, balance - NEW.quantity,
        'sale', NEW.sale_id::text, sale_cashier
    );
    RETURN NEW;
END;
$$;

CREATE FUNCTION kelvin_private.record_checkout(
    p_sale_id uuid, p_branch_id uuid, p_items jsonb, p_method text, p_cash_received numeric, p_reference text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    cashier uuid := auth.uid();
    existing_cashier uuid;
    existing_branch uuid;
    settings public.shop_settings%ROWTYPE;
    product public.products%ROWTYPE;
    item record;
    lines jsonb := '[]'::jsonb;
    balance numeric;
    line_total numeric;
    line_tax numeric;
    total numeric := 0;
    tax numeric := 0;
    paid numeric;
    change_due numeric;
    number_suffix text;
BEGIN
    IF cashier IS NULL OR public.is_cashier_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'An active cashier, manager or administrator account is required' USING ERRCODE = '42501';
    END IF;
    IF p_sale_id IS NULL THEN
        RAISE EXCEPTION 'A checkout identifier is required';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('kelvin-checkout:' || p_sale_id::text, 0));
    SELECT cashier_id, branch_id INTO existing_cashier, existing_branch FROM public.sales WHERE id = p_sale_id;
    IF FOUND THEN
        IF existing_cashier = cashier AND existing_branch = p_branch_id
            AND EXISTS (SELECT 1 FROM public.receipts WHERE sale_id = p_sale_id AND type = 'sale')
        THEN
            RETURN p_sale_id;
        END IF;
        RAISE EXCEPTION 'This checkout identifier has already been used';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch';
    END IF;
    IF p_method IS NULL OR p_method NOT IN ('cash', 'card', 'mpesa') THEN
        RAISE EXCEPTION 'Choose a valid payment method';
    END IF;
    IF length(coalesce(p_reference, '')) > 120 THEN
        RAISE EXCEPTION 'Payment reference must be 120 characters or fewer';
    END IF;
    IF p_method <> 'cash' AND nullif(btrim(p_reference), '') IS NULL THEN
        RAISE EXCEPTION 'Enter the payment reference';
    END IF;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Add an item to the cart';
    END IF;
    IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'A sale must contain between 1 and 100 distinct items';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_items) AS line(product_id uuid, quantity numeric, unit_price numeric)
        WHERE product_id IS NULL OR quantity IS NULL OR quantity NOT BETWEEN 0.0001 AND 99999
           OR quantity <> round(quantity, 4) OR unit_price IS NULL
    ) OR (SELECT count(DISTINCT product_id) FROM jsonb_to_recordset(p_items) AS line(product_id uuid)) <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'The cart contains invalid or duplicate items';
    END IF;

    SELECT * INTO STRICT settings FROM public.shop_settings ORDER BY created_at, id LIMIT 1;
    FOR item IN
        SELECT * FROM jsonb_to_recordset(p_items) AS line(product_id uuid, quantity numeric, unit_price numeric)
        ORDER BY product_id
    LOOP
        SELECT * INTO product FROM public.products WHERE id = item.product_id FOR UPDATE;
        IF NOT FOUND OR NOT product.is_active OR product.is_deleted
            OR (product.branch_id IS NOT NULL AND product.branch_id <> p_branch_id) THEN
            RAISE EXCEPTION 'An item is no longer available at this branch';
        END IF;
        IF product.selling_price < 0 OR product.selling_price <> item.unit_price THEN
            RAISE EXCEPTION 'The price of % changed. Refresh the catalog before retrying.', product.name;
        END IF;

        IF product.track_stock THEN
            SELECT COALESCE(sum(qty_in - qty_out), 0) INTO balance FROM public.stock_entries
            WHERE product_id = product.id AND branch_id = p_branch_id;
            IF NOT settings.allow_negative_stock AND balance < item.quantity THEN
                RAISE EXCEPTION 'Insufficient stock for % (available: %)', product.name, greatest(balance, 0);
            END IF;
        END IF;

        line_total := round(product.selling_price * item.quantity, 2);
        line_tax := CASE WHEN product.tax_class = 'standard' AND settings.tax_rate > 0
            THEN round(line_total * settings.tax_rate / (100 + settings.tax_rate), 2) ELSE 0 END;
        total := total + line_total;
        tax := tax + line_tax;
        lines := lines || jsonb_build_object(
            'product_id', product.id, 'name', product.name, 'sku', product.sku,
            'quantity', item.quantity, 'unit_price', product.selling_price,
            'total_price', line_total, 'tax_amount', line_tax
        );
    END LOOP;

    paid := CASE WHEN p_method = 'cash' THEN p_cash_received ELSE total END;
    IF paid IS NULL OR paid NOT BETWEEN total AND 9999999999.99 OR paid <> round(paid, 2) THEN
        RAISE EXCEPTION 'Cash received must cover the sale total and have at most two decimal places';
    END IF;
    change_due := paid - total;
    number_suffix := nextval('kelvin_private.checkout_number')::text;

    INSERT INTO public.sales (
        id, sale_number, branch_id, cashier_id, status, subtotal, tax_amount,
        total_amount, amount_paid, change_amount, completed_at
    ) VALUES (
        p_sale_id, 'POS-' || number_suffix, p_branch_id, cashier, 'completed', total - tax, tax,
        total, paid, change_due, now()
    );

    INSERT INTO public.sale_items (
        sale_id, product_id, name, sku, quantity, unit_price, original_price, total_price, tax_amount
    )
    SELECT p_sale_id, product_id, name, sku, quantity, unit_price, unit_price, total_price, tax_amount
    FROM jsonb_to_recordset(lines) AS line(
        product_id uuid, name text, sku text, quantity numeric, unit_price numeric,
        total_price numeric, tax_amount numeric
    );

    INSERT INTO public.sale_payments (sale_id, payment_method, amount, reference)
    VALUES (p_sale_id, p_method, total, nullif(btrim(p_reference), ''));

    INSERT INTO public.receipts (sale_id, receipt_number) VALUES (p_sale_id, 'KPS-' || number_suffix);
    RETURN p_sale_id;
END;
$$;

CREATE FUNCTION public.record_checkout(
    p_sale_id uuid, p_branch_id uuid, p_items jsonb, p_method text, p_cash_received numeric, p_reference text
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.record_checkout(p_sale_id, p_branch_id, p_items, p_method, p_cash_received, p_reference);
$$;

GRANT USAGE ON SCHEMA kelvin_private TO authenticated;
REVOKE ALL ON FUNCTION kelvin_private.record_checkout(uuid, uuid, jsonb, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_checkout(uuid, uuid, jsonb, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kelvin_private.record_checkout(uuid, uuid, jsonb, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_checkout(uuid, uuid, jsonb, text, numeric, text) TO authenticated;

CREATE FUNCTION public.save_checkout_product(
    p_branch_id uuid, p_name text, p_sku text, p_price numeric, p_quantity numeric, p_tax_class public.tax_class
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    new_product uuid;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can add products' USING ERRCODE = '42501';
    END IF;
    IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
        OR length(coalesce(p_sku, '')) > 80
        OR p_price IS NULL OR p_price NOT BETWEEN 0 AND 9999999999.99 OR p_price <> round(p_price, 2)
        OR p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 99999999 OR p_quantity <> round(p_quantity, 4)
        OR p_tax_class IS NULL THEN
        RAISE EXCEPTION 'Enter a product name, a valid price and a valid opening quantity';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch';
    END IF;

    INSERT INTO public.products (name, sku, selling_price, branch_id, created_by, tax_class)
    VALUES (btrim(p_name), nullif(btrim(p_sku), ''), p_price, p_branch_id, auth.uid(), p_tax_class)
    RETURNING id INTO new_product;

    IF p_quantity > 0 THEN
        INSERT INTO public.stock_entries (product_id, branch_id, qty_in, qty_on_hand, type, created_by, notes)
        VALUES (new_product, p_branch_id, p_quantity, p_quantity, 'adjustment', auth.uid(), 'Opening stock');
    END IF;
    RETURN new_product;
END;
$$;

CREATE FUNCTION public.receive_checkout_stock(p_branch_id uuid, p_product_id uuid, p_quantity numeric)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    balance numeric;
BEGIN
    IF public.is_manager_or_above() IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only managers and administrators can receive stock' USING ERRCODE = '42501';
    END IF;
    IF p_quantity IS NULL OR p_quantity NOT BETWEEN 0.0001 AND 99999999 OR p_quantity <> round(p_quantity, 4) THEN
        RAISE EXCEPTION 'Enter a positive stock quantity with at most four decimal places';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active) THEN
        RAISE EXCEPTION 'Choose an active branch';
    END IF;
    PERFORM 1 FROM public.products
    WHERE id = p_product_id AND is_active AND NOT is_deleted AND track_stock
      AND (branch_id IS NULL OR branch_id = p_branch_id)
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'This product does not track stock at this branch';
    END IF;
    SELECT COALESCE(sum(qty_in - qty_out), 0) INTO balance FROM public.stock_entries
    WHERE product_id = p_product_id AND branch_id = p_branch_id;
    INSERT INTO public.stock_entries (product_id, branch_id, qty_in, qty_on_hand, type, created_by, notes)
    VALUES (p_product_id, p_branch_id, p_quantity, balance + p_quantity, 'purchase', auth.uid(), 'Stock received at POS');
END;
$$;

REVOKE ALL ON FUNCTION public.save_checkout_product(uuid, text, text, numeric, numeric, public.tax_class) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_checkout_stock(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_checkout_product(uuid, text, text, numeric, numeric, public.tax_class) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_checkout_stock(uuid, uuid, numeric) TO authenticated;
