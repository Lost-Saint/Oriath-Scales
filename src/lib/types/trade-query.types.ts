export interface ParsedItem {
	itemClass?: string;
	itemLevel?: number;
	stats: string[];
	rarity?: string;
	name?: string;
	baseType?: string;
}

export interface SearchQuery {
	query: {
		status: { option: string };
		stats: Array<{
			type: string;
			filters: Array<{
				id: string;
				disabled: boolean;
				value: { min: number };
			}>;
			disabled: boolean;
		}>;
		name?: string;
		type?: string;
		filters?: {
			type_filters: {
				filters: {
					category?: { option: string };
					ilvl?: { min: number };
				};
				disabled: boolean;
			};
		};
	};
	sort: { price: string };
}
