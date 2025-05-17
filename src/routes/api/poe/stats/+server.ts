import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';
import { tryCatch } from '$lib/utils/error';

// Constants
const CACHE_DURATION = 24 * 60 * 60; // 24h in seconds
const CACHE_PATH = join(process.cwd(), 'src/lib/server/cache/stats.json');

/**
 * Read stats cache from filesystem using tryCatch
 */
async function readCache(): Promise<{ data: any; lastUpdated: string } | null> {
  const readResult = await tryCatch(fs.readFile(CACHE_PATH, 'utf-8'));
  
  if (readResult.error) {
    console.error('Error reading cache:', readResult.error);
    return null;
  }
  
  const parseResult = tryCatch<{ data: any; lastUpdated: string }>(() => 
    JSON.parse(readResult.data)
  );
  
  if (parseResult.error) {
    console.error('Error parsing cache:', parseResult.error);
    return null;
  }
  
  return parseResult.data;
}

/**
 * Write stats data to cache file using tryCatch
 */
async function writeCache(data: any): Promise<void> {
  // Ensure the cache directory exists
  const cacheDir = join(process.cwd(), 'src/lib/server/cache');
  
  // Create directory (ignore errors if it exists)
  await tryCatch(fs.mkdir(cacheDir, { recursive: true }));
  
  const cacheData = {
    data,
    lastUpdated: new Date().toISOString()
  };
  
  const writeResult = await tryCatch(
    fs.writeFile(CACHE_PATH, JSON.stringify(cacheData, null, 2))
  );
  
  if (writeResult.error) {
    console.error('Error writing cache:', writeResult.error);
    return;
  }
  
  console.log('Stats cache updated');
}

/**
 * SvelteKit GET handler for POE stats
 */
export const GET: RequestHandler = async () => {
  // Try to read from cache first
  const cacheResult = await tryCatch(readCache());
  const cache = cacheResult.error ? null : cacheResult.data;
  const now = new Date().getTime();
  
  // If cache is valid, return it
  if (cache?.lastUpdated && cache.data) {
    const cacheAge = now - new Date(cache.lastUpdated).getTime();
    if (cacheAge < CACHE_DURATION * 1000) {
      return json(cache.data, {
        headers: {
          'Cache-Control': `public, max-age=${CACHE_DURATION}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  // Fetch fresh data from POE API
  const fetchResult = await tryCatch(
    fetch('https://www.pathofexile.com/api/trade2/data/stats', {
      headers: {
        'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
        'Accept': 'application/json'
      }
    })
  );

  if (fetchResult.error || !fetchResult.data.ok) {
    // Fall back to expired cache if API fails
    if (cache?.data) {
      console.log('Using expired cache due to API failure');
      return json(cache.data, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json'
        }
      });
    }
    
    // No cache available, return error
    console.error('Error fetching PoE stats:', 
      fetchResult.error || 
      `Status: ${fetchResult.data?.status} ${fetchResult.data?.statusText}`
    );
    
    return json(
      { error: 'Failed to fetch stats' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // Process successful response
  const jsonResult = await tryCatch(fetchResult.data.json());
  
  if (jsonResult.error) {
    // Fall back to expired cache if parsing fails
    if (cache?.data) {
      console.log('Using expired cache due to API response parsing failure');
      return json(cache.data, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Content-Type': 'application/json'
        }
      });
    }
    
    console.error('Error parsing PoE stats response:', jsonResult.error);
    return json(
      { error: 'Failed to parse stats response' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json'
        }
      }
    );
  }

  // Write new data to cache asynchronously
  void tryCatch(writeCache(jsonResult.data));

  return json(jsonResult.data, {
    headers: {
      'Cache-Control': `public, max-age=${CACHE_DURATION}`,
      'Content-Type': 'application/json'
    }
  });
};
