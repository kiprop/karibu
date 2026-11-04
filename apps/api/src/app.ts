import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authPlugin } from './auth.js';
import { HttpError } from './lib/util.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { travellerRoutes } from './routes/traveller.js';
import { vendorRoutes } from './routes/vendor.js';
import { adminRoutes } from './routes/admin.js';
import { priceRoutes } from './routes/prices.js';
import { staffRoutes } from './routes/staff.js';
import { insightRoutes } from './routes/insights.js';
import { staffPlugin } from './lib/staff.js';

export async function buildApp(opts: { logger?: boolean; rateLimit?: boolean } = {}) {
  const app = Fastify({
    logger: opts.logger ?? (config.env !== 'test' ? { level: config.isProd ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body.password', 'req.body.current'] } : false),
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  // Keep the raw JSON body (needed to verify payment webhook signatures).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    if (body === '' || body === undefined) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new HttpError(400, 'Request body is not valid JSON', 'bad_json'), undefined);
    }
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    enableDraftSpec: true,
    skipOnError: true,
    allowList: () => opts.rateLimit === false,
  });
  await app.register(authPlugin);
  await app.register(staffPlugin);

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
      return reply.code(400).send({ error: msg, code: 'validation' });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message, code: err.code });
    if (err.statusCode === 429) return reply.code(429).send({ error: 'Too many requests. Wait a few minutes and try again.', code: 'rate_limited' });
    if (err.code === '23514' || err.code === '23P01') return reply.code(400).send({ error: 'That change is not allowed', code: 'constraint' });
    if (err.code === '22P02') return reply.code(400).send({ error: 'A value has the wrong format', code: 'format' });
    if (err.validation) return reply.code(400).send({ error: err.message, code: 'validation' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message, code: 'error' });
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our side. Please try again.', code: 'server_error' });
  });

  await app.register(
    async (v1) => {
      await v1.register(publicRoutes);
      await v1.register(authRoutes);
      await v1.register(travellerRoutes);
      await v1.register(vendorRoutes);
      await v1.register(adminRoutes);
      await v1.register(priceRoutes);
      await v1.register(staffRoutes);
      await v1.register(insightRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}
