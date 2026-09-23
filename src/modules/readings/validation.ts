import { z } from 'zod';
import { ApiError } from '../../http/errors.js';

const measurement = (maximum: number) => z.number().finite().min(0).max(maximum)
  .refine((value) => Number(value.toFixed(3)) === value, 'At most three decimal places are supported');

export const readingSchema = z.object({
  timestamp: z.string().datetime({ offset: true })
    .refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value), 'Include seconds, a timezone and at most three fractional digits')
    .refine((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) >= 0, 'Timestamp must be on or after 1970-01-01T00:00:00Z'),
  powerKw: measurement(999_999_999.999),
  cumulativeEnergyKwh: measurement(999_999_999_999.999),
  voltage: measurement(999_999.999),
}).strict();
export type ReadingInput = z.infer<typeof readingSchema>;

export function parseReading(body: unknown, now = Date.now()): ReadingInput {
  const result = readingSchema.safeParse(body);
  if (!result.success) throw new ApiError(400, 40002, 'Invalid reading request', result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  if (Date.parse(result.data.timestamp) > now + 300_000) {
    throw new ApiError(400, 40002, 'Invalid reading request', [{ field: 'timestamp', message: 'Observation cannot be more than five minutes in the future' }]);
  }
  return { ...result.data, timestamp: new Date(result.data.timestamp).toISOString() };
}

export function resourceId(value: unknown, field: string): string {
  const result = z.uuid().safeParse(value);
  if (!result.success) throw new ApiError(400, 40002, 'Invalid resource identifier', [{ field, message: 'Must be a UUID' }]);
  return result.data.toLowerCase();
}
