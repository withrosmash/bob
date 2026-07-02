import { CONFIG } from './config.js';
import { getApiKey } from './storage.js';

export class AuthError extends Error {}
export class ClaudeError extends Error {}

/**
 * Call the Anthropic Messages API directly from the browser.
 *
 * options:
 *   system     — system prompt string
 *   prompt     — user message string
 *   webSearch  — number: enable the server-side web search tool with this max_uses
 *   schema     — JSON schema: constrain the response to valid JSON matching it
 *   maxTokens  — output cap (default 4096)
 *
 * Returns the concatenated text of the response (a parsed object when schema is set).
 */
export async function askClaude({ system, prompt, webSearch = 0, schema = null, maxTokens = 4096 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new AuthError('No API key set');

  const body = {
    model: CONFIG.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (webSearch > 0) {
    body.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: webSearch }];
  }
  if (schema) {
    body.output_config = { format: { type: 'json_schema', schema } };
  }

  let res;
  try {
    res = await fetch(CONFIG.anthropicUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CONFIG.anthropicVersion,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ClaudeError('Network error — check your connection.');
  }

  if (res.status === 401) throw new AuthError('API key rejected');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    throw new ClaudeError(detail || `API error (${res.status})`);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new ClaudeError('Claude declined this request.');
  }

  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  if (!text) throw new ClaudeError('Empty response from Claude.');
  return schema ? JSON.parse(text) : text;
}

/**
 * Pull a JSON object/array out of a text response — used for web-search-backed
 * features where we ask for JSON in the prompt rather than via output_config.
 */
export function extractJSON(text) {
  const start = text.search(/[[{]/);
  if (start === -1) throw new ClaudeError('No JSON found in response.');
  const opener = text[start];
  const closer = opener === '[' ? ']' : '}';
  const end = text.lastIndexOf(closer);
  if (end <= start) throw new ClaudeError('Malformed JSON in response.');
  return JSON.parse(text.slice(start, end + 1));
}
