/**
 * Plain ESM rather than TypeScript: a .ts config would pull in ts-node purely so
 * Jest can read this file.
 *
 * @type {import('jest').Config}
 */
export default {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Prisma 7 generates imports with `.js` specifiers pointing at `.ts` sources.
  // Jest resolves from disk, so the extension has to be stripped.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
  // argon2 at these parameters is deliberately slow, and each spec boots a Nest
  // application against a real database.
  testTimeout: 30_000,
  // The suites share one test database, so they must not run concurrently.
  maxWorkers: 1,
};
