import { describe, expect, it, vi } from 'vitest';
import { readComparisonResponse } from './compareStream';
const done = { type: 'done', recommendation: { id: 'payday', why: 'Wait for a healthier buffer.', source: 'nemotron' }, searchMessage: null };
function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }));
}
describe('comparison stream', () => {
  it('reads fragmented Unicode, scenario updates and a final line without a newline', async () => {
    const step = { type: 'step', step: { type: 'tool', text: 'Compared café spending…' } };
    const accept = vi.fn();
    await readComparisonResponse(stream(`${JSON.stringify(step)}\n${JSON.stringify({ type: 'scenarios', scenarios: [] })}\n${JSON.stringify(done)}`), accept);
    expect(accept).toHaveBeenCalledTimes(3);
    expect(accept).toHaveBeenLastCalledWith(done);
  });
  it('does not silently accept an incomplete or malformed response', async () => {
    await expect(readComparisonResponse(stream('{"type":"scenarios","scenarios":[]}\n'), vi.fn())).rejects.toThrow('ended early');
    await expect(readComparisonResponse(stream('{broken}\n'), vi.fn())).rejects.toThrow('interrupted');
  });
  it('preserves authentication and rate-limit errors', async () => {
    await expect(readComparisonResponse(Response.json({ error: 'Please sign in.' }, { status: 401 }), vi.fn())).rejects.toThrow('Please sign in.');
  });
});
