import { z } from 'zod';
import { ApiError } from '../../http/errors.js';

export const SUMMARY_SLOT_MS = 15 * 60 * 1000;
export const FRESHNESS_MINUTES = 30;
const querySchema = z.object({
  'as-of': z.string().datetime({ offset: true })
    .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value), 'Include seconds, a timezone and at most three fractional digits')
    .refine((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) >= 0, 'Cutoff must be on or after the Unix epoch')
    .optional(),
}).strict();

export function summaryCutoff(query: unknown, now = Date.now()): string {
  const result = querySchema.safeParse(query);
  if (!result.success) throw new ApiError(400, 40002, 'Invalid summary query', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  const cutoff = result.data['as-of'] === undefined
    ? Math.floor(now / SUMMARY_SLOT_MS) * SUMMARY_SLOT_MS : Date.parse(result.data['as-of']);
  if (cutoff > now) throw new ApiError(400, 40002, 'Summary cutoff cannot be in the future', [{ field: 'as-of', message: 'Must be at or before server time' }]);
  return new Date(cutoff).toISOString();
}
