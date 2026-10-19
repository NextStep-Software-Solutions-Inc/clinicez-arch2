import type { Config } from 'drizzle-kit';

export default {
  dialect: 'sqlite',
  driver: 'expo',
  schema: './db/schema/index.ts',
  out: './drizzle',
} satisfies Config;
