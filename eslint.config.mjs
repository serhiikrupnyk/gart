import js from '@eslint/js';
import nextConfigs from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'];

/**
 * eslint-config-next is a flat-config array that assumes it owns the whole project.
 * Keep only the entries that carry rules — the rest just re-register the parser and
 * the @typescript-eslint plugin already provided workspace-wide below — and confine
 * them to apps/web so React and Next rules never reach the API or shared packages.
 */
const nextForWeb = nextConfigs
  .filter((config) => config.rules)
  .map((config) => ({ ...config, files: WEB_FILES }));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/.turbo/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  ...nextForWeb,
  {
    // The Next entries above install a Babel parser, which does not scope-track
    // TypeScript type syntax — `import type` would read as unused. Put the
    // typescript-eslint parser back for TypeScript sources.
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module' },
    },
  },
  prettier,
);
