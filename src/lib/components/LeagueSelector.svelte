<script lang="ts">
	import { Select } from 'melt/components';
	import { createEventDispatcher } from 'svelte';

	// Props
	export let selectedLeague = 'Dawn of the Hunt';

	// Event dispatcher for communicating with parent components
	const dispatch = createEventDispatcher<{
		leagueChange: string;
	}>();

	const options = [
		'Dawn of the Hunt',
		'HC Dawn of the Hunt',
		'Standard'
	] as const;

	function handleLeagueChange(league: string) {
		selectedLeague = league;
		dispatch('leagueChange', league);
	}
</script>

<Select>
	{#snippet children(select)}
		<label for={select.ids.trigger}>League</label>
		<button {...select.trigger}>
			{select.value ?? 'Select an league'}
		</button>

		<div {...select.content}>
			{#each options as option}
				<div {...select.getOption(option)}>
					{option}
				</div>
			{/each}
		</div>
	{/snippet}
</Select>
