<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	const online = browser ? navigator.onLine : true;
</script>

<svelte:head>
	<title>{page.status}</title>
</svelte:head>

<div class="container">
	{#if online}
		{#if page.status === 404}
			<h1>Not found!</h1>
			<p>Blame the squirels!</p>
			<p>
				If you were expecting to find something here, please drop by the Discord chatroom and let us
				know, or raise an issue on
				<a href="https://github.com/Lost-Saint/Oriath-Scales">GitHub</a>. Thanks!
			</p>
			<a href="/">Return home </a>
		{:else}
			<h1>Yikes!</h1>
			<p>Something went wrong when we tried to render this page.</p>
			{#if page.error?.message}
				<p class="error">{page.status}: {page.error.message}</p>
			{:else}
				<p class="error">Encountered a {page.status} error.</p>
			{/if}
			<p>Please try reloading the page.</p>
			<p>
				If the error persists, please drop by the Discord chatroom and let us know, or raise an
				issue on
				<a href="https://github.com/Lost-Saint/Oriath-Scales">GitHub</a>. Thanks!
			</p>
		{/if}
	{:else}
		<h1>It looks like you're offline</h1>
		<p>Reload the page once you've found the internet.</p>
	{/if}
</div>

<style>
	.container {
		padding: 60px 32px 60px 32px;
		height: 100%;
	}
	h1,
	p {
		margin: 0 auto;
	}
	h1 {
		font-size: 2.8em;
		font-weight: 300;
		margin: 0 0 0.5em 0;
	}
	p {
		margin: 1em auto;
	}
	.error {
		background-color: var(--primary-bg);
		color: white;
		padding: 12px 16px;
		font: 600 16px/1.7 var(--font-mono);
		border-radius: 2px;
	}
</style>
