import { describe, expect, it } from 'vitest';
import { historyLinks, parseHistoryQuery } from '../src/modules/readings/history.js';

describe('history query validation and links', () => {
  it('applies bounded defaults and normalizes timezone offsets', () => {
    expect(parseHistoryQuery({})).toEqual({ offset: 0, limit: 25, sort: '-timestamp' });
    expect(parseHistoryQuery({ from: '2026-08-01T11:30:00+05:30' }).from).toBe('2026-08-01T06:00:00.000Z');
  });
  it.each([
    { limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: '1e2' }, { limit: '' },
    { offset: '-1' }, { offset: '2147483648' }, { offset: ' 2' }, { offset: ['0','1'] },
    { limit: ['1', '2'] }, { sort: 'powerKw' }, { unknown: 'x' }, { 'district-id': 'bad' },
    { from: '2026-02-30T00:00:00Z' }, { from: '2026-08-01T06:00:00' },
    { from: '2026-08-01T06:00:00.1234Z' },
    { from: '2026-08-02T00:00:00Z', to: '2026-08-01T00:00:00Z' },
    { from: '2026-08-01T00:00:00Z', to: '2026-08-01T05:30:00+05:30' },
  ])('rejects unsupported, repeated or malformed query %j', (query) => {
    expect(() => parseHistoryQuery(query)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('preserves all filters, sort and page size in safe relative links', () => {
    const query = parseHistoryQuery({ from: '2026-08-01T00:00:00Z', to: '2026-08-02T00:00:00Z', sort: 'timestamp', limit: '2', offset: '2', 'district-id': '11111111-1111-4111-8111-111111111111' });
    const links = historyLinks('/readings', query, 5);
    for (const [link, offset] of [[links.next, '4'], [links.previous, '0']]) {
      const url = new URL(link!, 'http://test');
      expect(url.pathname).toBe('/readings');
      expect(url.searchParams.get('offset')).toBe(offset);
      expect(url.searchParams.get('limit')).toBe('2');
      expect(url.searchParams.get('from')).toBe(query.from);
      expect(url.searchParams.get('to')).toBe(query.to);
      expect(url.searchParams.get('district-id')).toBe(query['district-id']);
      expect(url.searchParams.get('sort')).toBe('timestamp');
    }
    expect(historyLinks('/readings', { ...query, offset: 0 }, 0)).toEqual({ next: null, previous: null });
    const beyond = historyLinks('/readings', { ...query, offset: 100 }, 5);
    expect(beyond.next).toBeNull();
    expect(new URL(beyond.previous!, 'http://test').searchParams.get('offset')).toBe('4');
  });
});
