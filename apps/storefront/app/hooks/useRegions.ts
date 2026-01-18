import { useState, useEffect, useCallback, useRef } from "react";
import { getMedusaClient } from "../lib/medusa";

// Check if in development mode
const isDevelopment = import.meta.env.MODE === 'development';

export interface MedusaRegion {
  id: string;
  name: string;
  currency_code: string;
  countries: Array<{
    iso_2: string;
    iso_3: string;
    name: string;
  }>;
}

interface UseRegionsReturn {
  regions: MedusaRegion[];
  isLoading: boolean;
  error: string | null;
  refreshRegions: () => Promise<void>;
  getRegionById: (id: string) => MedusaRegion | undefined;
  getRegionByCurrency: (currency: string) => MedusaRegion | undefined;
  getRegionByCountry: (countryCode: string) => MedusaRegion | undefined;
}

// Cache regions globally to avoid redundant API calls
let cachedRegions: MedusaRegion[] | null = null;
let cachePromise: Promise<MedusaRegion[]> | null = null;

/**
 * Hook to fetch and manage Medusa regions
 * Implements caching to avoid redundant API calls across components
 */
export function useRegions(): UseRegionsReturn {
  const [regions, setRegions] = useState<MedusaRegion[]>(cachedRegions || []);
  const [isLoading, setIsLoading] = useState(!cachedRegions);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchRegions = useCallback(async (): Promise<MedusaRegion[]> => {
    // Return cached if available
    if (cachedRegions) {
      return cachedRegions;
    }

    // If already fetching, wait for that promise
    if (cachePromise) {
      return cachePromise;
    }

    // Start new fetch
    cachePromise = (async () => {
      try {
        const client = getMedusaClient();
        const { regions: fetchedRegions } = await client.store.region.list();
        
        const mappedRegions: MedusaRegion[] = (fetchedRegions || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          currency_code: r.currency_code?.toLowerCase() || 'usd',
          countries: (r.countries || []).map((c: any) => ({
            iso_2: c.iso_2?.toLowerCase() || '',
            iso_3: c.iso_3?.toLowerCase() || '',
            name: c.name || '',
          })),
        }));

        cachedRegions = mappedRegions;
        
        if (isDevelopment) {
          console.log('[useRegions] Fetched regions:', mappedRegions.map(r => ({
            id: r.id,
            name: r.name,
            currency: r.currency_code,
            countries: r.countries.map(c => c.iso_2).join(', '),
          })));
        }

        return mappedRegions;
      } finally {
        cachePromise = null;
      }
    })();

    return cachePromise;
  }, []);

  const refreshRegions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Clear cache to force refetch
      cachedRegions = null;
      const freshRegions = await fetchRegions();
      
      if (isMounted.current) {
        setRegions(freshRegions);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch regions';
      if (isMounted.current) {
        setError(message);
      }
      console.error('[useRegions] Error:', err);
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, [fetchRegions]);

  // Initial load
  useEffect(() => {
    isMounted.current = true;

    if (!cachedRegions) {
      refreshRegions();
    }

    return () => {
      isMounted.current = false;
    };
  }, [refreshRegions]);

  // Helper functions
  const getRegionById = useCallback((id: string): MedusaRegion | undefined => {
    return regions.find(r => r.id === id);
  }, [regions]);

  const getRegionByCurrency = useCallback((currency: string): MedusaRegion | undefined => {
    const normalized = currency.toLowerCase();
    return regions.find(r => r.currency_code === normalized);
  }, [regions]);

  const getRegionByCountry = useCallback((countryCode: string): MedusaRegion | undefined => {
    const normalized = countryCode.toLowerCase();
    return regions.find(r => 
      r.countries.some(c => c.iso_2 === normalized || c.iso_3 === normalized)
    );
  }, [regions]);

  return {
    regions,
    isLoading,
    error,
    refreshRegions,
    getRegionById,
    getRegionByCurrency,
    getRegionByCountry,
  };
}

/**
 * Clear the regions cache (useful for testing or after region config changes)
 */
export function clearRegionsCache(): void {
  cachedRegions = null;
  cachePromise = null;
}
