import babelParser from '@babel/eslint-parser';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: {
            plugins: ['typescript'],
          },
        },
      },
    },
    // TypeScript verifica nomi e variabili inutilizzate con npm run typecheck.
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
]);
