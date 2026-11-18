import { randomBytes } from 'node:crypto';
import { AppError } from '../../../shared/app-error.js';
import { CODE_PATTERN } from '../domain/short-url.js';
import type { CreatedUrl, CreateUrlInput, UrlRepository } from '../domain/short-url.js';

export class UrlService {
  constructor(
    private readonly repository: UrlRepository,
    private readonly baseUrl: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly generateCode: () => string = () => randomBytes(6).toString('base64url'),
  ) {}

  async create(input: CreateUrlInput): Promise<CreatedUrl> {
    let destination: URL;
    try {
      destination = new URL(input.url);
    } catch {
      throw new AppError(400, 'INVALID_URL', 'url must be an absolute HTTP(S) URL');
    }
    if (
      !['http:', 'https:'].includes(destination.protocol) ||
      destination.username || destination.password ||
      !/^https?:\/\//i.test(input.url) || /[\u0000-\u0020\u007f]/.test(input.url) ||
      input.url.length > 8192 || destination.href.length > 8192
    ) {
      throw new AppError(400, 'INVALID_URL', 'url must be an HTTP(S) URL without credentials or unescaped whitespace');
    }
    if (input.customAlias !== undefined && !new RegExp(CODE_PATTERN).test(input.customAlias)) {
      throw new AppError(400, 'INVALID_ALIAS', 'customAlias must contain 3–64 letters, digits, underscores, or hyphens');
    }
    const expiresAt = input.expiresAt === undefined ? null : new Date(input.expiresAt);
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= this.clock())) {
      throw new AppError(400, 'INVALID_EXPIRATION', 'expiresAt must be a valid timestamp in the future');
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = input.customAlias ?? this.generateCode();
      const url = { code, url: destination.href, expiresAt };
      if (await this.repository.insert(url)) {
        return {
          ...url,
          expiresAt: expiresAt?.toISOString() ?? null,
          shortUrl: `${this.baseUrl}/${code}`,
        };
      }
      if (input.customAlias !== undefined) {
        throw new AppError(409, 'ALIAS_TAKEN', 'customAlias is already in use');
      }
    }
    throw new AppError(503, 'CODE_GENERATION_FAILED', 'Could not allocate a short code; please retry');
  }

  async resolve(code: string): Promise<string> {
    const url = await this.repository.findByCode(code);
    if (!url) throw new AppError(404, 'URL_NOT_FOUND', 'Short URL was not found');
    if (url.expiresAt && url.expiresAt <= this.clock()) {
      throw new AppError(410, 'URL_EXPIRED', 'Short URL has expired');
    }
    return url.url;
  }
}
