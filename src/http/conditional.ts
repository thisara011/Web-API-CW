import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiError } from './errors.js';

export function representationTag(body: string, context: unknown = null): string {
  return `"${createHash('sha256').update(JSON.stringify(context)).update('\n').update(body).digest('hex')}"`;
}

// Parse quoted opaque tags, including commas inside a tag. Only * by itself
// is a wildcard; a weak tag never satisfies the strong If-Match comparison.
function tags(value: string): string[] | '*' {
  if (value.trim() === '*') return '*';
  const result: string[] = [];
  let rest = value;
  while (rest.length) {
    rest = rest.replace(/^[\t ,]+/, '');
    if (!rest) break;
    const match = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"/.exec(rest);
    if (!match) throw new ApiError(400, 40002, 'Malformed conditional entity tag');
    result.push(match[0]);
    rest = rest.slice(match[0].length);
    if (/^[\t ]*$/.test(rest)) rest = '';
    if (rest.length && !/^[\t ]*,/.test(rest)) throw new ApiError(400, 40002, 'Malformed conditional entity tag');
  }
  if (!result.length) throw new ApiError(400, 40002, 'Malformed conditional entity tag');
  return result;
}
function matches(value: string, etag: string, weak: boolean): boolean {
  const list = tags(value);
  return list === '*' || list.some((tag) => (weak ? tag.replace(/^W\//, '') : tag) === etag);
}
function httpDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  // HTTP dates, not ISO/integers accepted loosely by Date.parse.
  if (!/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function conditionalStatus(headers: Request['headers'], etag: string, modified?: Date, dateRevalidation = false): 200 | 304 {
  const ifMatch = headers['if-match'];
  if (ifMatch !== undefined) {
    if (!matches(ifMatch, etag, false)) throw new ApiError(412, 41201, 'Representation precondition failed');
  } else {
    const unmodified = httpDate(headers['if-unmodified-since']);
    if (modified && unmodified !== undefined && modified.getTime() > unmodified) throw new ApiError(412, 41201, 'Representation precondition failed');
  }
  const ifNone = headers['if-none-match'];
  if (ifNone !== undefined) return matches(ifNone, etag, true) ? 304 : 200;
  const since = httpDate(headers['if-modified-since']);
  // Only immutable resources can safely use date-only revalidation here.
  // Keep millisecond precision for comparisons: never round a new change down
  // into a client's second-resolution validator and incorrectly return 304.
  if (dateRevalidation && modified && since !== undefined && modified.getTime() <= since) return 304;
  return 200;
}

export function sendRepresentation(request: Request, response: Response, value: unknown, options: { modified?: Date | null; immutable?: boolean } = {}): void {
  const body = JSON.stringify(value);
  const principal = request.principal;
  const context = options.immutable ? null : [request.originalUrl, principal?.kind === 'analyst' ? [principal.role, principal.provinceId, principal.districtId] : null];
  const etag = representationTag(body, context);
  const modified = options.modified ?? undefined;
  // Caller must already have authenticated, authorized and retrieved the data.
  const status = conditionalStatus(request.headers, etag, modified, options.immutable ?? false);
  response.set('ETag', etag).set('Cache-Control', 'private, no-cache');
  response.vary('Authorization');
  response.vary('Accept');
  if (modified) response.set('Last-Modified', modified.toUTCString());
  if (status === 304) { response.status(304).end(); return; }
  // End directly so Express's automatic freshness check cannot override the
  // precondition order or the conservative date policy above.
  response.status(200).type('application/json').set('Content-Length', String(Buffer.byteLength(body)));
  response.end(request.method === 'HEAD' ? undefined : body);
}
