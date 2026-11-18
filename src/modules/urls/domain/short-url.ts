export interface ShortUrl {
  code: string;
  url: string;
  expiresAt: Date | null;
}

export interface CreateUrlInput {
  url: string;
  customAlias?: string;
  expiresAt?: string;
}

export interface CreatedUrl {
  shortUrl: string;
  code: string;
  url: string;
  expiresAt: string | null;
}

export interface UrlRepository {
  /** Returns false only when the code is already taken (including concurrent inserts). */
  insert(url: ShortUrl): Promise<boolean>;
  findByCode(code: string): Promise<ShortUrl | null>;
}

export const CODE_PATTERN = '^[A-Za-z0-9_-]{3,64}$';
