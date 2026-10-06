export interface Config {
  port: number;
  baseUrl: string;
  dbPath: string;
  llm: { apiKey: string; baseUrl: string; model: string };
}

/** Reads settings from env vars (.env locally via --env-file; Cloudflare Secrets Store when deployed). */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  return {
    port,
    baseUrl: (env.APP_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, ''),
    dbPath: env.DB_PATH ?? 'data/app.db',
    llm: {
      apiKey: env.OPENCODE_GO_API_KEY ?? '',
      baseUrl: env.OPENCODE_GO_BASE_URL ?? 'https://opencode.ai/zen/go/v1',
      model: env.OPENCODE_GO_MODEL ?? '',
    },
  };
}
