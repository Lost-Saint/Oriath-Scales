<script lang="ts">
	import { Select } from 'melt/components';

	export let selectedLeague: string;
	export let onLeagueChange: (league: string) => void;

	const leagues = [
		'Dawn of the Hunt',
		'HC Dawn of the Hunt',
		'Standard',
		'Hardcore'
	] as const;
	let internalLeague = selectedLeague;

	// Reactively watch for value changes and call the parent callback
	$: if (internalLeague !== selectedLeague) {
		onLeagueChange(internalLeague);
	}
</script>

<div class="select-wrap">
	<Select bind:value={internalLeague}>
		{#snippet children(select)}
			<label for={select.ids.trigger} class="select-label">League</label>
			<button {...select.trigger} class="select-button">
				{select.value ?? 'Select a league'}
			</button>
			<div {...select.content} class="select-content">
				{#each leagues as league (league)}
					<div {...select.getOption(league)} class="select-option">
						<span>{league}</span>
					</div>
				{/each}
			</div>
		{/snippet}
	</Select>
</div>

<style>
	div.select-wrap {
		gap: 0.25rem;
		width: 300px;
		display: flex;
		flex-direction: column;
		margin: 0 auto;
	}
	.select-content {
		display: flex;
		padding: 0.5rem;
		flex-direction: column;
		border-radius: 0.75rem;
		border-width: 1px;
		border-color: #6b7280;
		background-color: gray;
		box-shadow:
			0 1px 3px 0 rgba(0, 0, 0, 0.1),
			0 1px 2px 0 rgba(0, 0, 0, 0.06);
	}
	.select-option {
		display: flex;
		position: relative;
		padding-top: 0.5rem;
		padding-bottom: 0.5rem;
		padding-right: 0.5rem;
		padding-left: 2rem;
		justify-content: space-between;
		align-items: center;
		border-radius: 0.75rem;
	}
	[data-melt-select-content] {
		position: absolute;
		pointer-events: none;
		opacity: 0;
		margin: 0;

		transform: scale(0.975);

		transition: 0.2s;
		transition-property: opacity, transform;
		transform-origin: var(--melt-popover-content-transform-origin, center);
	}

	[data-melt-select-content][data-open] {
		pointer-events: auto;
		opacity: 1;
		margin: 0;

		transform: scale(1);
	}
</style>
