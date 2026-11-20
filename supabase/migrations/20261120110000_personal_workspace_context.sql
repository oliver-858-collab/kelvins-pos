-- Give personal-only accounts the shop display settings and their assigned active branch.
CREATE FUNCTION kelvin_private.personal_workspace_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF auth.uid() IS NULL OR public.current_user_role() IS DISTINCT FROM 'custom' THEN
        RAISE EXCEPTION 'An active personal workspace account is required' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
        'shop', (SELECT jsonb_build_object('id', s.id, 'shop_name', s.shop_name,
                    'currency', s.currency, 'timezone', s.timezone, 'tax_name', s.tax_name)
                 FROM public.shop_settings s ORDER BY s.created_at, s.id LIMIT 1),
        'branches', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name))
            FROM public.employees e JOIN public.branches b ON b.id = e.home_branch_id
            WHERE e.id = auth.uid() AND b.is_active
        ), '[]'::jsonb)
    );
END;
$$;

CREATE FUNCTION public.personal_workspace_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.personal_workspace_context();
$$;

REVOKE ALL ON FUNCTION kelvin_private.personal_workspace_context(), public.personal_workspace_context()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kelvin_private.personal_workspace_context(), public.personal_workspace_context()
    TO authenticated;
