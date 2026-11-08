// Pure date helpers. Dates are 'YYYY-MM-DD' strings; math is done in whole UTC days
// so time zones and daylight saving can never shift a result.

const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function daysBetween(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

// Same day next month, clamped to the month's last day (Jan 31 + 1 month = Feb 28).
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function nextSemiMonthly(date: string, days: [number, number]): string {
  const [y, m] = date.split('-').map(Number);
  for (let offset = 0; offset <= 1; offset++) {
    const month = new Date(Date.UTC(y, m - 1 + offset, 1));
    const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    for (const day of days) {
      const candidate = `${month.toISOString().slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}`;
      if (candidate > date) return candidate;
    }
  }
  throw new Error('Invalid semi-monthly schedule');
}
