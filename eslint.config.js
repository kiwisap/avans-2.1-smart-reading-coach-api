import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores(['dist', 'node_modules', 'drizzle', '_to_delete']),

    {
        files: ['**/*.ts'],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            globals: globals.node,
            parserOptions: {
                // Type aware rules use the project's tsconfig.json.
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'prefer-const': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // Unhandled promises hide errors, especially in async route handlers.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        },
    },

    {
        // Command line scripts are allowed to print to the console.
        files: ['src/scripts/**', 'src/db/migrate.ts', 'src/db/seed.ts'],
        rules: { 'no-console': 'off' },
    },

    {
        // node:test's describe() and it() return promises that the runner tracks itself.
        files: ['tests/**'],
        rules: { '@typescript-eslint/no-floating-promises': 'off' },
    },

    // Must be last: turns off rules that conflict with Prettier.
    prettier,
]);
