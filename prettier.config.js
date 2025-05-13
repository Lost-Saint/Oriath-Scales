/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	bracketSameLine: true,
	plugins: [
		'prettier-plugin-svelte',
		'prettier-plugin-organize-imports'
	],
	// This tells prettier to handle svelte files separately
	overrides: [
		{
			files: '*.svelte',
			options: { parser: 'svelte' }
		}
	]
};
export default config;

