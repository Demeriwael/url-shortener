import type { FastifyInstance } from 'fastify';
import type { UrlService } from '../application/url-service.js';
import { CODE_PATTERN } from '../domain/short-url.js';
import type { CreateUrlInput } from '../domain/short-url.js';

export function registerUrlRoutes(app: FastifyInstance, service: UrlService): void {
  app.post<{ Body: CreateUrlInput }>('/api/urls', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        additionalProperties: false,
        properties: {
          url: { type: 'string', minLength: 1, maxLength: 8192 },
          customAlias: { type: 'string', pattern: CODE_PATTERN },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request, reply) => {
    const created = await service.create(request.body);
    return reply.code(201).header('location', created.shortUrl).send(created);
  });

  for (const path of ['/api/urls/:code', '/:code']) {
    app.get<{ Params: { code: string } }>(path, {
      schema: {
        params: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', pattern: CODE_PATTERN } },
        },
      },
    }, async (request, reply) => {
      // Do not let browsers cache redirects past the link's expiration.
      reply.header('cache-control', 'no-store');
      const destination = await service.resolve(request.params.code);
      return reply.code(302).header('location', destination).send();
    });
  }
}
