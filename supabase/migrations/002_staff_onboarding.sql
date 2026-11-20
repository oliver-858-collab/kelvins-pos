-- Confirmed email requests create roleless, pending profiles.
CREATE SCHEMA IF NOT EXISTS kelvin_private;
REVOKE ALL ON SCHEMA kelvin_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION kelvin_private.create_pending_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL
       AND NEW.email IS NOT NULL
       AND NEW.raw_user_meta_data ->> 'kelvin_staff_request' = 'true'
       AND length(trim(NEW.raw_user_meta_data ->> 'full_name')) BETWEEN 1 AND 120
    THEN
        INSERT INTO public.users (id, email, full_name, account_status)
        VALUES (NEW.id, NEW.email, trim(NEW.raw_user_meta_data ->> 'full_name'), 'pending')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kelvin_private.create_pending_staff_profile() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER kelvin_confirmed_staff_profile
    AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION kelvin_private.create_pending_staff_profile();
