import fs from 'fs/promises';
import path from 'path';

async function updateStatsCache() {
    try {
        const response = await fetch('https://www.pathofexile.com/api/trade2/data/stats', {
            headers: {
                'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const cache = {
            lastUpdated: new Date().toISOString(),
            data
        };

        const cachePath = path.join(process.cwd(), 'app', 'cache', 'stats.json');
        await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
        console.log('Stats cache updated successfully');
    } catch (error) {
        console.error('Failed to update stats cache:', error);
        process.exit(1);
    }
}

updateStatsCache();
