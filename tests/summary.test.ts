import { describe, expect, it } from 'vitest';
import { summaryCutoff } from '../src/modules/summaries/validation.js';

const now = Date.parse('2026-08-01T06:44:59.999Z');
describe('district summary cutoff', () => {
  it('uses a stable fifteen-minute bucket and advances at the next boundary', () => {
    expect(summaryCutoff({}, now)).toBe('2026-08-01T06:30:00.000Z');
    expect(summaryCutoff({}, now + 1)).toBe('2026-08-01T06:45:00.000Z');
  });
  it('normalizes explicit offsets and permits historical replay and the exact current instant', () => {
    expect(summaryCutoff({ 'as-of': '2026-08-01T12:00:00+05:30' }, now)).toBe('2026-08-01T06:30:00.000Z');
    expect(summaryCutoff({ 'as-of': new Date(now).toISOString() }, now)).toBe(new Date(now).toISOString());
    expect(summaryCutoff({ 'as-of': '1970-01-01T00:00:00Z' }, now)).toBe('1970-01-01T00:00:00.000Z');
  });
  it.each([
    { 'as-of': '2026-08-01T06:45:00Z' }, { 'as-of': '2026-08-01T06:30:00' },
    { 'as-of': '2026-02-30T00:00:00Z' }, { 'as-of': '2026-08-01T06:30:00.1234Z' },
    { 'as-of': ['2026-08-01T06:00:00Z', '2026-08-01T07:00:00Z'] }, { 'as-of': '' },
    { 'as-of': '1969-12-31T23:59:59Z' }, { asOf: '2026-08-01T06:00:00Z' },
  ])('rejects invalid cutoff query %j', (query) => {
    expect(() => summaryCutoff(query, now)).toThrow(expect.objectContaining({ status: 400, code: 40002 }));
  });
});
