import js from '@eslint/js';
import tsESLint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tsESLint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsESLint.parser
    },
    plugins: {
      react
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...tsESLint.configs.recommendedRules,
      ...react.configs.recommended.rules,
      ...prettier.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off'
    }
  }
];
