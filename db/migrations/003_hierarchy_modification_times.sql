-- Track metadata changes contributing to the installation overview validator.
-- Existing rows receive this migration's timestamp, not invented historical dates.
ALTER TABLE provinces ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT statement_timestamp()
    CHECK (isfinite(updated_at));
ALTER TABLE districts ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT statement_timestamp()
    CHECK (isfinite(updated_at));
ALTER TABLE grid_substations ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT statement_timestamp()
    CHECK (isfinite(updated_at));
CREATE TRIGGER provinces_maintain_updated_at BEFORE UPDATE ON provinces
    FOR EACH ROW EXECUTE FUNCTION maintain_updated_at();
CREATE TRIGGER districts_maintain_updated_at BEFORE UPDATE ON districts
    FOR EACH ROW EXECUTE FUNCTION maintain_updated_at();
CREATE TRIGGER grid_substations_maintain_updated_at BEFORE UPDATE ON grid_substations
    FOR EACH ROW EXECUTE FUNCTION maintain_updated_at();
