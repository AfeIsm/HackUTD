import { describe, expect, it, vi } from 'vitest';
import { buyCoachContext, readCoachResponse } from './buyCoachRequest';

const answer = { question: 'Can I buy it?', steps: [], plan: null, message: 'Try waiting.', model: 'test', cached: false };
const complete = { type: 'done', answer };

function streamed(text: string, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  }));
}

describe('purchase coach context', () => {
  it('retains exact cents, purchase date, account and goal within the existing API limit', () => {
    const context = buyCoachContext({ label: 'A'.repeat(80), cost: 12345, date: '2026-11-21', sourceAccountId: 'a'.repeat(36), goalId: 'g'.repeat(36) });
    expect(context).toContain('$123.45');
    expect(context).toContain('2026-11-21');
    expect(context).toContain(`sourceAccountId=${'a'.repeat(36)}`);
    expect(context).toContain(`goalId=${'g'.repeat(36)}`);
    expect((context + 'Would waiting until payday help? Keep the same item, price and account.').length).toBeLessThanOrEqual(400);
  });
});

describe('purchase coach responses', () => {
  it('reads fragmented UTF-8, blank lines, and a final event without a newline', async () => {
    const step = { type: 'step', step: { type: 'tool', text: 'Checking café spending…' } };
    const received = vi.fn();
    await readCoachResponse(streamed(`${JSON.stringify(step)}\r\n\n${JSON.stringify(complete)}`, 1), received);
    expect(received.mock.calls).toEqual([[step], [complete]]);
  });

  it('ignores events after a terminal response', async () => {
    const received = vi.fn();
    await readCoachResponse(streamed(`${JSON.stringify(complete)}\n${JSON.stringify({ type: 'error', error: 'Late error' })}\n`), received);
    expect(received).toHaveBeenCalledExactlyOnceWith(complete);
  });

  it('preserves a server-side configuration or rate-limit error', async () => {
    await expect(readCoachResponse(Response.json({ error: 'The coach is busy.' }, { status: 429 }), vi.fn())).rejects.toThrow('The coach is busy.');
  });

  it('delivers streamed errors as terminal events', async () => {
    const error = { type: 'error', error: 'Try again soon.' };
    const received = vi.fn();
    await readCoachResponse(streamed(JSON.stringify(error)), received);
    expect(received).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('detects an interrupted response instead of silently showing no answer', async () => {
    await expect(readCoachResponse(streamed(JSON.stringify({ type: 'step', step: { type: 'plan', text: 'Starting…' } })), vi.fn())).rejects.toThrow('ended early');
  });

  it('reports malformed events with a readable error', async () => {
    await expect(readCoachResponse(streamed('{broken json}\n'), vi.fn())).rejects.toThrow('unreadable response');
    await expect(readCoachResponse(streamed('{"type":"unknown"}\n'), vi.fn())).rejects.toThrow('unexpected response');
  });

  it('rejects incomplete payloads before they reach the UI', async () => {
    await expect(readCoachResponse(streamed('{"type":"step"}\n'), vi.fn())).rejects.toThrow('incomplete activity');
    await expect(readCoachResponse(streamed('{"type":"done"}\n'), vi.fn())).rejects.toThrow('incomplete answer');
    await expect(readCoachResponse(streamed('{"type":"error"}\n'), vi.fn())).rejects.toThrow('couldn’t finish');
  });
});
