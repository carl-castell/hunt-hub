// ESLint for the backend and the web app (run from the repo root: `npm run lint`).
// The iPhone app (mobile/) is not linted here; Expo projects bring their own setup.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'mobile/**',
      'backend/drizzle/**',
      'backend/public/**', // plain browser scripts of the server-rendered pages
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['backend/**/*.ts', 'scripts/**/*.mjs', '*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      // `declare global { namespace Express { … } }` is how Express's types are extended.
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    },
  },

  {
    // Tests build loosely typed mocks (req, res, db chains) on purpose.
    files: ['**/tests/**/*.ts', '**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
