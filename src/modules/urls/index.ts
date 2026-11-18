// The module's public boundary; other modules should import only this file.
import type { Pool } from 'pg';
import { UrlService } from './application/url-service.js';
import { PgUrlRepository } from './infrastructure/pg-url-repository.js';

export { UrlService } from './application/url-service.js';
export { registerUrlRoutes } from './http/routes.js';
export type { UrlRepository, ShortUrl } from './domain/short-url.js';

export function createUrlService(pool: Pool, baseUrl: string): UrlService {
  return new UrlService(new PgUrlRepository(pool), baseUrl);
}
