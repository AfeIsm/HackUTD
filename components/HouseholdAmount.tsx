import { money } from '@/lib/format';

/** Only known cash inflows/outflows get +/- signs; transfers have no known direction. */
export function HouseholdAmount({ amount, kind = 'balance' }: {
  amount: number; kind?: 'balance' | 'income' | 'expense' | 'debt' | 'transfer';
}) {
  const incoming = kind === 'income';
  const outgoing = kind === 'expense' || kind === 'debt' || amount < 0;
  const color = amount === 0 || kind === 'transfer' ? 'text-muted' : outgoing ? 'text-bad' : 'text-good';
  const label = incoming ? `+${money(Math.abs(amount))}` : kind === 'expense' ? `−${money(Math.abs(amount))}` : money(amount);
  return <span className={`${color} font-semibold tabular-nums`}>{label}</span>;
}
