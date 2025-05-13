import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Constants
const CACHE_DURATION = 24 * 60 * 60; // 24h in seconds

// Determine root path of the project
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..', '..', '..', '..');

/**
 * Read stats cache from filesystem
 */
async function readCache(): Promise<{data: any, lastUpdated: string} | null> {
  try {
    const cachePath = join(rootPath, 'static', 'cache', 'stats.json');
    const cacheContent = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(cacheContent);
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

/**
 * Write stats data to cache file
 */
async function writeCache(data: any): Promise<void> {
  try {
    const cacheDir = join(rootPath, 'static', 'cache');
    const cachePath = join(cacheDir, 'stats.json');
    
    // Ensure the cache directory exists
    try {
      await fs.mkdir(cacheDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, ignore this error
    }
    
    await fs.writeFile(
      cachePath,
      JSON.stringify({
        data,
        lastUpdated: new Date().toISOString()
      })
    );
    console.log('Stats cache updated');
  } catch (error) {
    console.error('Error writing cache:', error);
  }
}

/**
 * SvelteKit GET handler for POE stats
 */
export const GET: RequestHandler = async () => {
  try {
    // Try to read from cache first
    const cache = await readCache();
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
    const response = await fetch('https://www.pathofexile.com/api/trade2/data/stats', {
      headers: {
        'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
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
      throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
    }
    
    // Process and cache successful response
    const data = await response.json();
    
    // Write new data to cache asynchronously
    void writeCache(data);
    
    return json(data, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_DURATION}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error fetching PoE stats:', error);
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
};
