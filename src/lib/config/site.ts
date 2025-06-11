import { defineSiteConfig } from '$lib/utils/use-site-config.svelte';

export const siteConfig = defineSiteConfig({
	name: 'Oriath Scales',
	url: 'https://oriathscales.com',
	description:
		'Copy and paste Path of Exile 2 items to instantly search the official trade website. Parse item stats, mods, and requirements with one click. Fast PoE2 trade tool.',
	ogImage: {
		url: 'https://oriathscales.com/og.png',
		height: '630',
		width: '1200'
	},
	author: 'lost-saint',
	license: {
		name: 'GLWTS',
		url: 'https://github.com/Lost-Saint/Oriath-Scales/blob/main/LICENSE.md'
	},
	links: {
		x: 'https://x.com/TomeOfTrade',
		github: 'https://github.com/Lost-Saint/Oriath-Scales'
	},
	keywords: [
		'Path of Exile 2',
		'PoE2',
		'Item Parser',
		'Trade Tool',
		'Copy Paste PoE Items',
		'PoE2 Trade',
		'Path of Exile Tools'
	]
});

export type SiteConfig = typeof siteConfig;
