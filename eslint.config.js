import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginSvelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tsEslint from 'typescript-eslint';

export default tsEslint.config(
	js.configs.recommended,
	...tsEslint.configs.recommendedTypeChecked,
	{
		// configure the ts parser for ts files
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsEslint.parser,
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname
			}
		}
	},
	{
		files: ['*.js', '*.config.ts'],
		...tsEslint.configs.disableTypeChecked
	},
	...eslintPluginSvelte.configs['flat/recommended'],
	...eslintPluginSvelte.configs['flat/prettier'],
	{
		// dev tools and server logic run in node environments
		files: ['**/*.server.ts', '*.config.ts', '*.config.js'],
		languageOptions: {
			globals: {
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			// mounted svelte components run in the browser
			globals: {
				...globals.browser
			},
			ecmaVersion: 2022,
			sourceType: 'module',
			// setup the svelte parser and give it the ts parser config
			parser: svelteParser,
			parserOptions: {
				parser: tsEslint.parser,
				// needed so ts parser won't skip svelte files
				extraFileExtensions: ['.svelte'],
				// svelte files need both `tsconfig`s
				project: ['tsconfig.json', '.svelte-kit/tsconfig.json'],
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// ignore the $$Props types in shadcn-svelte
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^\$\$(Props|Events|Slots|Generic)'
				}
			]
		}
	},
	{
		files: ['tests/**/*.ts'],
		rules: {
			'no-empty-pattern': [
				'error',
				{
					// I use `{}` when defining vitest fixtures
					allowObjectPatternsAsParameters: true
				}
			]
		}
	},
	{
		ignores: [
			'.svelte-kit',
			'.vercel',
			'.github',
			'.storybook',
			'.vscode',
			'build',
			'static',
			'package',
			'coverage',
			'node_modules'
		]
	},
	// this only disables rules; it goes last to win the cascade
	eslintConfigPrettier
);

