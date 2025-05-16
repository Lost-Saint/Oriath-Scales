<script lang="ts">
	import ItemChecker from '$lib/components/ItemChecker.svelte';
	import LeagueSelector from '$lib/components/LeagueSelector.svelte';

	let selectedLeague = 'Dawn of the Hunt';

	function handleLeagueChange(league: string) {
		selectedLeague = league;
	}
</script>

<LeagueSelector {selectedLeague} onLeagueChange={handleLeagueChange} />

<ItemChecker league={selectedLeague} />
