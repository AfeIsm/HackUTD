// Display helpers shared by pages and components.

export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

export function money0(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

// '2026-11-12' → 'Nov 12'
export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// '2026-11-13' → 'Fri, Nov 13'
export function dayDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export function cadenceLabel(cadence: 'weekly' | 'biweekly' | 'monthly'): string {
  return cadence === 'weekly' ? 'Weekly' : cadence === 'biweekly' ? 'Every 2 weeks' : 'Monthly';
}
