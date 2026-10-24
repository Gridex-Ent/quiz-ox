import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'DOCS/**', 'data/**'] },
  js.configs.recommended,
  {
    files: ['web/src/quiz/*.js', 'web/src/cloud/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['tools/*.mjs', 'cloud/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
