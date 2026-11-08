import type { SharedHouseholdMember } from '@/lib/household-sharing';
import { lookOf } from '@/lib/people';
import { dayDate } from '@/lib/format';
import { HouseholdAmount } from './HouseholdAmount';
import { Avatar, Card, StatusPill } from './ui';

export function HouseholdMemberCard({ member, own }: { member: SharedHouseholdMember; own: boolean }) {
  const { data } = member;
  const look = lookOf(member.name, member.memberId);
  const visible = Object.keys(data).length > 0;
  return <Card className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
    <div className="flex items-center gap-3">
      <Avatar initial={look.initial} color={look.color} />
      <div><h2 className="m-0 text-[22px]">{member.name}{own ? ' (you)' : ''}</h2><span className="text-sm text-muted">@{member.username} · {member.role}</span></div>
    </div>
    {!visible && <p className="m-0 text-sm text-muted">{member.unavailable ? 'Shared data is temporarily unavailable.' : 'This member is keeping their financial data private.'}</p>}
    {data.health && <div className="flex items-center gap-3"><strong>Health score: {data.health.score ?? 'Needs input'}</strong><StatusPill status={data.health.overall} /></div>}
    {data.balances && <div><h3 className="m-0 mb-2 text-base">Balances</h3>{data.balances.map((a, i) => <p key={i} className="m-0 flex justify-between gap-3 py-2 text-sm"><span>{a.nickname} · {a.type}</span><HouseholdAmount amount={a.balance} kind={a.type === 'Credit Card' ? 'debt' : 'balance'} /></p>)}</div>}
    {'income' in data && <div><h3 className="m-0 mb-1 text-base">Income</h3><p className="m-0 text-sm text-ink-2">{data.income ? <><HouseholdAmount amount={data.income.avgAmount} kind="income" /> every {data.income.cadenceDays} days · next {dayDate(data.income.nextDate)}</> : 'No regular paycheck detected.'}</p></div>}
    {data.obligations && <div><h3 className="m-0 mb-2 text-base">Bills and loans</h3>{!data.obligations.length && <p className="m-0 text-sm text-muted">No scheduled payments.</p>}{data.obligations.map((o, i) => <p key={i} className="m-0 flex justify-between gap-3 py-2 text-sm"><span>{o.name} · {dayDate(o.nextDate)}</span><HouseholdAmount amount={o.amount} kind="expense" /></p>)}</div>}
    {data.goals && <div><h3 className="m-0 mb-2 text-base">Savings goals</h3>{!data.goals.length && <p className="m-0 text-sm text-muted">No goals set.</p>}{data.goals.map((g, i) => <p key={i} className="m-0 flex justify-between gap-3 py-2 text-sm"><span>{g.name}</span><HouseholdAmount amount={g.amount} /></p>)}</div>}
    {data.transactions && <div><h3 className="m-0 mb-2 text-base">Recent transactions</h3>{!data.transactions.length && <p className="m-0 text-sm text-muted">No recent transactions.</p>}{data.transactions.map((t, i) => <p key={i} className="m-0 flex justify-between gap-3 py-2 text-sm"><span>{t.description} · {t.kind} · {dayDate(t.date)}</span><HouseholdAmount amount={t.amount} kind={t.kind === 'deposit' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense'} /></p>)}</div>}
  </Card>;
}
