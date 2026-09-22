import { createHash } from 'node:crypto';
import { passwordHash } from '../auth/passwords.js';

export const GENERATOR_VERSION = 'solar-coursework-v2';
export const RANDOM_SEED = 'slsea-coursework-2026-v1';
// 25 August 2026 at midnight in Asia/Colombo. The inclusive start is exactly
// seven days before this cutoff, providing 673 15-minute observations/site.
export const SEED_REFERENCE = '2026-08-24T18:30:00.000Z';
export const REPORTING_INTERVAL_MINUTES = 15;
export const READINGS_PER_INSTALLATION = 673;
export const COLOMBO_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1_000;

interface ProvinceSource {
  code: string;
  name: string;
  districts: Array<{ code: string; name: string }>;
}

const hierarchy: ProvinceSource[] = [
  { code: 'WP', name: 'Western Province', districts: [{ code: 'COL', name: 'Colombo' }, { code: 'GAM', name: 'Gampaha' }, { code: 'KAL', name: 'Kalutara' }] },
  { code: 'CP', name: 'Central Province', districts: [{ code: 'KAN', name: 'Kandy' }, { code: 'MAT', name: 'Matale' }, { code: 'NUE', name: 'Nuwara Eliya' }] },
  { code: 'SP', name: 'Southern Province', districts: [{ code: 'GAL', name: 'Galle' }, { code: 'MTR', name: 'Matara' }, { code: 'HAM', name: 'Hambantota' }] },
  { code: 'NP', name: 'Northern Province', districts: [{ code: 'JAF', name: 'Jaffna' }, { code: 'KIL', name: 'Kilinochchi' }, { code: 'MAN', name: 'Mannar' }, { code: 'MUL', name: 'Mullaitivu' }, { code: 'VAV', name: 'Vavuniya' }] },
  { code: 'EP', name: 'Eastern Province', districts: [{ code: 'TRI', name: 'Trincomalee' }, { code: 'BAT', name: 'Batticaloa' }, { code: 'AMP', name: 'Ampara' }] },
  { code: 'NW', name: 'North Western Province', districts: [{ code: 'KUR', name: 'Kurunegala' }, { code: 'PUT', name: 'Puttalam' }] },
  { code: 'NC', name: 'North Central Province', districts: [{ code: 'ANU', name: 'Anuradhapura' }, { code: 'POL', name: 'Polonnaruwa' }] },
  { code: 'UV', name: 'Uva Province', districts: [{ code: 'BAD', name: 'Badulla' }, { code: 'MON', name: 'Monaragala' }] },
  { code: 'SG', name: 'Sabaragamuwa Province', districts: [{ code: 'RAT', name: 'Ratnapura' }, { code: 'KEG', name: 'Kegalle' }] },
];

// The fixture credentials are derived once per process. This keeps repeated
// deterministic-data checks fast while production verification remains scrypt.
const fixtureHashCache = new Map<string, string>();
function fixtureHash(password: string, salt: string): string {
  const key = `${salt}\u0000${password}`;
  const existing = fixtureHashCache.get(key);
  if (existing) return existing;
  const value = passwordHash(password, salt);
  fixtureHashCache.set(key, value);
  return value;
}

export interface ProvinceSeed { id: string; code: string; name: string }
export interface DistrictSeed { id: string; provinceId: string; code: string; name: string }
export interface SubstationSeed { id: string; districtId: string; code: string; name: string }
export interface InstallationSeed {
  id: string; gridSubstationId: string; meterId: string; siteLabel: string;
  capacityKw: string; commissionedDate: string; credentialHash: string;
}
export interface ReadingSeed {
  id: string; installationId: string; timestamp: string; powerKw: string;
  cumulativeEnergyKwh: string; voltage: string;
}
export interface UserSeed {
  id: string; email: string; passwordHash: string; role: 'national' | 'provincial' | 'district';
  provinceId: string | null; districtId: string | null;
}
export interface SeedDataset {
  provinces: ProvinceSeed[]; districts: DistrictSeed[]; substations: SubstationSeed[];
  installations: InstallationSeed[]; readings: ReadingSeed[]; users: UserSeed[];
  checksum: string;
}

function deterministicUuid(key: string): string {
  const bytes = Buffer.from(createHash('sha256').update(`${RANDOM_SEED}:${key}`).digest('hex').slice(0, 32), 'hex');
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function seededNumber(key: string): number {
  const value = createHash('sha256').update(`${RANDOM_SEED}:${key}`).digest().readUInt32BE(0);
  return value / 0x1_0000_0000;
}

function three(value: number): string {
  return value.toFixed(3);
}

function localClock(timestamp: number): { hour: number; minute: number } {
  const local = new Date(timestamp + COLOMBO_OFFSET_MILLISECONDS);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

function powerAt(timestamp: number, capacityKw: number, installationKey: string): number {
  const { hour, minute } = localClock(timestamp);
  const time = hour + minute / 60;
  if (time < 6 || time > 18) return 0;
  const daylight = Math.sin(Math.PI * (time - 6) / 12);
  const day = Math.floor(timestamp / 86_400_000);
  const cloud = 0.68 + seededNumber(`${installationKey}:cloud:${day}`) * 0.28;
  const variation = 0.94 + seededNumber(`${installationKey}:slot:${timestamp}`) * 0.12;
  return Math.max(0, capacityKw * daylight * cloud * variation);
}

function datasetChecksum(dataset: Omit<SeedDataset, 'checksum'>): string {
  return createHash('sha256').update(JSON.stringify({
    version: GENERATOR_VERSION,
    reference: SEED_REFERENCE,
    interval: REPORTING_INTERVAL_MINUTES,
    provinces: dataset.provinces,
    districts: dataset.districts,
    substations: dataset.substations,
    installations: dataset.installations,
    users: dataset.users,
    readings: dataset.readings,
  })).digest('hex');
}

export function createSeedDataset(): SeedDataset {
  const provinces: ProvinceSeed[] = [];
  const districts: DistrictSeed[] = [];
  const substations: SubstationSeed[] = [];
  const installations: InstallationSeed[] = [];
  const users: UserSeed[] = [];
  for (const source of hierarchy) {
    const provinceId = deterministicUuid(`province:${source.code}`);
    provinces.push({ id: provinceId, code: source.code, name: source.name });
    users.push({
      id: deterministicUuid(`user:province:${source.code}`), email: `analyst-${source.code.toLowerCase()}@slsea.example`,
      passwordHash: fixtureHash('Coursework-Demo-Password-2026!', `user:${source.code}`), role: 'provincial', provinceId, districtId: null,
    });
    for (const district of source.districts) {
      const districtId = deterministicUuid(`district:${district.code}`);
      districts.push({ id: districtId, provinceId, code: district.code, name: district.name });
      const substationId = deterministicUuid(`substation:${district.code}-01`);
      substations.push({ id: substationId, districtId, code: `${district.code}-01`, name: `${district.name} Solar Grid Substation` });
      users.push({
        id: deterministicUuid(`user:district:${district.code}`), email: `analyst-${district.code.toLowerCase()}@slsea.example`,
        passwordHash: fixtureHash('Coursework-Demo-Password-2026!', `user:${district.code}`), role: 'district', provinceId: null, districtId,
      });
      for (let number = 1; number <= 8; number += 1) {
        const installationKey = `${district.code}-${String(number).padStart(2, '0')}`;
        const capacity = 3 + seededNumber(`${installationKey}:capacity`) * 9;
        installations.push({
          id: deterministicUuid(`installation:${installationKey}`), gridSubstationId: substationId,
          meterId: `SLSEA-${district.code}-${String(number).padStart(3, '0')}`,
          siteLabel: `${district.name} Rooftop Solar ${String(number).padStart(2, '0')}`,
          capacityKw: three(capacity),
          commissionedDate: `202${2 + Math.floor(seededNumber(`${installationKey}:year`) * 4)}-${String(1 + Math.floor(seededNumber(`${installationKey}:month`) * 12)).padStart(2, '0')}-${String(1 + Math.floor(seededNumber(`${installationKey}:day`) * 28)).padStart(2, '0')}`,
          credentialHash: fixtureHash(`device-SLSEA-${district.code}-${String(number).padStart(3, '0')}`, `device:${district.code}:${number}`),
        });
      }
    }
  }
  users.unshift({
    id: deterministicUuid('user:national'), email: 'analyst-national@slsea.example',
    passwordHash: fixtureHash('Coursework-Demo-Password-2026!', 'user:national'), role: 'national', provinceId: null, districtId: null,
  });

  const readings: ReadingSeed[] = [];
  const cutoff = new Date(SEED_REFERENCE).getTime();
  const start = cutoff - 7 * 24 * 60 * 60 * 1_000;
  for (const installation of installations) {
    const capacity = Number(installation.capacityKw);
    let cumulative = 400 + seededNumber(`${installation.id}:initial-energy`) * 3_600;
    let previousPower = powerAt(start, capacity, installation.id);
    for (let slot = 0; slot < READINGS_PER_INSTALLATION; slot += 1) {
      const instant = start + slot * REPORTING_INTERVAL_MINUTES * 60 * 1_000;
      if (slot > 0) {
        const currentPower = powerAt(instant, capacity, installation.id);
        cumulative += (previousPower + currentPower) / 2 * (REPORTING_INTERVAL_MINUTES / 60);
        previousPower = currentPower;
      }
      const power = powerAt(instant, capacity, installation.id);
      const voltage = 226 + seededNumber(`${installation.id}:voltage:${instant}`) * 10;
      const timestamp = new Date(instant).toISOString();
      readings.push({
        id: deterministicUuid(`reading:${installation.id}:${timestamp}`), installationId: installation.id, timestamp,
        powerKw: three(power), cumulativeEnergyKwh: three(cumulative), voltage: three(voltage),
      });
    }
  }
  const withoutChecksum = { provinces, districts, substations, installations, readings, users };
  return { ...withoutChecksum, checksum: datasetChecksum(withoutChecksum) };
}
