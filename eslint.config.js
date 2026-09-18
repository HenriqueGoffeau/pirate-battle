import js from '@eslint/js'
import globals from 'globals'
import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const layers = {
  app: ['ui', 'session', 'sim', 'render', 'input', 'assets', 'data', 'mocks', 'testing', 'config', 'shared'],
  ui: ['session', 'data', 'config', 'shared'],
  session: ['sim', 'render', 'input', 'assets', 'config', 'shared'],
  sim: ['config', 'shared'],
  render: ['sim', 'assets', 'shared'],
  input: ['shared'],
  assets: ['shared'],
  data: ['config', 'shared'],
  mocks: ['data', 'config', 'shared'],
  testing: ['session', 'data', 'mocks', 'shared'],
  config: ['shared'],
  shared: [],
}

export default defineConfig([
  globalIgnores(['dist', 'public', 'assets', 'sessions', 'docs', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': Object.keys(layers).map((type) => ({ type, pattern: `src/${type}` })),
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: Object.entries(layers).map(([from, to]) => ({
            from: { element: { type: from } },
            allow: { to: { element: { types: { anyOf: [from, ...to] } } } },
          })),
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.tsx'],
    extends: [reactRefresh.configs.vite],
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'pixi.js/*', 'react', 'react/*', 'react-dom', 'react-dom/*', 'react-router', 'axios', 'msw', 'msw/*', '@tanstack/*'],
              message: 'src/sim is pure TypeScript and may import only config and shared.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'setTimeout',
        'setInterval',
        'fetch',
      ],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded world.rng.' }],
    },
  },
  {
    files: ['*.config.ts', 'scripts/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
])
