import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tryCatch } from '../src/lib/utils/error';

/**
 * Fetches stats data from Path of Exile API and updates the local cache file
 */
async function updateStatsCache(): Promise<void> {
  const dev = process.env.NODE_ENV === 'development';
  const CACHE_PATH = join(process.cwd(), 'src/lib/server/cache/stats.json');
  
  console.log('Fetching stats from Path of Exile API...');
  const fetchResult = await tryCatch(
    fetch('https://www.pathofexile.com/api/trade2/data/stats', {
      headers: {
        'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
        'Accept': 'application/json',
      },
    })
  );
  
  if (fetchResult.error) {
    console.error('Failed to fetch stats:', fetchResult.error);
    if (!dev) process.exit(1);
    return;
  }
  
  if (!fetchResult.data.ok) {
    console.error(`Failed to fetch stats: ${fetchResult.data.status} ${fetchResult.data.statusText}`);
    if (!dev) process.exit(1);
    return;
  }

  const jsonResult = await tryCatch(fetchResult.data.json());
  
  if (jsonResult.error) {
    console.error('Failed to parse response JSON:', jsonResult.error);
    if (!dev) process.exit(1);
    return;
  }

  const cache = {
    lastUpdated: new Date().toISOString(),
    data: jsonResult.data
  };

  console.log(`Writing cache to ${CACHE_PATH}`);
  const writeResult = await tryCatch(
    writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))
  );
  
  if (writeResult.error) {
    console.error('Failed to write cache file:', writeResult.error);
    if (!dev) process.exit(1);
    return;
  }
  
  console.log('Stats cache updated successfully');
}

// Self-executing function to run the script
(async () => {
  console.log('Starting stats cache update...');
  const result = await tryCatch(updateStatsCache());
  
  if (result.error) {
    console.error('Unhandled error during cache update:', result.error);
    process.exit(1);
  } else {
    console.log('Cache update completed');
  }
})();
