-- The operator may reserve the first administrator for one verified email.
CREATE TABLE kelvin_private.first_owner_reservation (
    single_slot boolean PRIMARY KEY DEFAULT true CHECK (single_slot),
    email text NOT NULL CHECK (email = lower(email)),
    expires_at timestamptz NOT NULL
);
ALTER TABLE kelvin_private.first_owner_reservation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE kelvin_private.first_owner_reservation FROM PUBLIC, anon, authenticated;

CREATE FUNCTION kelvin_private.activate_first_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    admin_role_id uuid;
BEGIN
    IF NEW.confirmation_sent_at IS NULL
       OR NEW.email_confirmed_at < NEW.confirmation_sent_at
       OR (NEW.raw_user_meta_data ->> 'kelvin_staff_request') IS DISTINCT FROM 'true'
       OR NOT EXISTS (
           SELECT 1 FROM public.users WHERE id = NEW.id AND account_status = 'pending' AND NOT is_deleted
       )
    THEN
        RETURN NEW;
    END IF;

    DELETE FROM kelvin_private.first_owner_reservation
    WHERE single_slot AND email = lower(NEW.email) AND expires_at > now();
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT id INTO STRICT admin_role_id FROM public.roles WHERE role_type = 'super_admin' AND is_system_role;
    IF EXISTS (
        SELECT 1 FROM public.users WHERE role_id = admin_role_id AND account_status = 'active' AND NOT is_deleted
    ) THEN
        RETURN NEW;
    END IF;

    UPDATE public.users SET account_status = 'active', role_id = admin_role_id, approved_at = now()
    WHERE id = NEW.id AND account_status = 'pending' AND NOT is_deleted;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kelvin_private.activate_first_owner() FROM PUBLIC, anon, authenticated;

-- PostgreSQL fires the pending-profile trigger first, ordered by trigger name.
CREATE TRIGGER kelvin_first_owner
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
    EXECUTE FUNCTION kelvin_private.activate_first_owner();
