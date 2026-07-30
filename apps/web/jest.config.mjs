import nextJest from 'next/jest.js';

// next/jest wires up the SWC transform, CSS stubbing and path aliases so the
// tests compile exactly as the app does.
const createConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*.spec.tsx', '<rootDir>/test/**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Declared explicitly rather than left to inference: `jest.mock('@/…')` needs
  // the alias resolvable at mock-registration time, not only at import time.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createConfig(config);
