<script lang="ts">
	import { Select } from 'melt/components';

	const options = [
		'Dawn of the Hunt',
		'HC Dawn of the Hunt',
		'Standard'
	] as const;
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
