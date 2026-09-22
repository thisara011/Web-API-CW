-- The migration runner supplies the target schema through a transaction-local
-- search_path. All six domain tables and their functions belong to that schema.

CREATE TABLE provinces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    CONSTRAINT provinces_code_unique UNIQUE (code),
    CONSTRAINT provinces_code_trimmed_nonempty CHECK (code = btrim(code) AND code <> ''),
    CONSTRAINT provinces_name_trimmed_nonempty CHECK (name = btrim(name) AND name <> '')
);

CREATE TABLE districts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    province_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    CONSTRAINT districts_province_fk FOREIGN KEY (province_id)
        REFERENCES provinces (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT districts_code_unique UNIQUE (code),
    CONSTRAINT districts_code_trimmed_nonempty CHECK (code = btrim(code) AND code <> ''),
    CONSTRAINT districts_name_trimmed_nonempty CHECK (name = btrim(name) AND name <> '')
);

CREATE TABLE grid_substations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    district_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    CONSTRAINT grid_substations_district_fk FOREIGN KEY (district_id)
        REFERENCES districts (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT grid_substations_code_unique UNIQUE (code),
    CONSTRAINT grid_substations_code_trimmed_nonempty CHECK (code = btrim(code) AND code <> ''),
    CONSTRAINT grid_substations_name_trimmed_nonempty CHECK (name = btrim(name) AND name <> '')
);

CREATE TABLE solar_installations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    grid_substation_id uuid NOT NULL,
    meter_id text NOT NULL,
    site_label text NOT NULL,
    capacity_kw numeric(12, 3) NOT NULL,
    commissioned_date date,
    credential_hash text,
    credential_version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT solar_installations_grid_substation_fk FOREIGN KEY (grid_substation_id)
        REFERENCES grid_substations (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT solar_installations_meter_id_unique UNIQUE (meter_id),
    CONSTRAINT solar_installations_meter_id_trimmed_nonempty
        CHECK (meter_id = btrim(meter_id) AND meter_id <> ''),
    CONSTRAINT solar_installations_site_label_trimmed_nonempty
        CHECK (site_label = btrim(site_label) AND site_label <> ''),
    -- PostgreSQL sorts numeric NaN above Infinity, so this upper bound also
    -- rejects NaN. Fixed precision alone does not reject NaN.
    CONSTRAINT solar_installations_capacity_positive_finite
        CHECK (capacity_kw > 0 AND capacity_kw < 'Infinity'::numeric),
    CONSTRAINT solar_installations_commissioned_date_finite
        CHECK (commissioned_date IS NULL OR isfinite(commissioned_date)),
    CONSTRAINT solar_installations_credential_hash_nonblank
        CHECK (credential_hash IS NULL OR btrim(credential_hash) <> ''),
    CONSTRAINT solar_installations_credential_version_positive CHECK (credential_version > 0),
    CONSTRAINT solar_installations_created_at_finite CHECK (isfinite(created_at)),
    CONSTRAINT solar_installations_updated_at_finite CHECK (isfinite(updated_at))
);

CREATE TABLE generation_readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id uuid NOT NULL,
    timestamp timestamptz(3) NOT NULL,
    power_kw numeric(12, 3) NOT NULL,
    cumulative_energy_kwh numeric(15, 3) NOT NULL,
    voltage numeric(9, 3) NOT NULL,
    received_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT generation_readings_installation_fk FOREIGN KEY (installation_id)
        REFERENCES solar_installations (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT generation_readings_installation_timestamp_unique UNIQUE (installation_id, timestamp),
    CONSTRAINT generation_readings_timestamp_finite CHECK (isfinite(timestamp)),
    CONSTRAINT generation_readings_received_at_finite CHECK (isfinite(received_at)),
    CONSTRAINT generation_readings_power_nonnegative_finite
        CHECK (power_kw >= 0 AND power_kw < 'Infinity'::numeric),
    CONSTRAINT generation_readings_energy_nonnegative_finite
        CHECK (cumulative_energy_kwh >= 0 AND cumulative_energy_kwh < 'Infinity'::numeric),
    CONSTRAINT generation_readings_voltage_nonnegative_finite
        CHECK (voltage >= 0 AND voltage < 'Infinity'::numeric)
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    province_id uuid,
    district_id uuid,
    credential_version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_normalized_nonempty CHECK (email = lower(btrim(email)) AND email <> ''),
    CONSTRAINT users_password_hash_nonblank CHECK (btrim(password_hash) <> ''),
    -- A named CHECK keeps the allowed roles visible without a schema-specific
    -- enum type. District users derive their province through their district.
    CONSTRAINT users_role_valid CHECK (role IN ('national', 'provincial', 'district')),
    CONSTRAINT users_province_fk FOREIGN KEY (province_id)
        REFERENCES provinces (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT users_district_fk FOREIGN KEY (district_id)
        REFERENCES districts (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT users_role_scope_valid CHECK (
        (role = 'national' AND province_id IS NULL AND district_id IS NULL)
        OR (role = 'provincial' AND province_id IS NOT NULL AND district_id IS NULL)
        OR (role = 'district' AND province_id IS NULL AND district_id IS NOT NULL)
    ),
    CONSTRAINT users_credential_version_positive CHECK (credential_version > 0),
    CONSTRAINT users_created_at_finite CHECK (isfinite(created_at)),
    CONSTRAINT users_updated_at_finite CHECK (isfinite(updated_at))
);

CREATE INDEX districts_province_id_idx ON districts (province_id);
CREATE INDEX grid_substations_district_id_idx ON grid_substations (district_id);
CREATE INDEX solar_installations_grid_substation_id_idx ON solar_installations (grid_substation_id);
CREATE INDEX users_province_id_idx ON users (province_id);
CREATE INDEX users_district_id_idx ON users (district_id);

-- The installation-led indexes also cover the readings' installation FK; no
-- redundant single-column index is needed. The ID supplies stable tie-breaking.
CREATE INDEX generation_readings_installation_history_idx
    ON generation_readings (installation_id, timestamp DESC, id DESC);
CREATE INDEX generation_readings_regional_history_idx
    ON generation_readings (timestamp DESC, id DESC);

CREATE FUNCTION reject_reading_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'Generation readings are append-only; % is not permitted', TG_OP
        USING ERRCODE = '55000';
END;
$$;

-- Statement triggers also reject zero-row mutations and TRUNCATE. They apply
-- to the table owner during ordinary DML as well as to the runtime role.
CREATE TRIGGER generation_readings_append_only
    BEFORE UPDATE OR DELETE OR TRUNCATE ON generation_readings
    FOR EACH STATEMENT EXECUTE FUNCTION reject_reading_history_mutation();

CREATE FUNCTION preserve_immutable_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF (to_jsonb(NEW) -> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) -> TG_ARGV[0]) THEN
        RAISE EXCEPTION 'The % field on % cannot be reassigned', TG_ARGV[0], TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;

-- Changing an ancestor would silently move retained readings into a different
-- jurisdiction. This version conservatively disallows all parent reassignment.
CREATE TRIGGER districts_preserve_province
    BEFORE UPDATE OF province_id ON districts
    FOR EACH ROW EXECUTE FUNCTION preserve_immutable_column('province_id');

CREATE TRIGGER grid_substations_preserve_district
    BEFORE UPDATE OF district_id ON grid_substations
    FOR EACH ROW EXECUTE FUNCTION preserve_immutable_column('district_id');

CREATE TRIGGER solar_installations_preserve_grid_substation
    BEFORE UPDATE OF grid_substation_id ON solar_installations
    FOR EACH ROW EXECUTE FUNCTION preserve_immutable_column('grid_substation_id');

-- Meter replacement/counter reset is not part of the first-version lifecycle.
CREATE TRIGGER solar_installations_preserve_meter_id
    BEFORE UPDATE OF meter_id ON solar_installations
    FOR EACH ROW EXECUTE FUNCTION preserve_immutable_column('meter_id');

CREATE FUNCTION maintain_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER solar_installations_maintain_updated_at
    BEFORE UPDATE ON solar_installations
    FOR EACH ROW EXECUTE FUNCTION maintain_updated_at();

CREATE TRIGGER users_maintain_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION maintain_updated_at();
