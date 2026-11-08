import type { ComparisonEvent } from '../lib/agent/compare';

export async function readComparisonResponse(response: Response, accept: (event: ComparisonEvent) => void) {
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'The comparison couldn’t start. Try again.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', finished = false;
  const line = (text: string) => {
    if (!text.trim() || finished) return;
    let event: ComparisonEvent;
    try { event = JSON.parse(text) as ComparisonEvent; } catch { throw new Error('The comparison response was interrupted. Try again.'); }
    if (!event || !['step', 'scenarios', 'done', 'error'].includes(event.type)) throw new Error('The comparison response was unexpected. Try again.');
    accept(event);
    finished = event.type === 'done' || event.type === 'error';
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(line);
      if (done) break;
    }
    line(buffer);
    if (!finished) throw new Error('The comparison ended early. Try again.');
  } finally { reader.releaseLock(); }
}
