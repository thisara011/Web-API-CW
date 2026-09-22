-- Technical metadata for a reproducible, non-destructive coursework seed.
CREATE TABLE seed_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generator_version text NOT NULL,
    dataset_checksum text NOT NULL,
    seed_reference timestamptz(3) NOT NULL,
    random_seed text NOT NULL,
    province_count integer NOT NULL,
    district_count integer NOT NULL,
    substation_count integer NOT NULL,
    installation_count integer NOT NULL,
    reading_count integer NOT NULL,
    created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT seed_runs_generator_version_nonempty CHECK (btrim(generator_version) <> ''),
    CONSTRAINT seed_runs_checksum_format CHECK (dataset_checksum ~ '^[a-f0-9]{64}$'),
    CONSTRAINT seed_runs_random_seed_nonempty CHECK (btrim(random_seed) <> ''),
    CONSTRAINT seed_runs_reference_finite CHECK (isfinite(seed_reference)),
    CONSTRAINT seed_runs_counts_positive CHECK (
        province_count > 0 AND district_count > 0 AND substation_count > 0
        AND installation_count > 0 AND reading_count > 0
    )
);

CREATE UNIQUE INDEX seed_runs_single_generator_idx ON seed_runs (generator_version);
