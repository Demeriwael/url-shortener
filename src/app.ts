import Fastify from 'fastify';
import { registerUrlRoutes } from './modules/urls/index.js';
import type { UrlService } from './modules/urls/index.js';
import { AppError } from './shared/app-error.js';

interface AppDependencies {
  urls: UrlService;
  checkReadiness: () => Promise<void>;
  logger?: boolean;
}

export function buildApp(dependencies: AppDependencies) {
  const app = Fastify({
    logger: dependencies.logger ?? false,
    bodyLimit: 16_384,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    const failure = error as { statusCode?: number; validation?: unknown; message?: string };
    if (failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500) {
      return reply.code(failure.statusCode).send({
        error: {
          code: failure.validation ? 'VALIDATION_ERROR' : 'BAD_REQUEST',
          message: failure.message ?? 'Invalid request',
        },
      });
    }
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route was not found' },
  }));

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (request, reply) => {
    try {
      await dependencies.checkReadiness();
      return { status: 'ok' };
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.code(503).send({ error: { code: 'NOT_READY', message: 'Database is unavailable or migrations are missing' } });
    }
  });
  registerUrlRoutes(app, dependencies.urls);
  return app;
}
