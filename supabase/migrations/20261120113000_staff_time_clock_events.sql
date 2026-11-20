-- Close a running break with the shift so generated work hours deduct it.
CREATE FUNCTION kelvin_private.finish_break_on_clock_out()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.clock_out IS NULL AND NEW.clock_out IS NOT NULL
       AND NEW.break_start IS NOT NULL AND NEW.break_end IS NULL THEN
        NEW.break_end := NEW.clock_out;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kelvin_private.finish_break_on_clock_out() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER staff_finish_break_on_clock_out
    BEFORE UPDATE OF clock_out ON public.attendance
    FOR EACH ROW EXECUTE FUNCTION kelvin_private.finish_break_on_clock_out();

CREATE FUNCTION kelvin_private.staff_clock_event(p_branch uuid, p_attendance uuid, p_event text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    staff_id uuid := auth.uid();
    staff_role public.role_type := public.current_user_role();
    home_branch uuid;
    entry public.attendance%ROWTYPE;
BEGIN
    IF staff_id IS NULL OR staff_role IS NULL THEN
        RAISE EXCEPTION 'An active staff account is required' USING ERRCODE = '42501';
    END IF;
    SELECT e.home_branch_id INTO home_branch FROM public.employees e WHERE e.id = staff_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ask your administrator to set up your employee record'; END IF;
    IF p_event = 'in' THEN
        IF staff_role = 'custom' AND (home_branch IS NULL OR p_branch IS DISTINCT FROM home_branch) THEN
            RAISE EXCEPTION 'Clock in at your assigned home branch';
        END IF;
        RETURN kelvin_private.staff_clock(p_branch, 'in');
    END IF;
    IF p_event IS NULL OR p_event NOT IN ('out', 'break_start', 'break_end') THEN
        RAISE EXCEPTION 'Choose a valid time clock action';
    END IF;

    SELECT * INTO entry FROM public.attendance
    WHERE id = p_attendance AND employee_id = staff_id AND shift_id IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This shift is unavailable'; END IF;
    IF p_event = 'out' THEN
        IF entry.clock_out IS NOT NULL THEN RETURN entry.id; END IF;
        UPDATE public.attendance SET clock_out = now(), reviewed_at = NULL, reviewed_by = NULL WHERE id = entry.id;
        UPDATE public.shifts SET end_time = now(), status = 'closed' WHERE id = entry.shift_id;
    ELSIF entry.clock_out IS NOT NULL THEN
        RAISE EXCEPTION 'This shift is already closed';
    ELSIF p_event = 'break_start' THEN
        IF entry.break_end IS NOT NULL THEN RAISE EXCEPTION 'A break has already been recorded for this shift'; END IF;
        IF entry.break_start IS NULL THEN
            UPDATE public.attendance SET break_start = now() WHERE id = entry.id;
        END IF;
    ELSE
        IF entry.break_start IS NULL THEN RAISE EXCEPTION 'There is no break to end'; END IF;
        IF entry.break_end IS NULL THEN
            UPDATE public.attendance SET break_end = now() WHERE id = entry.id;
        END IF;
    END IF;
    RETURN entry.id;
END;
$$;

CREATE FUNCTION public.staff_clock_event(p_branch uuid, p_attendance uuid, p_event text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT kelvin_private.staff_clock_event(p_branch, p_attendance, p_event);
$$;

REVOKE ALL ON FUNCTION kelvin_private.staff_clock_event(uuid, uuid, text), public.staff_clock_event(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION kelvin_private.staff_clock_event(uuid, uuid, text), public.staff_clock_event(uuid, uuid, text) TO authenticated;
