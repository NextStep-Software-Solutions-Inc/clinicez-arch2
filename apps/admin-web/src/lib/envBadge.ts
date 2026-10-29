export type EnvironmentBadge = 'LOCAL' | 'DEV' | 'PROD';

export interface EnvironmentSignals {
  appEnv?: string;
  vercelEnv?: string;
  mode?: string;
  isDevBuild?: boolean;
  baseDomain?: string;
  portalApiUrl?: string;
  portalWebUrl?: string;
  clerkPublishableKey?: string;
}

const NON_PROD_TOKEN_REGEX =
  /(^|[./:-])(dev|development|staging|stage|preview|qa|uat|sandbox|test)([./:-]|$)/i;
const PRIVATE_IPV4_REGEX =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

function isLoopbackOrLocalHost(h: string): boolean {
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '127.0.0.1' ||
    h.startsWith('127.') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h === 'lvh.me' ||
    h.endsWith('.lvh.me') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

function isNonProdHost(h: string): boolean {
  return (
    h.endsWith('.vercel.app') ||
    h.endsWith('.ngrok-free.app') ||
    h.endsWith('.ngrok.io') ||
    h.endsWith('.trycloudflare.com') ||
    NON_PROD_TOKEN_REGEX.test(h)
  );
}

export function getEnvironmentBadge(
  hostname: string,
  env: EnvironmentSignals = {}
): EnvironmentBadge {
  const h = (hostname || '').trim().toLowerCase();

  // 1. Explicit VITE_APP_ENV override when configured
  const explicit = (env.appEnv || '').trim().toLowerCase();
  if (explicit === 'local') return 'LOCAL';
  if (
    explicit === 'dev' ||
    explicit === 'development' ||
    explicit === 'staging' ||
    explicit === 'preview'
  ) {
    return isLoopbackOrLocalHost(h) ? 'LOCAL' : 'DEV';
  }
  if (explicit === 'prod' || explicit === 'production') return 'PROD';

  // 2. Loopback / local hostnames (plus private LAN IPv4 under Vite dev server)
  if (isLoopbackOrLocalHost(h)) {
    return 'LOCAL';
  }
  if (env.isDevBuild && PRIVATE_IPV4_REGEX.test(h)) {
    return 'LOCAL';
  }

  // 3. Vercel system environment signal (preview / development)
  const vercelEnv = (env.vercelEnv || '').trim().toLowerCase();
  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return 'DEV';
  }

  // 4. Vite dev server (`vite` / `mode === 'development'`) is never PROD
  if (env.isDevBuild || (env.mode || '').trim().toLowerCase() === 'development') {
    return 'DEV';
  }

  // 5. Non-production browser hostnames (*.vercel.app, dev.*, *-dev.*, *.dev, staging.*, etc.)
  if (isNonProdHost(h)) {
    return 'DEV';
  }

  // 6. Configured upstream URL / domain / Clerk publishable key signals
  const upstreamTargets = [env.baseDomain, env.portalApiUrl, env.portalWebUrl]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim().toLowerCase());

  for (const target of upstreamTargets) {
    if (
      target.includes('localhost') ||
      target.includes('127.0.0.1') ||
      target.includes('lvh.me') ||
      NON_PROD_TOKEN_REGEX.test(target)
    ) {
      return 'DEV';
    }
  }

  const clerkKey = (env.clerkPublishableKey || '').trim();
  if (clerkKey.startsWith('pk_test_')) {
    return 'DEV';
  }

  return 'PROD';
}

export function readRuntimeEnvironmentSignals(): EnvironmentSignals {
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    return {};
  }
  const metaEnv = import.meta.env as Record<string, unknown>;
  return {
    appEnv: typeof metaEnv.VITE_APP_ENV === 'string' ? metaEnv.VITE_APP_ENV : undefined,
    vercelEnv: typeof metaEnv.VITE_VERCEL_ENV === 'string' ? metaEnv.VITE_VERCEL_ENV : undefined,
    mode: typeof metaEnv.MODE === 'string' ? metaEnv.MODE : undefined,
    isDevBuild: metaEnv.DEV === true,
    baseDomain: typeof metaEnv.VITE_BASE_DOMAIN === 'string' ? metaEnv.VITE_BASE_DOMAIN : undefined,
    portalApiUrl:
      typeof metaEnv.VITE_PORTAL_API_URL === 'string' ? metaEnv.VITE_PORTAL_API_URL : undefined,
    portalWebUrl:
      typeof metaEnv.VITE_PORTAL_WEB_URL === 'string' ? metaEnv.VITE_PORTAL_WEB_URL : undefined,
    clerkPublishableKey:
      typeof metaEnv.VITE_CLERK_PUBLISHABLE_KEY === 'string'
        ? metaEnv.VITE_CLERK_PUBLISHABLE_KEY
        : undefined,
  };
}
