import type { Pool } from 'pg';
import type { Principal } from '../../auth/tokens.js';
import { ApiError } from '../../http/errors.js';
import { FRESHNESS_MINUTES } from './validation.js';

export class SummaryService {
  constructor(private readonly pool: Pool) {}

  async district(principal: Principal, districtId: string, asOf: string) {
    if (principal.kind !== 'analyst') throw new ApiError(403, 40301, 'Analyst access is required');
    // One SQL statement provides a consistent snapshot for authorization,
    // installations, observations, midnight baselines and all aggregate counts.
    const result = await this.pool.query(`
      WITH visible_district AS (
        SELECT id, code, name, province_id FROM districts
        WHERE id = $1 AND ($3::text = 'national'
          OR ($3 = 'provincial' AND province_id = $4::uuid)
          OR ($3 = 'district' AND id = $5::uuid))
      ), bounds AS (
        SELECT $2::timestamptz AS cutoff,
          date_trunc('day', $2::timestamptz AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo' AS midnight
      ), observations AS (
        SELECT i.id, latest.timestamp AS observed_at, latest.power_kw,
          latest.cumulative_energy_kwh AS counter, baseline.cumulative_energy_kwh AS baseline,
          latest.timestamp >= b.cutoff - ($6::int * interval '1 minute') AS fresh
        FROM visible_district d JOIN grid_substations s ON s.district_id = d.id
        JOIN solar_installations i ON i.grid_substation_id = s.id CROSS JOIN bounds b
        LEFT JOIN LATERAL (
          SELECT timestamp, power_kw, cumulative_energy_kwh FROM generation_readings
          WHERE installation_id = i.id AND timestamp <= b.cutoff
          ORDER BY timestamp DESC, id DESC LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT cumulative_energy_kwh FROM generation_readings
          WHERE installation_id = i.id AND timestamp = b.midnight
        ) baseline ON true
      ), totals AS (
        SELECT count(*)::int AS "totalInstallations",
          count(*) FILTER (WHERE fresh)::int AS "freshInstallations",
          count(*) FILTER (WHERE NOT fresh)::int AS "staleInstallations",
          count(*) FILTER (WHERE observed_at IS NULL)::int AS "noReadingInstallations",
          sum(power_kw) FILTER (WHERE fresh)::float8 AS "measuredPowerKw",
          count(*) FILTER (WHERE baseline IS NULL)::int AS "missingMidnightBaselineInstallations",
          count(*) FILTER (WHERE counter < baseline)::int AS "invalidCounterInstallations",
          count(*) FILTER (WHERE counter >= baseline)::int AS "energyContributingInstallations",
          count(*) FILTER (WHERE counter >= baseline AND NOT fresh)::int AS "staleEnergyInstallations",
          sum(counter - baseline) FILTER (WHERE counter >= baseline)::float8 AS "energyTodayKwh",
          min(observed_at) FILTER (WHERE fresh) AS "powerOldestObservedAt",
          max(observed_at) FILTER (WHERE fresh) AS "powerNewestObservedAt",
          min(observed_at) FILTER (WHERE counter >= baseline) AS "energyOldestObservedAt",
          max(observed_at) FILTER (WHERE counter >= baseline) AS "energyNewestObservedAt"
        FROM observations
      )
      SELECT jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name, 'provinceId', d.province_id) AS district,
        b.cutoff AS "asOf", b.midnight AS "dayStart",
        to_char(b.cutoff AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD') AS "localDate",
        'Asia/Colombo'::text AS "timeZone", $6::int AS "freshnessMinutes", totals.*,
        "totalInstallations" > 0 AND "freshInstallations" = "totalInstallations" AS "powerCoverageComplete",
        "totalInstallations" > 0 AND "energyContributingInstallations" = "totalInstallations" AS "energyCoverageComplete"
      FROM visible_district d CROSS JOIN bounds b CROSS JOIN totals`,
    [districtId, asOf, principal.role, principal.provinceId, principal.districtId, FRESHNESS_MINUTES]);
    if (!result.rows[0]) throw new ApiError(404, 40401, 'Resource not found');
    // Last-Modified is intentionally omitted: wall-clock cutoffs and current
    // inventory membership cannot be described by max(reading.received_at).
    return result.rows[0];
  }
}
