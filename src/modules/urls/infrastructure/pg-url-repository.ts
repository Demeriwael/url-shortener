import type { Pool } from 'pg';
import type { ShortUrl, UrlRepository } from '../domain/short-url.js';

export class PgUrlRepository implements UrlRepository {
  constructor(private readonly pool: Pool) {}

  async insert(url: ShortUrl): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO urls.short_urls (code, original_url, expires_at)
       VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING RETURNING code`,
      [url.code, url.url, url.expiresAt],
    );
    return result.rowCount === 1;
  }

  async findByCode(code: string): Promise<ShortUrl | null> {
    const result = await this.pool.query<ShortUrl>(
      'SELECT code, original_url AS url, expires_at AS "expiresAt" FROM urls.short_urls WHERE code = $1',
      [code],
    );
    return result.rows[0] ?? null;
  }
}
