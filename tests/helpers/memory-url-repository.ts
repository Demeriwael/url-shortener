import type { ShortUrl, UrlRepository } from '../../src/modules/urls/index.js';

export class MemoryUrlRepository implements UrlRepository {
  readonly urls = new Map<string, ShortUrl>();

  async insert(url: ShortUrl): Promise<boolean> {
    if (this.urls.has(url.code)) return false;
    this.urls.set(url.code, url);
    return true;
  }

  async findByCode(code: string): Promise<ShortUrl | null> {
    return this.urls.get(code) ?? null;
  }
}
