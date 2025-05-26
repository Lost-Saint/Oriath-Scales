<script lang="ts">
	import type { Snippet } from 'svelte';

	let { href, children }: { href: string; children?: Snippet } = $props();
</script>

<a {href}>
	{#if children}{@render children()}{:else}Skip to main content{/if}
</a>

<style>
	a {
		display: flex;
		align-items: center;
		background: var(--primary-bg);
		color: inherit;
		height: calc(3.75rem - 1.25rem);
		padding: 0 1rem;
		position: absolute;
		inset-block-start: 1rem;
		inset-inline-start: 1rem;
		transform: translateY(-999px);
		font: var(--fs-md);
		z-index: 1000; /* 1 more than the banner z-index */
	}

	a:focus {
		transform: translateY(0%);
	}
</style>
