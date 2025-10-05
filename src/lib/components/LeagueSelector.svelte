<script lang="ts">
	import { Select } from 'melt/components';

	export let selectedLeague: string;
	export let onLeagueChange: (league: string) => void;

	const leagues = [
		'Rise of the Abyssal',
		'HC Rise of the Abyssal',
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
		gap: 0.5rem;
		width: 300px;
		display: flex;
		align-items: center;
		margin: 0 auto;
		font-family: var(--font-secondary);
	}

	.select-label {
		color: var(--text-accent);
		font-family: var(--font-primary);
		font-size: var(--font-size-sm);
		font-weight: 500;
		margin-bottom: 0.25rem;
		letter-spacing: 0.02em;
	}

	.select-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid var(--ui-border);
		border-radius: 0.75rem;
		background-color: var(--ui-element-bg);
		color: var(--text-primary);
		font-family: var(--font-secondary);
		font-size: var(--font-size-base);
		text-align: left;
		cursor: pointer;
		transition: all var(--transition-standard);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.select-button::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--primary-gradient);
		opacity: 0;
		transition: opacity var(--transition-standard);
		z-index: -1;
	}

	.select-button:hover {
		border-color: var(--primary-accent);
	}

	.select-button:hover::before {
		opacity: 0.1;
	}

	.select-button:focus {
		outline: none;
		border-color: var(--primary-accent);
		box-shadow: 0 0 0 2px rgba(209, 123, 70, 0.25);
	}

	.select-button[data-expanded='true'] {
		border-color: var(--primary-accent);
		background-color: var(--ui-active-bg);
	}

	.select-arrow {
		transition: transform var(--transition-standard);
	}

	.select-button[data-expanded='true'] .select-arrow {
		transform: rotate(180deg);
	}

	.select-content {
		display: flex;
		padding: 0.5rem;
		flex-direction: column;
		border-radius: 0.75rem;
		border: 1px solid var(--ui-border);
		background-color: var(--primary-bg);
		color: var(--text-primary);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		z-index: 50;
		max-height: 16rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.15) rgba(255, 255, 255, 0.05);
	}

	.select-content::-webkit-scrollbar {
		width: 6px;
	}

	.select-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 9999px;
	}

	.select-content::-webkit-scrollbar-thumb {
		background-color: rgba(255, 255, 255, 0.15);
		border-radius: 9999px;
	}

	.select-content::-webkit-scrollbar-thumb:hover {
		background-color: rgba(255, 255, 255, 0.25);
	}

	.select-option {
		display: flex;
		position: relative;
		padding: 0.65rem 1rem;
		justify-content: space-between;
		align-items: center;
		border-radius: 0.5rem;
		cursor: pointer;
		transition:
			background-color var(--transition-standard),
			color var(--transition-standard);
		font-size: var(--font-size-base);
	}

	.select-option:hover {
		background-color: var(--ui-hover-bg);
	}

	.select-option[data-highlighted='true'] {
		background-color: var(--ui-active-bg);
	}

	.select-option[data-selected='true'] {
		color: var(--primary-accent);
		font-weight: 500;
	}

	.select-option[data-selected='true']::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		transform: translateY(-50%);
		width: 3px;
		height: 60%;
		background: var(--primary-gradient);
		border-radius: 0 2px 2px 0;
	}

	/* Melt UI specific styles */
	[data-melt-select-content] {
		position: absolute;
		pointer-events: none;
		opacity: 0;
		margin: 0;
		transform: translateY(-8px);
		transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		transition-property: opacity, transform;
		transform-origin: var(--melt-popover-content-transform-origin, top);
		width: var(--melt-select-content-width);
	}

	[data-melt-select-content][data-open] {
		pointer-events: auto;
		opacity: 1;
		margin-top: 0.5rem;
		transform: translateY(0);
	}
</style>
