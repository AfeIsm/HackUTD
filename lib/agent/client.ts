// Nemotron on build.nvidia.com through the OpenAI-compatible API (server only).
// Nothing is sent to OpenAI: the `openai` package is just the client library.

import OpenAI from 'openai';

export const NEMOTRON_MODEL = process.env.NEMOTRON_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';

export const agentConfigured = () => Boolean(process.env.NVIDIA_API_KEY);

let client: OpenAI | null = null;
export function nemotron(): OpenAI {
  client ??= new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
    timeout: 20_000, // per request
    maxRetries: 1,
  });
  return client;
}
