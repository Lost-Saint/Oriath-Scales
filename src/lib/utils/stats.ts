import type { StatGroup, StatOption } from '$lib/types/utils';
import Fuse from 'fuse.js';

let statsCache: StatOption[] | null = null;
let fuseInstance: Fuse<StatOption> | null = null;
let implicitFuseInstance: Fuse<StatOption> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 1 minute

export async function fetchStats(): Promise<StatOption[]> {
  const now = Date.now();

  if (statsCache !== null && now - lastFetchTime < CACHE_DURATION) {
    return statsCache;
  }

  const response = await fetch('/api/poe/stats');
  const responseIsOk = response.ok;
  
  if (!responseIsOk) {
    const errorMessage = `Failed to fetch stats: ${response.status}`;
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const hasError = data.error;
  
  if (hasError) {
    throw new Error(data.error);
  }

  const hasValidResult = data.result && Array.isArray(data.result);
  
  if (!hasValidResult) {
    throw new Error('Invalid stats data received from API');
  }

  const processedStats = processStatsData(data.result);
  const hasNoStats = processedStats.length === 0;
  
  if (hasNoStats) {
    throw new Error('No stats data received from API');
  }

  statsCache = processedStats;
  fuseInstance = createFuseInstance(processedStats);
  implicitFuseInstance = createImplicitFuseInstance(processedStats);
  lastFetchTime = now;

  return processedStats;
}

function processStatsData(groups: StatGroup[]): StatOption[] {
  const allStats: StatOption[] = [];
  
  for (const group of groups) {
    for (const entry of group.entries) {
      const statOption: StatOption = {
        id: entry.id,
        text: entry.text,
        type: group.label,
        option: entry.option
      };
      allStats.push(statOption);
    }
  }
  
  return allStats;
}

function createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
  const fuseOptions = {
    keys: ['text'],
    includeScore: true,
    threshold: 0.7,
    distance: 300,
    ignoreLocation: true,
    minMatchCharLength: 2,
    useExtendedSearch: true,
    getFn: (obj: StatOption, path: string | string[]) => {
      const value = obj[path as keyof StatOption];
      if (path === 'text' && typeof value === 'string') {
        return normalizeStatText(value);
      }
      if (typeof value === 'string' || typeof value === 'number') {
        return value;
      }
      return '';
    }
  };
  
  return new Fuse(stats, fuseOptions);
}

function createImplicitFuseInstance(stats: StatOption[]): Fuse<StatOption> {
  const implicitStats = stats.filter(stat => stat.type === 'Implicit');
  return createFuseInstance(implicitStats);
}

function normalizeStatText(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .replace(/\+(?=\d)/g, '') // Remove leading + before numbers
    .replace(/\[|\]/g, '') // Remove square brackets
    .replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
    .replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^adds /, '') // Remove common prefixes
    .replace(/^gain /, '')
    .replace(/^you /, '')
    .replace(/\s*\(implicit\)\s*$/i, '') // Remove (implicit) suffix
    .trim();
}

export function findStatId(statText: string): string | null {
  const cacheExists = statsCache !== null;
  const fuseExists = fuseInstance !== null;
  const implicitFuseExists = implicitFuseInstance !== null;
  
  if (!cacheExists || !fuseExists || !implicitFuseExists) {
    console.error('Stats cache is not initialized');
    return null;
  }

  const normalizedInput = normalizeStatText(statText);
  const searchInImplicitOnly = shouldSearchImplicitOnly(statText);
  
  const exactMatch = findExactMatch(normalizedInput, searchInImplicitOnly);
  const hasExactMatch = exactMatch !== null;
  
  if (hasExactMatch) {
    logExactMatch(normalizedInput, exactMatch);
    return exactMatch.id;
  }

  const fuzzyMatch = findFuzzyMatch(normalizedInput, searchInImplicitOnly);
  return fuzzyMatch;
}

function shouldSearchImplicitOnly(statText: string): boolean {
  return statText.toLowerCase().includes('implicit');
}

function findExactMatch(normalizedInput: string, implicitOnly: boolean): StatOption | null {
  if (!statsCache) return null;
  
  const relevantStats = getRelevantStats(implicitOnly);
  
  for (const stat of relevantStats) {
    const normalizedStatText = normalizeStatText(stat.text);
    const isExactMatch = normalizedStatText === normalizedInput;
    
    if (isExactMatch) {
      return stat;
    }
  }
  
  return null;
}

function getRelevantStats(implicitOnly: boolean): StatOption[] {
  if (!statsCache) return [];
  
  if (implicitOnly) {
    return statsCache.filter(stat => stat.type === 'Implicit');
  }
  
  return statsCache;
}

function findFuzzyMatch(normalizedInput: string, implicitOnly: boolean): string | null {
  const searchInstance = implicitOnly ? implicitFuseInstance : fuseInstance;
  
  if (!searchInstance) return null;

  const [firstResult] = searchInstance.search(normalizedInput);
  if (!firstResult || firstResult.score === undefined) return null;

  if (firstResult.score < 0.8) {
    return firstResult.item.id;
  }

  return null;
}

function logExactMatch(input: string, match: StatOption): void {
  console.log('Found exact match:', {
    input: input,
    match: match.text,
    id: match.id
  });
}

export function extractValue(statText: string): number {
  const matches = statText.match(/([+-]?\d+\.?\d*)/g);
  const hasMatches = matches !== null;
  
  if (!hasMatches) {
    return 0;
  }
  
  const firstMatch = matches[0];
  return parseFloat(firstMatch);
}
