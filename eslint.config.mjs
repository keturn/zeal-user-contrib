// eslint.config.js
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tselint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig(
  js.configs.recommended,
  tselint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['lib/*'],
  },
  {
    files: ['./src/**/*.mts', './src/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
        },
        {
          selector: ['typeLike', 'enumMember'],
          format: ['PascalCase'],
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
        },
      ],
      // eslint-plugin-import not yet compatible with eslint v10, see https://github.com/import-js/eslint-plugin-import/issues/3227
      //   'import/order': [
      //     'error',
      //     {
      //       alphabetize: {
      //         order: 'asc',
      //         caseInsensitive: true,
      //       },
      //     },
      //   ],
      '@typescript-eslint/explicit-module-boundary-types': [
        'error',
        {
          allowArgumentsExplicitlyTypedAsAny: true,
        },
      ],
    },
  },
  {
    files: ['./*.mjs'],
    extends: [tselint.configs.disableTypeChecked]
  }
);
