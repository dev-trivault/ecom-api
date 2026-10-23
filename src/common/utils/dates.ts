/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone, e.g. Asia/Kolkata. */
export function todayIn(timezone: string): string {
  return formatDateIn(new Date(), timezone);
}

export function formatDateIn(date: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Converts a YYYY-MM-DD string to the Date Prisma expects for `@db.Date` columns. */
export function toDbDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** YYYY-MM-DD of `date` shifted by `days`. Works on plain calendar dates, no timezone maths. */
export function addDays(value: string, days: number): string {
  const d = toDbDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The UTC instant at which calendar date `value` (YYYY-MM-DD) begins in `timezone`. */
export function startOfDayIn(value: string, timezone: string): Date {
  const utcMidnight = toDbDate(value);
  return new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight, timezone) * 60_000);
}

/** Prisma `where` fragment for a timestamp column between two optional inclusive calendar dates. */
export function timestampRange(timezone: string, from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: startOfDayIn(from, timezone) } : {}),
    ...(to ? { lt: startOfDayIn(addDays(to, 1), timezone) } : {}),
  };
}

function offsetMinutes(date: Date, timezone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Prisma `where` fragment for a `@db.Date` column between two optional inclusive dates. */
export function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDbDate(from) } : {}),
    ...(to ? { lte: toDbDate(to) } : {}),
  };
}
