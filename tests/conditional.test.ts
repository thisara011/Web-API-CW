import { describe, expect, it } from 'vitest';
import { conditionalStatus, representationTag } from '../src/http/conditional.js';

const etag = '"current"';
const modified = new Date('2026-08-01T06:00:00.123Z');
describe('HTTP conditional precedence and entity-tag comparisons', () => {
  it.each(['"current"', 'W/"current"', '"other", W/"current"', '"embedded,comma", "current"', '*', ' , "current" , '])('uses weak comparison for If-None-Match %s', (tag) => {
    expect(conditionalStatus({ 'if-none-match': tag }, etag)).toBe(304);
  });
  it('uses strong comparison for If-Match and prioritizes it over If-None-Match', () => {
    expect(() => conditionalStatus({ 'if-match': 'W/"current"' }, etag)).toThrow(expect.objectContaining({ status: 412 }));
    expect(() => conditionalStatus({ 'if-match': '"old"', 'if-none-match': '*' }, etag)).toThrow(expect.objectContaining({ status: 412 }));
    expect(conditionalStatus({ 'if-match': '"old", "current"' }, etag)).toBe(200);
    expect(conditionalStatus({ 'if-match': '*' }, etag)).toBe(200);
  });
  it('gives entity tags precedence over dates and orders unmodified before none-match', () => {
    expect(conditionalStatus({ 'if-match': etag, 'if-unmodified-since': 'Sat, 01 Aug 2026 05:00:00 GMT' }, etag, modified)).toBe(200);
    expect(() => conditionalStatus({ 'if-unmodified-since': 'Sat, 01 Aug 2026 05:00:00 GMT', 'if-none-match': '*' }, etag, modified)).toThrow(expect.objectContaining({ status: 412 }));
    expect(conditionalStatus({ 'if-none-match': '"different"', 'if-modified-since': 'Sat, 01 Aug 2026 07:00:00 GMT' }, etag, modified, true)).toBe(200);
  });
  it('uses conservative dates: subsecond changes and mutable resources cannot incorrectly become 304', () => {
    expect(conditionalStatus({ 'if-modified-since': modified.toUTCString() }, etag, modified, true)).toBe(200);
    expect(conditionalStatus({ 'if-modified-since': 'Sat, 01 Aug 2026 06:00:01 GMT' }, etag, modified, true)).toBe(304);
    expect(conditionalStatus({ 'if-modified-since': 'Sat, 01 Aug 2026 06:00:01 GMT' }, etag, modified)).toBe(200);
    expect(conditionalStatus({ 'if-modified-since': '2026-08-01' }, etag, modified, true)).toBe(200);
    expect(() => conditionalStatus({ 'if-unmodified-since': modified.toUTCString() }, etag, modified)).toThrow(expect.objectContaining({ status: 412 }));
  });
  it.each(['garbage', 'W/current', '"a" "b"', '*, "current"', '"unclosed'])('rejects malformed tag %s', (tag) => {
    expect(() => conditionalStatus({ 'if-none-match': tag }, etag)).toThrow(expect.objectContaining({ status: 400 }));
  });
  it('hashes the actual representation and its selected context deterministically', () => {
    const body = JSON.stringify({ data: [], count: 0 });
    expect(representationTag(body, ['district', 'a'])).toBe(representationTag(body, ['district', 'a']));
    expect(representationTag(body, ['district', 'a'])).not.toBe(representationTag(body, ['district', 'b']));
    expect(representationTag(body)).not.toBe(representationTag('{}'));
  });
});
