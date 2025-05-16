<script lang="ts">
	import '../styles/index.css';

	let { children } = $props();
</script>

<main>
	{@render children()}
</main>

<style>
	main {
		position: relative;
	}
</style>
