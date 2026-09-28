-- Explicit coursework interpretation: installation metadata is mutable;
-- measurements remain append-only. Maintenance credentials are provisioned offline.
ALTER TABLE users DROP CONSTRAINT users_role_valid;
ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('national','provincial','district','maintenance'));
ALTER TABLE users DROP CONSTRAINT users_role_scope_valid;
ALTER TABLE users ADD CONSTRAINT users_role_scope_valid CHECK (
 (role IN ('national','maintenance') AND province_id IS NULL AND district_id IS NULL)
 OR (role='provincial' AND province_id IS NOT NULL AND district_id IS NULL)
 OR (role='district' AND province_id IS NULL AND district_id IS NOT NULL)
);

CREATE FUNCTION guard_installation_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE has_history boolean;
BEGIN
 IF NEW.commissioned_date IS DISTINCT FROM OLD.commissioned_date THEN
   EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.generation_readings WHERE installation_id=$1)', TG_TABLE_SCHEMA)
     INTO has_history USING OLD.id;
   IF has_history THEN
     RAISE EXCEPTION 'Commissioned date cannot change after readings exist' USING ERRCODE='55000';
   END IF;
 END IF;
 IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
   NEW.credential_version := OLD.credential_version+1;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER solar_installations_guard_lifecycle BEFORE UPDATE ON solar_installations
 FOR EACH ROW EXECUTE FUNCTION guard_installation_lifecycle();
