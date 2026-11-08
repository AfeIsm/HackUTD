import type { AgentStep } from '../lib/types';
import type { AgentAnswer } from '../lib/agent/loop';
import type { BuyQuestion } from '../lib/agent/buyOptions';
import { money } from '../lib/format';

type CoachEvent =
  | { type: 'step'; step: AgentStep }
  | { type: 'done'; answer: AgentAnswer }
  | { type: 'error'; error: string };

export function buyCoachContext(purchase: BuyQuestion): string {
  return `Purchase ${JSON.stringify(purchase.label.slice(0, 60))}: ${money(purchase.cost)} on ${purchase.date}. sourceAccountId=${purchase.sourceAccountId}${purchase.goalId ? `; goalId=${purchase.goalId}` : ''}. Include this purchase in each test; keep its price and account; protect other goals. `;
}

/** Read complete events even when a network chunk splits a JSON line or a UTF-8 character. */
export async function readCoachResponse(response: Response, onEvent: (event: CoachEvent) => void): Promise<void> {
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Nemotron couldn’t start. Try again.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  const accept = (line: string) => {
    if (!line.trim() || finished) return;
    let event: CoachEvent;
    try { event = JSON.parse(line) as CoachEvent; }
    catch { throw new Error('Nemotron sent an unreadable response. Try again.'); }
    if (!event || !['step', 'done', 'error'].includes(event.type)) throw new Error('Nemotron sent an unexpected response. Try again.');
    if (event.type === 'step' && (!event.step || typeof event.step.text !== 'string' || !['plan', 'tool', 'result', 'final'].includes(event.step.type))) throw new Error('Nemotron sent an incomplete activity update. Try again.');
    if (event.type === 'done' && (!event.answer || !Array.isArray(event.answer.steps) || !('plan' in event.answer) || typeof event.answer.cached !== 'boolean')) throw new Error('Nemotron sent an incomplete answer. Try again.');
    if (event.type === 'error' && typeof event.error !== 'string') throw new Error('Nemotron couldn’t finish. Try again.');
    onEvent(event);
    if (event.type === 'done' || event.type === 'error') finished = true;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(accept);
      if (done) break;
    }
    accept(buffer);
    if (!finished) throw new Error('The response ended early. Try your question again.');
  } finally {
    reader.releaseLock();
  }
}
