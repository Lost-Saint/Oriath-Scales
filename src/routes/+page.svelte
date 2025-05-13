<script lang="ts">
	import ItemChecker from '$lib/components/ItemChecker.svelte';
	import LeagueSelector from '$lib/components/LeagueSelector.svelte';

	let selectedLeague = 'Dawn of the Hunt';

	function handleLeagueChange(event: CustomEvent<string>) {
		selectedLeague = event.detail;
	}
</script>

<LeagueSelector {selectedLeague} on:leagueChange={handleLeagueChange} />

<ItemChecker league={selectedLeague} />

<div class="backdrop-blur-sm bg-white/5 rounded-xl p-6 space-y-4">
	<div class="space-y-3">
		<h2 class="text-lg font-medium text-white/90 text-center">How to Use</h2>
		<ol class="text-white/70 space-y-2 list-decimal list-inside">
			<li class="flex items-center gap-2">
				<span class="text-cyan-400">1.</span>
				Copy an item from Path of Exile (Ctrl+C while hovering over an item)
			</li>
			<li class="flex items-center gap-2">
				<span class="text-cyan-400">2.</span>
				Paste it into the item checker textbox below
			</li>
			<li class="flex items-center gap-2">
				<span class="text-cyan-400">3.</span>
				Toggle whether you want to include item level in the search
			</li>
			<li class="flex items-center gap-2">
				<span class="text-cyan-400">4.</span>
				Click "Search on PoE Trade" to open the official trade site
			</li>
		</ol>
	</div>
</div>
