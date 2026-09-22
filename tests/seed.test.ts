import { describe, expect, it } from 'vitest';
import { COLOMBO_OFFSET_MILLISECONDS, createSeedDataset, GENERATOR_VERSION, RANDOM_SEED, READINGS_PER_INSTALLATION, REPORTING_INTERVAL_MINUTES, SEED_REFERENCE } from '../src/seed/dataset.js';

describe('coursework seed dataset', () => {
  const dataset = createSeedDataset();

  it('is deterministic and meets the required geographic and asset scale', () => {
    expect(createSeedDataset()).toEqual(dataset);
    expect(dataset.provinces).toHaveLength(9);
    expect(dataset.districts).toHaveLength(25);
    expect(dataset.substations).toHaveLength(25);
    expect(dataset.installations).toHaveLength(200);
    expect(dataset.readings).toHaveLength(134_600);
    expect(dataset.users).toHaveLength(35);
    expect(dataset.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(GENERATOR_VERSION).toBe('solar-coursework-v1');
    expect(RANDOM_SEED).toBe('slsea-coursework-2026-v1');
  });

  it('preserves the required parent relationships and meter-as-installation attribute', () => {
    const provinceIds = new Set(dataset.provinces.map((item) => item.id));
    const districtIds = new Set(dataset.districts.map((item) => item.id));
    const substationIds = new Set(dataset.substations.map((item) => item.id));
    expect(dataset.districts.every((item) => provinceIds.has(item.provinceId))).toBe(true);
    expect(dataset.substations.every((item) => districtIds.has(item.districtId))).toBe(true);
    expect(dataset.installations.every((item) => substationIds.has(item.gridSubstationId))).toBe(true);
    expect(new Set(dataset.installations.map((item) => item.meterId)).size).toBe(200);
    expect(dataset.installations.every((item) => Number(item.capacityKw) > 0)).toBe(true);
  });

  it('generates one inclusive seven-day series per installation at 15-minute intervals', () => {
    const firstInstallation = dataset.installations[0]!;
    const readings = dataset.readings.filter((item) => item.installationId === firstInstallation.id);
    expect(readings).toHaveLength(READINGS_PER_INSTALLATION);
    expect(readings[0]?.timestamp).toBe('2026-08-17T18:30:00.000Z');
    expect(readings.at(-1)?.timestamp).toBe(SEED_REFERENCE);
    for (let index = 1; index < readings.length; index += 1) {
      expect(new Date(readings[index]!.timestamp).getTime() - new Date(readings[index - 1]!.timestamp).getTime())
        .toBe(REPORTING_INTERVAL_MINUTES * 60 * 1_000);
      expect(Number(readings[index]!.cumulativeEnergyKwh)).toBeGreaterThanOrEqual(Number(readings[index - 1]!.cumulativeEnergyKwh));
    }
  });

  it('has a plausible diurnal generation profile and Colombo-midnight baselines', () => {
    const installation = dataset.installations[0]!;
    const readings = dataset.readings.filter((item) => item.installationId === installation.id);
    const localHour = (timestamp: string) => new Date(new Date(timestamp).getTime() + COLOMBO_OFFSET_MILLISECONDS).getUTCHours();
    const night = readings.filter((item) => localHour(item.timestamp) < 6 || localHour(item.timestamp) > 18);
    const day = readings.filter((item) => localHour(item.timestamp) === 12);
    const midnight = readings.filter((item) => {
      const local = new Date(new Date(item.timestamp).getTime() + COLOMBO_OFFSET_MILLISECONDS);
      return local.getUTCHours() === 0 && local.getUTCMinutes() === 0;
    });
    expect(night.every((item) => Number(item.powerKw) === 0)).toBe(true);
    expect(day.some((item) => Number(item.powerKw) > 0)).toBe(true);
    expect(midnight).toHaveLength(8);
    expect(readings.every((item) => Number(item.voltage) >= 226 && Number(item.voltage) <= 236)).toBe(true);
  });

  it('keeps read client roles and scope fields consistent', () => {
    const national = dataset.users.filter((item) => item.role === 'national');
    const provincial = dataset.users.filter((item) => item.role === 'provincial');
    const district = dataset.users.filter((item) => item.role === 'district');
    expect(national).toHaveLength(1);
    expect(provincial).toHaveLength(9);
    expect(district).toHaveLength(25);
    expect(national.every((item) => item.provinceId === null && item.districtId === null)).toBe(true);
    expect(provincial.every((item) => item.provinceId !== null && item.districtId === null)).toBe(true);
    expect(district.every((item) => item.provinceId === null && item.districtId !== null)).toBe(true);
  });
});
