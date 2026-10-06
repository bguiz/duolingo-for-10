export interface LlmClient {
  /** One stateless completion: a fresh context every call. */
  complete(system: string, user: string): Promise<string>;
}

export interface OpencodeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** opencode go, via its OpenAI-compatible chat completions endpoint. */
export class OpencodeGoClient implements LlmClient {
  constructor(private readonly cfg: OpencodeConfig) {}

  async complete(system: string, user: string): Promise<string> {
    if (!this.cfg.apiKey || !this.cfg.model) throw new Error('LLM is not configured (OPENCODE_GO_API_KEY / OPENCODE_GO_MODEL)');
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned no content');
    return content;
  }
}
