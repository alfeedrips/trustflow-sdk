import eslint from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Required by type-aware rules (e.g. no-duplicate-type-constituents);
        // only this config's `src/**/*.ts` files are linted, and they are all
        // part of tsconfig.json's program.
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      // The SDK supports both browser wallet integrations and Node consumers.
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Ported rules from legacy .eslintrc.json configuration mapping
      'no-throw-literal': 'error',
      'no-param-reassign': 'warn',
      // These type-focused checks remain available in `npm run lint:strict`.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // A type declaration must never list the same member twice (#432): a
      // duplicated union constituent silently narrows nothing and hides copy-
      // paste drift (the codebase shipped a duplicate 'INVALID_CONTRACT_CALL').
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      // Per typescript-eslint guidance, the core JS rules below are disabled
      // for TypeScript files: `tsc` performs the same checks natively, and
      // core no-undef/no-redeclare false-positive on TS constructs (DOM lib
      // types such as PublicKeyCredentialCreationOptions, function
      // overloads, declaration merging).
      'no-undef': 'off',
      'no-redeclare': 'off',
      // TypeScript-aware redeclare: flags genuine redeclarations while
      // allowing interface/function merging and overload signatures.
      '@typescript-eslint/no-redeclare': 'error',
    }
  }
];
