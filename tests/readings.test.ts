import { describe, expect, it } from 'vitest';
import { parseReading, resourceId } from '../src/modules/readings/validation.js';

const now = Date.parse('2026-09-23T06:00:00Z');
const body = { timestamp: '2026-09-23T06:00:00Z', powerKw: 3.42, cumulativeEnergyKwh: 1267.84, voltage: 231.2 };
describe('reading validation', () => {
  it('accepts whole seconds, millisecond precision and offsets, normalizing to UTC', () => {
    expect(parseReading(body, now).timestamp).toBe('2026-09-23T06:00:00.000Z');
    expect(parseReading({ ...body, timestamp: '2026-09-23T11:30:00.123+05:30' }, now).timestamp).toBe('2026-09-23T06:00:00.123Z');
  });
  it.each(['2026-02-30T06:00:00Z', '2026-09-23T06:00:00', '2026-09-23T06:00:00.1234Z', '1969-12-31T23:59:59Z', '2026-09-23T06:05:00.001Z'])('rejects invalid or future timestamp %s', (timestamp) => {
    expect(() => parseReading({ ...body, timestamp }, now)).toThrow();
  });
  it('accepts exactly the five-minute future boundary', () => {
    expect(parseReading({ ...body, timestamp: '2026-09-23T06:05:00Z' }, now)).toBeDefined();
  });
  it.each(['powerKw', 'cumulativeEnergyKwh', 'voltage'])('rejects invalid %s values without coercing or rounding', (field) => {
    for (const value of [-1, Infinity, NaN, 1.2345, '1.2', null, 1e15]) {
      expect(() => parseReading({ ...body, [field]: value }, now)).toThrow();
    }
  });
  it('accepts the database numeric boundaries and zero night-time power', () => {
    expect(parseReading({ ...body, powerKw: 999_999_999.999, cumulativeEnergyKwh: 999_999_999_999.999, voltage: 999_999.999 }, now)).toBeDefined();
    expect(parseReading({ ...body, powerKw: 0 }, now).powerKw).toBe(0);
  });
  it('rejects owner spoofing, missing fields and invalid IDs', () => {
    expect(() => parseReading({ ...body, installationId: 'spoof' }, now)).toThrow();
    expect(() => parseReading({}, now)).toThrow();
    expect(() => resourceId('invalid', 'installationId')).toThrow();
    expect(resourceId('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'installationId')).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
