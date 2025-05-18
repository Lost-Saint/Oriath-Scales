import { tryCatch } from '$lib/utils/error';
import type { StatsResult } from '$lib/types/stats';

/**
 * Manages communication with the Path of Exile stats API
 */
export class StatsApi {
  private readonly apiUrl = 'https://www.pathofexile.com/api/trade2/data/stats';
  private readonly headers: Record<string, string>;
  
  /**
   * Creates a new stats API service
   */
  constructor() {
    this.headers = {
      'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
      'Accept': 'application/json'
    };
  }
  
  /**
   * Fetches the complete stats data from the Path of Exile API
   * 
   * @returns A promise resolving to the stats data
   * @throws Error if the API request fails or returns invalid data
   */
  async fetchStats(): Promise<StatsResult> {
    // Make the API request
    const fetchResult = await tryCatch(
      fetch(this.apiUrl, { headers: this.headers })
    );
    
    // Handle connection errors
    if (fetchResult.error || !fetchResult.data.ok) {
      const errorMessage = fetchResult.error 
        ? `Connection error: ${fetchResult.error.message}`
        : `API error: ${fetchResult.data?.status} ${fetchResult.data?.statusText}`;
      
      throw new Error(`Failed to fetch PoE stats: ${errorMessage}`);
    }
    
    // Parse the JSON response
    const jsonResult = await tryCatch(fetchResult.data.json());
    
    if (jsonResult.error) {
      throw new Error(`Failed to parse stats response: ${jsonResult.error.message}`);
    }
    
    // Validate response structure
    const data = jsonResult.data as StatsResult;
    
    if (!Array.isArray(data.result)) {
      throw new Error('Invalid API response: missing or invalid "result" array');
    }
    
    return data;
  }
}

// Create and export a singleton instance
export const statsApi = new StatsApi();
