<!-- SEO.svelte -->
<script>
	import { page } from '$app/state';

	export let title =
		'Tome of Trade - Path of Exile 2 Item Parser & Trade Search Tool';
	export let description =
		'Copy and paste Path of Exile 2 items to instantly search the official trade website. Parse item stats, mods, and requirements with one click. Fast PoE2 trade tool.';
	export let keywords =
		'path of exile 2, poe2, item parser, trade search, copy paste items, poe2 trade, item stats, mods, trading tool, pathofexile.com/trade, dawn of the hunt';
	export let image = 'static/favicon.png';
	export const league = '';
	export let canonicalUrl = '';

	// Structured data for better search results
	$: structuredData = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Tome of Trade',
		description: description,
		url: page.url.href,
		applicationCategory: 'GameApplication',
		operatingSystem: 'Web Browser',
		about: {
			'@type': 'VideoGame',
			name: 'Path of Exile 2',
			publisher: 'Grinding Gear Games'
		},
		featureList: [
			'Copy-paste item parsing',
			'Instant trade search',
			'Item stat analysis',
			'Direct pathofexile.com/trade integration',
			'One-click item lookup'
		]
	};
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{title}</title>
	<meta name="title" content={title} />
	<meta name="description" content={description} />
	<meta name="keywords" content={keywords} />
	<meta name="author" content="Tome of Trade" />
	<meta name="robots" content="index, follow" />
	<meta name="language" content="English" />
	<meta name="revisit-after" content="1 days" />

	<!-- Canonical URL -->
	<link rel="canonical" href={canonicalUrl || page.url.href} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content="Tome of Trade" />
	<meta property="og:locale" content="en_US" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={page.url.href} />
	<meta property="twitter:title" content={title} />
	<meta property="twitter:description" content={description} />
	<meta property="twitter:image" content={image} />
	<meta property="twitter:creator" content="@TomeOfTrade" />

	<!-- Additional Meta Tags for Gaming/Tools -->
	<meta name="application-name" content="Tome of Trade" />
	<meta name="msapplication-TileColor" content="#2b5797" />
	<meta name="theme-color" content="#1a202c" />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`}

	<!-- Preconnect to external domains -->
	<link rel="preconnect" href="https://www.pathofexile.com" />
	<link rel="preconnect" href="https://web.poecdn.com" />

	<!-- DNS Prefetch for faster loading -->
	<link rel="dns-prefetch" href="//fonts.googleapis.com" />
	<link rel="dns-prefetch" href="//cdnjs.cloudflare.com" />

	<!-- Favicon and App Icons -->
	<!-- <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="manifest" href="/site.webmanifest" /> -->

	<!-- Additional Gaming-Specific Meta Tags -->
	<meta name="game" content="Path of Exile" />
	<meta name="category" content="Gaming Tools" />
	<meta name="coverage" content="Worldwide" />
	<meta name="distribution" content="Global" />
	<meta name="rating" content="General" />

	<!-- Hreflang for international SEO (if you plan to support multiple languages) -->
	<link rel="alternate" hreflang="en" href={page.url.href} />

	<!-- Mobile Optimization -->
	<meta
		name="viewport"
		content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta
		name="apple-mobile-web-app-status-bar-style"
		content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content="Tome of Trade" />
</svelte:head>
