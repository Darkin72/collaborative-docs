import { getRedisClient } from "./redis";

// Cache configuration
const DOCUMENT_CACHE_PREFIX = "doc:";
const DOCUMENT_CACHE_TTL = 3600; // 1 hour in seconds
const DOCUMENT_META_PREFIX = "doc:meta:";

interface CachedDocument {
  data: any;
  name: string;
  ownerId: string;
  permissions: Record<string, string>;
  cachedAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  invalidations: number;
}

// In-memory stats tracking
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  invalidations: 0,
};

/**
 * Get cache key for a document
 */
function getDocumentCacheKey(documentId: string): string {
  return `${DOCUMENT_CACHE_PREFIX}${documentId}`;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  const client = getRedisClient();
  return client !== null && client.isOpen;
}

/**
 * Get document from cache
 * Returns null if not in cache or Redis unavailable
 */
export async function getDocumentFromCache(documentId: string): Promise<CachedDocument | null> {
  const client = getRedisClient();
  
  if (!client || !client.isOpen) {
    console.log(`[CACHE] Redis not available, skipping cache read for ${documentId}`);
    return null;
  }

  try {
    const cacheKey = getDocumentCacheKey(documentId);
    const cached = await client.get(cacheKey);
    
    if (cached) {
      cacheStats.hits++;
      const document = JSON.parse(cached) as CachedDocument;
      console.log(`[CACHE] HIT for document ${documentId} (cached ${Date.now() - document.cachedAt}ms ago)`);
      return document;
    }
    
    cacheStats.misses++;
    console.log(`[CACHE] MISS for document ${documentId}`);
    return null;
  } catch (error) {
    console.error(`[CACHE] Error reading from cache:`, error);
    return null;
  }
}

/**
 * Set document in cache with TTL
 */
export async function setDocumentInCache(
  documentId: string, 
  document: {
    data: any;
    name: string;
    ownerId: string;
    permissions: Map<string, string> | Record<string, string>;
  }
): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client || !client.isOpen) {
    console.log(`[CACHE] Redis not available, skipping cache write for ${documentId}`);
    return false;
  }

  try {
    const cacheKey = getDocumentCacheKey(documentId);
    
    // Convert Map to object if needed
    const permissionsObj = document.permissions instanceof Map 
      ? Object.fromEntries(document.permissions)
      : document.permissions;
    
    const cacheData: CachedDocument = {
      data: document.data,
      name: document.name,
      ownerId: document.ownerId,
      permissions: permissionsObj,
      cachedAt: Date.now(),
    };
    
    await client.setEx(cacheKey, DOCUMENT_CACHE_TTL, JSON.stringify(cacheData));
    cacheStats.writes++;
    console.log(`[CACHE] SET document ${documentId} with TTL ${DOCUMENT_CACHE_TTL}s`);
    return true;
  } catch (error) {
    console.error(`[CACHE] Error writing to cache:`, error);
    return false;
  }
}

/**
 * Update only the document data in cache (for partial updates)
 */
export async function updateDocumentDataInCache(
  documentId: string,
  data: any
): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client || !client.isOpen) {
    return false;
  }

  try {
    // Get existing cache entry
    const cached = await getDocumentFromCache(documentId);
    
    if (cached) {
      // Update only the data field
      cached.data = data;
      cached.cachedAt = Date.now();
      
      const cacheKey = getDocumentCacheKey(documentId);
      await client.setEx(cacheKey, DOCUMENT_CACHE_TTL, JSON.stringify(cached));
      cacheStats.writes++;
      console.log(`[CACHE] UPDATED data for document ${documentId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[CACHE] Error updating cache:`, error);
    return false;
  }
}

/**
 * Invalidate (remove) document from cache
 */
export async function invalidateDocumentCache(documentId: string): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client || !client.isOpen) {
    return false;
  }

  try {
    const cacheKey = getDocumentCacheKey(documentId);
    const deleted = await client.del(cacheKey);
    
    if (deleted > 0) {
      cacheStats.invalidations++;
      console.log(`[CACHE] INVALIDATED document ${documentId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[CACHE] Error invalidating cache:`, error);
    return false;
  }
}

/**
 * Extend TTL for an active document (user is viewing/editing)
 */
export async function extendDocumentCacheTTL(documentId: string): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client || !client.isOpen) {
    return false;
  }

  try {
    const cacheKey = getDocumentCacheKey(documentId);
    const extended = await client.expire(cacheKey, DOCUMENT_CACHE_TTL);
    
    if (extended) {
      console.log(`[CACHE] Extended TTL for document ${documentId}`);
    }
    
    return extended;
  } catch (error) {
    console.error(`[CACHE] Error extending TTL:`, error);
    return false;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats & { hitRate: string } {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(2) + "%" : "N/A";
  
  return {
    ...cacheStats,
    hitRate,
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.writes = 0;
  cacheStats.invalidations = 0;
}

/**
 * Warm up cache by pre-loading frequently accessed documents
 * Call this during server startup if needed
 */
export async function warmUpCache(documentIds: string[], fetchDocument: (id: string) => Promise<any>): Promise<number> {
  let warmedCount = 0;
  
  for (const docId of documentIds) {
    try {
      const doc = await fetchDocument(docId);
      if (doc) {
        await setDocumentInCache(docId, doc);
        warmedCount++;
      }
    } catch (error) {
      console.error(`[CACHE] Error warming cache for ${docId}:`, error);
    }
  }
  
  console.log(`[CACHE] Warmed up ${warmedCount}/${documentIds.length} documents`);
  return warmedCount;
}
