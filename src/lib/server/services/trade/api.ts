import { tryCatch } from '$lib/utils/error';
import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade';

/**
 * Handles interactions with the Path of Exile Trade API
 */
export class TradeApiService {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  
  /**
   * Creates a new trade API service
   */
  constructor() {
    this.baseUrl = import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
      'Accept': '*/*'
    };
  }
  
  /**
   * Get the base URL for POE API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
  
  /**
   * Build the full API URL for a trade search
   * 
   * @param league - The PoE league to search in
   * @returns Complete trade search URL
   */
  private buildSearchUrl(league: string): string {
    return `${this.baseUrl}/api/trade2/search/${encodeURIComponent(league)}`;
  }
  
  /**
   * Performs a trade search request to the Path of Exile API
   * 
   * @param request - Search request containing league and query
   * @returns Object containing both response and parsed data
   * @throws Error on connection failure or invalid response
   */
  async search(request: TradeSearchRequest): Promise<{ 
    response: Response; 
    data: TradeApiResponse 
  }> {
    const url = this.buildSearchUrl(request.league);
    
    // Make the API request
    const fetchResult = await tryCatch(
      fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request.query)
      })
    );
    
    // Handle connection errors
    if (fetchResult.error) {
      throw new Error(
        `Failed to connect to PoE API: ${
          fetchResult.error instanceof Error 
            ? fetchResult.error.message 
            : String(fetchResult.error)
        }`
      );
    }
    
    const response = fetchResult.data;
    
    // For non-OK responses, return early to let caller handle the specific status
    if (!response.ok) {
      return { 
        response, 
        data: { id: '', result: [] } 
      };
    }
    
    // Parse the JSON response
    const jsonResult = await tryCatch(response.json());
    
    if (jsonResult.error) {
      throw new Error(`Failed to parse API response: ${jsonResult.error}`);
    }
    
    // Validate response structure
    const data = jsonResult.data as TradeApiResponse;
    
    if (!data.id) {
      throw new Error('Invalid API response: missing search ID');
    }
    
    return { response, data };
  }
}

// Create and export a singleton instance
export const tradeApiService = new TradeApiService();
