const env = process.env;

function required(name: string, fallback?: string): string {
  const v = env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/karibu'),
  /** Public URL of the web app, used in sign-in links and share links. */
  webUrl: env.WEB_URL ?? 'http://localhost:3000',
  /** Allowed browser origins for CORS (comma-separated). The web app normally proxies /api, so CORS is rarely needed. */
  corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  cookieSecret: required('COOKIE_SECRET', 'dev-only-change-me-dev-only-change-me'),
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  /** Secure cookies need HTTPS. Defaults to on in production; set COOKIE_SECURE=false for plain-http local Docker. */
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
  /** In development, sign-in links and SMS codes are returned in the API response and logged. Never in production. */
  exposeDevSecrets: env.EXPOSE_DEV_SECRETS === 'true' || (env.NODE_ENV !== 'production' && env.EXPOSE_DEV_SECRETS !== 'false'),
  mail: { provider: env.MAIL_PROVIDER ?? 'console', from: env.MAIL_FROM ?? 'Karibu <hello@karibu.example>', apiKey: env.MAIL_API_KEY },
  sms: { provider: env.SMS_PROVIDER ?? 'console', apiKey: env.SMS_API_KEY, username: env.SMS_USERNAME },
  paystack: { secretKey: env.PAYSTACK_SECRET_KEY, planCodes: { pro: env.PAYSTACK_PLAN_PRO, featured: env.PAYSTACK_PLAN_FEATURED } },
  storage: { driver: env.STORAGE_DRIVER ?? 'local', localDir: env.STORAGE_LOCAL_DIR ?? './uploads' },
};

if (config.isProd && config.cookieSecret.startsWith('dev-only')) {
  throw new Error('COOKIE_SECRET must be set in production');
}
