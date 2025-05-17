<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchStats, findStatId, extractValue } from '../utils/stats';
	import { ITEM_CLASS_MAP } from '../constants/itemTypes';
	import type { ParsedItem } from '../types/item';

	export let league: string;

	const RATE_LIMIT_DELAY = 1000;

	let itemText = '';
	let error: string | null = null;
	let loading = false;
	let includeItemLevel = false;
	let isStatsLoaded = false;
	let itemDisplayHtml = '';

	onMount(async () => {
		try {
			await fetchStats();
			isStatsLoaded = true;
		} catch (err) {
			error = 'Failed to load item stats database';
			console.error('Failed to load stats:', err);
		}
	});

	function parseItemText(text: string): ParsedItem {
		const lines = text
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		let itemClass: string | undefined;
		let itemLevel: number | undefined;
		const stats: string[] = [];
		let rarity: string | undefined;
		let name: string | undefined;
		let baseType: string | undefined;
		let foundItemLevel = false;
		let foundStats = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (!line) continue;

			if (line.startsWith('Item Class:')) {
				itemClass = line.replace('Item Class:', '').trim();
			} else if (line.startsWith('Item Level:')) {
				const match = line.match(/Item Level: (\d+)/);
				if (match && match[1]) {
					itemLevel = parseInt(match[1], 10); // Added radix parameter
					foundItemLevel = true;
				}
			} else if (line.startsWith('Rarity:')) {
				rarity = line.replace('Rarity:', '').trim();
				// Check for Unique item name and base type in the next lines
				if (rarity === 'Unique' && i + 2 < lines.length) {
					const nextLine = lines[i + 1];
					const nextNextLine = lines[i + 2];
					if (nextLine) name = nextLine.trim();
					if (nextNextLine) baseType = nextNextLine.trim();
				}
			} else if (foundItemLevel && !foundStats) {
				if (line.includes('--------')) {
					foundStats = true;
				}
			} else if (foundStats && line && !line.includes('--------')) {
				// Add line to stats if it contains numbers, modifiers, or other relevant patterns
				if (
					line.match(/[0-9]+/) ||
					line.includes('to ') ||
					line.includes('increased ') ||
					line.includes('reduced ') ||
					line.includes('Recover')
				) {
					stats.push(line);
				}
			}
		}

		return { itemClass, itemLevel, stats, rarity, name, baseType };
	}

	async function handleSearch() {
		if (!itemText.trim()) {
			error = 'Please paste an item first';
			return;
		}

		if (!isStatsLoaded) {
			error =
				'Item stats database is not ready yet. Please try again in a moment.';
			return;
		}

		loading = true;
		error = null;

		try {
			const parsedItem = parseItemText(itemText);

			if (parsedItem.itemClass && !ITEM_CLASS_MAP[parsedItem.itemClass]) {
				error = `Item type "${parsedItem.itemClass}" is not supported yet`;
				loading = false;
				return;
			}

			// Create base query structure
			const baseQuery = {
				query: {
					status: { option: 'online' },
					stats: [{ type: 'and', filters: [], disabled: false }]
				},
				sort: { price: 'asc' }
			};

			// Build the query based on item type
			let query;
			if (
				parsedItem.rarity === 'Unique' &&
				parsedItem.name &&
				parsedItem.baseType
			) {
				query = {
					...baseQuery,
					query: {
						...baseQuery.query,
						name: parsedItem.name,
						type: parsedItem.baseType,
						filters: {
							type_filters: {
								filters: {
									category: parsedItem.itemClass
										? {
												option: ITEM_CLASS_MAP[parsedItem.itemClass]
											}
										: undefined,
									ilvl:
										parsedItem.itemLevel && includeItemLevel
											? {
													min: parsedItem.itemLevel
												}
											: undefined
								},
								disabled: false
							}
						}
					}
				};
			} else {
				const statFilters = parsedItem.stats
					.map((stat) => {
						const statId = findStatId(stat);
						if (!statId) {
							console.log('No stat ID found for:', stat);
							return null;
						}

						const value = extractValue(stat);
						console.log('Found stat:', {
							id: statId,
							value,
							originalStat: stat
						});

						return {
							id: statId,
							value: { min: value },
							disabled: false
						};
					})
					.filter(
						(filter): filter is NonNullable<typeof filter> => filter !== null
					);

				if (statFilters.length === 0) {
					error = 'No valid stats found to search for';
					loading = false;
					return;
				}

				query = {
					...baseQuery,
					query: {
						...baseQuery.query,
						stats: [
							{
								type: 'and',
								filters: statFilters,
								disabled: false
							}
						],
						filters: {
							type_filters: {
								filters: {
									category: parsedItem.itemClass
										? {
												option: ITEM_CLASS_MAP[parsedItem.itemClass]
											}
										: undefined,
									ilvl:
										parsedItem.itemLevel && includeItemLevel
											? {
													min: parsedItem.itemLevel
												}
											: undefined
								},
								disabled: false
							}
						}
					}
				};
			}

			// Clean up undefined values
			if (!parsedItem.itemClass) {
				delete query.query.filters?.type_filters.filters.category;
			}
			if (!parsedItem.itemLevel || !includeItemLevel) {
				delete query.query.filters?.type_filters.filters.ilvl;
			}

			await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));

			const response = await fetch('/api/poe/search', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ query, league })
			});

			if (!response.ok) {
				const errorData: { error?: string } = await response.json();
				if (response.status === 429) {
					throw new Error(
						'Too many requests. Please wait a moment and try again.'
					);
				}
				throw new Error(errorData.error || 'Search failed');
			}

			type SearchResponse = { id: string };
			const data: SearchResponse = await response.json();

			if (data.id) {
				const tradeUrl = `https://www.pathofexile.com/trade2/search/${league}/${data.id}`;
				const newWindow = window.open(tradeUrl, '_blank');
				if (
					!newWindow ||
					newWindow.closed ||
					typeof newWindow.closed === 'undefined'
				) {
					error =
						'Popup was blocked. Please allow popups for this site and try again.';
					console.log('Trade URL:', tradeUrl);
				}
			} else {
				throw new Error('No search ID returned');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
			console.error('Search error:', err);
		} finally {
			loading = false;
		}
	}

	function formatItemText(text: string): string {
		if (!text) return '';

		return text
			.split('\n')
			.map((line, i) => {
				if (line.includes('--------')) {
					return `<div class="separator">--------</div>`;
				}
				if (line.startsWith('Item Class:')) {
					return `<div class="item-class">${line}</div>`;
				}
				if (line.startsWith('Item Level:')) {
					return `<div class="item-level">${line}</div>`;
				}
				if (line.startsWith('Rarity:')) {
					return `<div class="rarity">${line}</div>`;
				}
				if (line.match(/[0-9]+/)) {
					return `<div class="stat">${line}</div>`;
				}
				if (line.includes('Requires')) {
					return `<div class="requirement">${line}</div>`;
				}
				if (i <= 2 && line.trim() && !line.includes(':')) {
					return `<div class="item-name">${line}</div>`;
				}
				return `<div class="regular-text">${line}</div>`;
			})
			.join('');
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text') || '';
		itemText = text;
		itemDisplayHtml = formatItemText(text);
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLDivElement;
		itemText = target.innerText;
		itemDisplayHtml = formatItemText(itemText);
	}

	$: if (itemText) {
		itemDisplayHtml = formatItemText(itemText);
	}
</script>

<div class="item-checker">
	<div class="item-input-container">
		<div
			class="item-input"
			contenteditable
			bind:innerHTML={itemDisplayHtml}
			on:paste={handlePaste}
			on:input={handleInput}
			spellcheck="false">
		</div>
	</div>

	{#if error}
		<div class="error-message">
			{error}
		</div>
	{/if}

	<div class="option-container">
		<label for="includeItemLevel" class="option-label">
			Include item level in search
		</label>
		<button
			role="switch"
			id="includeItemLevel"
			aria-checked={includeItemLevel}
			aria-labelledby="includeItemLevel-label"
			on:click={() => (includeItemLevel = !includeItemLevel)}
			class="toggle-switch"
			class:active={includeItemLevel}>
			<span class="toggle-knob"></span>
		</button>
	</div>

	<button class="search-button" on:click={handleSearch} disabled={loading}>
		{#if loading}
			<div class="loading-indicator">
				<svg class="spinner" viewBox="0 0 24 24">
					<circle
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
						fill="none" />
					<path
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
				</svg>
				Searching...
			</div>
		{:else}
			Search on PoE Trade
		{/if}
	</button>
</div>

<style>
	/* Modern CSS with variables and useful features */
	:root {
		--color-bg: rgb(15 23 42 / 0.9);
		--color-border: rgb(255 255 255 / 0.1);
		--color-text: rgb(255 255 255 / 0.9);
		--color-blue-500: #3b82f6;
		--color-blue-600: #2563eb;
		--color-cyan-500: #06b6d4;
		--color-cyan-600: #0891b2;
		--color-red-400: #f87171;
		--color-red-500: #ef4444;
		--color-red-900: #7f1d1d;
		--transition-standard: 200ms ease;
		--shadow-lg:
			0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
	}

	.item-checker {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: rgb(255 255 255 / 0.05);
		backdrop-filter: blur(8px);
		border-radius: 1rem;
		box-shadow: var(--shadow-lg);
	}

	.item-input-container {
		position: relative;
		isolation: isolate;
	}

	.item-input-container::before {
		content: '';
		position: absolute;
		inset: -4px;
		background: linear-gradient(
			to right,
			var(--color-blue-600),
			var(--color-cyan-600)
		);
		border-radius: 0.75rem;
		opacity: 0.2;
		z-index: -1;
		transition: opacity var(--transition-standard);
	}

	.item-input-container:hover::before {
		opacity: 0.3;
		transition-duration: 1000ms;
	}

	.item-input {
		position: relative;
		width: 100%;
		height: 16rem;
		padding: 1rem;
		background-color: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		color: var(--color-text);
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		overflow: auto;
		white-space: pre-wrap;
		transition:
			border-color var(--transition-standard),
			box-shadow var(--transition-standard);
	}

	.item-input:focus {
		outline: none;
		border-color: rgb(59 130 246 / 0.5);
		box-shadow: 0 0 0 1px rgb(59 130 246 / 0.5);
	}

	/* Scrollbar styling with modern approach */
	.item-input {
		scrollbar-width: thin;
		scrollbar-color: rgb(255 255 255 / 0.1) rgb(255 255 255 / 0.05);
	}

	.item-input::-webkit-scrollbar {
		width: 8px;
	}

	.item-input::-webkit-scrollbar-track {
		background: rgb(255 255 255 / 0.05);
	}

	.item-input::-webkit-scrollbar-thumb {
		background-color: rgb(255 255 255 / 0.1);
		border-radius: 9999px;
	}
	.error-message {
		text-align: center;
		padding: 0.5rem;
		background-color: rgb(127 29 29 / 0.2);
		border: 1px solid rgb(239 68 68 / 0.2);
		border-radius: 0.5rem;
		color: var(--color-red-400);
		font-size: 0.875rem;
	}

	.option-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: rgb(255 255 255 / 0.8);
	}

	.option-label {
		font-size: 0.875rem;
		user-select: none;
	}

	.toggle-switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 1.5rem;
		width: 2.75rem;
		border-radius: 9999px;
		background-color: rgb(255 255 255 / 0.1);
		transition: background-color var(--transition-standard);
	}

	.toggle-switch:focus-visible {
		outline: 2px solid var(--color-blue-500);
		outline-offset: 2px;
	}

	.toggle-switch.active {
		background: linear-gradient(
			to right,
			var(--color-blue-600),
			var(--color-cyan-600)
		);
	}

	.toggle-knob {
		position: absolute;
		left: 0.25rem;
		display: inline-block;
		height: 1rem;
		width: 1rem;
		border-radius: 50%;
		background-color: white;
		transform: translateX(0);
		transition: transform var(--transition-standard);
	}

	.toggle-switch.active .toggle-knob {
		transform: translateX(1.25rem);
	}

	.search-button {
		position: relative;
		width: 100%;
		padding: 1rem 1.5rem;
		border: none;
		border-radius: 0.75rem;
		background: linear-gradient(
			to right,
			var(--color-blue-600),
			var(--color-cyan-600)
		);
		color: white;
		font-weight: 500;
		cursor: pointer;
		transition: filter var(--transition-standard);
		box-shadow: 0 10px 15px -3px rgb(37 99 235 / 0.2);
		overflow: hidden;
		isolation: isolate;
	}

	.search-button::before {
		content: '';
		position: absolute;
		inset: -4px;
		background: linear-gradient(
			to right,
			var(--color-blue-600),
			var(--color-cyan-600)
		);
		border-radius: 0.75rem;
		opacity: 0.2;
		z-index: -1;
		transition: opacity var(--transition-standard);
	}

	.search-button:hover {
		filter: brightness(1.1);
	}

	.search-button:hover::before {
		opacity: 0.4;
	}

	.search-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.spinner {
		animation: spin 1s linear infinite;
		height: 1.25rem;
		width: 1.25rem;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Using modern CSS layout features */
	@supports (display: grid) {
		.item-checker {
			display: grid;
			grid-gap: 1rem;
		}
	}

	/* Using container queries where supported */
	@supports (container-type: inline-size) {
		.item-checker {
			container-type: inline-size;
			container-name: checker;
		}

		@container checker (min-width: 480px) {
			.option-container {
				justify-content: flex-end;
			}
		}
	}

	/* Using modern CSS color features */
	@supports (color: oklch(0% 0 0)) {
		:root {
			--color-blue-500: oklch(56.3% 0.2 263.8);
			--color-blue-600: oklch(51.2% 0.226 265.3);
			--color-cyan-500: oklch(80.5% 0.126 195.6);
			--color-cyan-600: oklch(74.8% 0.143 196.4);
		}
	}
</style>
