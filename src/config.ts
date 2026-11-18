export interface Config {
  host: string;
  port: number;
  baseUrl: string;
  databaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required. See .env.example');
  const database = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  const base = new URL(env.BASE_URL ?? `http://localhost:${port}`);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/'
  ) {
    throw new Error('BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    baseUrl: base.origin,
    databaseUrl,
  };
}
