-- Activate credentials on older staff requests without granting a workspace role.
UPDATE auth.users a SET email_confirmed_at=now(),confirmation_token=''
FROM public.users u
WHERE u.id=a.id AND a.email_confirmed_at IS NULL AND u.account_status='pending' AND u.role_id IS NULL
  AND a.raw_user_meta_data->>'kelvin_staff_request'='true';

CREATE TABLE kelvin_private.staff_signup_limits (
    window_start timestamptz NOT NULL,
    scope text NOT NULL,
    attempts integer NOT NULL CHECK (attempts>0),
    PRIMARY KEY (window_start,scope)
);
ALTER TABLE kelvin_private.staff_signup_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE kelvin_private.staff_signup_limits FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserve_staff_signup(p_email_hash text,p_source_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    hour_start timestamptz := date_trunc('hour',now());
    quota record;
BEGIN
    IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$'
       OR p_source_hash IS NULL OR p_source_hash !~ '^[0-9a-f]{64}$' THEN
        RETURN false;
    END IF;

    FOR quota IN SELECT * FROM (VALUES
        (1,'all',150),(2,'source:' || p_source_hash,30),(3,'email:' || p_email_hash,5)
    ) AS rate_limit(priority,scope,ceiling) ORDER BY priority
    LOOP
        INSERT INTO kelvin_private.staff_signup_limits AS counter (window_start,scope,attempts)
        VALUES (hour_start,quota.scope,1)
        ON CONFLICT (window_start,scope) DO UPDATE SET attempts=counter.attempts+1
        WHERE counter.attempts<quota.ceiling;
        IF NOT FOUND THEN RETURN false; END IF;
    END LOOP;
    DELETE FROM kelvin_private.staff_signup_limits WHERE window_start<hour_start-interval '1 day';
    RETURN true;
END;
$$;

GRANT USAGE ON SCHEMA kelvin_private TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE kelvin_private.staff_signup_limits TO service_role;
REVOKE ALL ON FUNCTION public.reserve_staff_signup(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_staff_signup(text,text) TO service_role;

-- A staff member can retrieve only their own published statements.
DROP POLICY payroll_runs_self ON public.payroll_runs;
DROP POLICY payroll_items_self ON public.payroll_items;

CREATE FUNCTION kelvin_private.my_wage_statements()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    result jsonb;
BEGIN
    IF auth.uid() IS NULL OR public.current_user_role() IS NULL THEN
        RAISE EXCEPTION 'An active staff account is required' USING ERRCODE='42501';
    END IF;

    SELECT coalesce(jsonb_agg(to_jsonb(items) ORDER BY items.period_end DESC,items.id),'[]') INTO result
    FROM (
        SELECT i.id,i.employee_id,i.days_worked,i.hours_worked,i.basic_pay,i.overtime_pay,i.commission_earned,
            i.bonuses,i.allowances,i.deductions,i.gross_pay,i.net_pay,i.notes,i.payment_method,i.payment_reference,
            i.compensation_snapshot,r.period_end,
            jsonb_build_object('id',r.id,'period_start',r.period_start,'period_end',r.period_end,
                'status',r.status,'paid_at',r.paid_at,'pay_period_type',r.pay_period_type) AS run
        FROM public.payroll_items i JOIN public.payroll_runs r ON r.id=i.payroll_run_id
        WHERE i.employee_id=auth.uid() AND r.status IN ('approved','paid')
        ORDER BY r.period_end DESC,i.id LIMIT 60
    ) items;
    RETURN result;
END;
$$;

CREATE FUNCTION public.my_wage_statements()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.my_wage_statements();
$$;

REVOKE ALL ON FUNCTION kelvin_private.my_wage_statements(),public.my_wage_statements() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION kelvin_private.my_wage_statements(),public.my_wage_statements() TO authenticated;
