import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Fetches stats data from Path of Exile API and updates the local cache file
 */
async function updateStatsCache(): Promise<void> {
  const dev = process.env.NODE_ENV === 'development';
  const CACHE_PATH = join(process.cwd(), 'src/lib/server/cache/stats.json');
  
  try {
    // Ensure cache directory exists
    const cacheDir = join(process.cwd(), 'src/lib/server/cache');
    try {
      await mkdir(cacheDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore this error
    }
    
    console.log('Fetching stats from Path of Exile API...');
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
    
    console.log(`Writing cache to ${CACHE_PATH}`);
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log('Stats cache updated successfully');
  } catch (error) {
    console.error('Failed to update stats cache:', error);
    if (!dev) {
      process.exit(1);
    }
  }
}

// Self-executing function to run the script
(async () => {
  console.log('Starting stats cache update...');
  await updateStatsCache();
  console.log('Cache update completed');
})().catch(error => {
  console.error('Unhandled error during cache update:', error);
  process.exit(1);
});
