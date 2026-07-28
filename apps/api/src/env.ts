/**
 * Reads a required environment variable, failing loudly if it is missing.
 *
 * Without this, an absent DATABASE_URL silently falls through to node-postgres'
 * PG* defaults and the app connects somewhere unintended.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable ${name}. See apps/api/.env.example.`);
  }

  return value;
}
