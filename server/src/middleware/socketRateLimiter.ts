import { Socket, Server } from "socket.io";
import { RedisClientType } from "redis";

/**
 * Socket.IO Rate Limiting
 * Protects WebSocket connections and events from spam and DDoS attacks
 */

// Configuration
const CONNECTION_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxConnections: 10, // Max 10 connections per IP per minute
};

const EVENT_RATE_LIMIT = {
  windowMs: 1000, // 1 second
  maxEvents: 50, // Max 50 events per second (for real-time collaboration)
};

const DOCUMENT_EVENT_RATE_LIMIT = {
  windowMs: 1000, // 1 second
  maxEvents: 30, // Max 30 document events per second
};

// In-memory storage for rate limiting (fallback)
const connectionCounts = new Map<string, { count: number; resetTime: number }>();
const eventCounts = new Map<string, { count: number; resetTime: number }>();

let redisClient: RedisClientType | null = null;

/**
 * Set Redis client for socket rate limiting
 */
export function setSocketRateLimitRedisClient(client: RedisClientType) {
  redisClient = client;
}

/**
 * Get client IP from socket handshake
 */
function getSocketClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = typeof forwarded === "string" ? forwarded : forwarded[0];
    return ips.split(",")[0].trim();
  }
  
  const realIp = socket.handshake.headers["x-real-ip"];
  if (realIp) {
    return typeof realIp === "string" ? realIp : realIp[0];
  }
  
  return socket.handshake.address || "unknown";
}

/**
 * Check connection rate limit using Redis or in-memory storage
 */
async function checkConnectionRateLimit(ip: string): Promise<boolean> {
  const key = `socket:conn:${ip}`;
  const now = Date.now();

  if (redisClient) {
    try {
      const count = await redisClient.incr(key);
      
      if (count === 1) {
        // Set expiry on first request
        await redisClient.expire(key, Math.ceil(CONNECTION_RATE_LIMIT.windowMs / 1000));
      }
      
      return count <= CONNECTION_RATE_LIMIT.maxConnections;
    } catch (error) {
      console.error("[SOCKET RATE LIMIT] Redis error:", error);
      // Fallback to in-memory
    }
  }

  // In-memory fallback
  const record = connectionCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    connectionCounts.set(ip, {
      count: 1,
      resetTime: now + CONNECTION_RATE_LIMIT.windowMs,
    });
    return true;
  }

  record.count++;
  return record.count <= CONNECTION_RATE_LIMIT.maxConnections;
}

/**
 * Check event rate limit using Redis or in-memory storage
 */
async function checkEventRateLimit(
  socketId: string, 
  eventType: string,
  limit: { windowMs: number; maxEvents: number }
): Promise<boolean> {
  const key = `socket:event:${socketId}:${eventType}`;
  const now = Date.now();

  if (redisClient) {
    try {
      const count = await redisClient.incr(key);
      
      if (count === 1) {
        await redisClient.expire(key, Math.ceil(limit.windowMs / 1000));
      }
      
      return count <= limit.maxEvents;
    } catch (error) {
      console.error("[SOCKET RATE LIMIT] Redis error:", error);
    }
  }

  // In-memory fallback
  const record = eventCounts.get(key);
  
  if (!record || now > record.resetTime) {
    eventCounts.set(key, {
      count: 1,
      resetTime: now + limit.windowMs,
    });
    return true;
  }

  record.count++;
  return record.count <= limit.maxEvents;
}

/**
 * Socket.IO connection rate limiting middleware
 * Checks if IP has exceeded connection rate limit before allowing connection
 */
export function socketConnectionRateLimiter(io: Server) {
  io.use(async (socket: Socket, next) => {
    const clientIp = getSocketClientIp(socket);
    
    const allowed = await checkConnectionRateLimit(clientIp);
    
    if (!allowed) {
      console.warn(`[SOCKET RATE LIMIT] Connection rejected for IP: ${clientIp}`);
      return next(new Error("Too many connections. Please try again later."));
    }
    
    // Store IP on socket for later use
    socket.data.clientIp = clientIp;
    next();
  });
}

/**
 * Create event rate limiter wrapper for socket events
 * Wraps event handlers to check rate limits before processing
 */
export function createEventRateLimiter(socket: Socket) {
  const rateLimitedEvents = new Set([
    "send-changes",
    "save-document",
    "get-document",
  ]);

  return function wrapHandler<T extends (...args: any[]) => any>(
    eventName: string,
    handler: T
  ): T {
    if (!rateLimitedEvents.has(eventName)) {
      return handler;
    }

    const wrappedHandler = async (...args: Parameters<T>) => {
      const limit = eventName === "send-changes" || eventName === "save-document"
        ? DOCUMENT_EVENT_RATE_LIMIT
        : EVENT_RATE_LIMIT;

      const allowed = await checkEventRateLimit(socket.id, eventName, limit);
      
      if (!allowed) {
        console.warn(`[SOCKET RATE LIMIT] Event "${eventName}" rejected for socket: ${socket.id}`);
        socket.emit("rate-limit-exceeded", {
          event: eventName,
          message: "Too many requests. Please slow down.",
        });
        return;
      }
      
      return handler(...args);
    };

    return wrappedHandler as T;
  };
}

/**
 * Middleware to apply rate limiting to specific socket events
 */
export function applySocketEventRateLimiting(socket: Socket) {
  const originalOn = socket.on.bind(socket);
  const rateLimiter = createEventRateLimiter(socket);

  // Override socket.on to wrap handlers with rate limiting
  socket.on = function(event: string, listener: (...args: any[]) => void) {
    const wrappedListener = rateLimiter(event, listener);
    return originalOn(event, wrappedListener);
  } as typeof socket.on;
}

/**
 * Clean up old in-memory rate limit records periodically
 */
export function startRateLimitCleanup(intervalMs: number = 60000) {
  setInterval(() => {
    const now = Date.now();
    
    for (const [key, record] of connectionCounts.entries()) {
      if (now > record.resetTime) {
        connectionCounts.delete(key);
      }
    }
    
    for (const [key, record] of eventCounts.entries()) {
      if (now > record.resetTime) {
        eventCounts.delete(key);
      }
    }
  }, intervalMs);
}

/**
 * Get current rate limit stats (for monitoring)
 */
export function getRateLimitStats() {
  return {
    activeConnections: connectionCounts.size,
    activeEventTrackers: eventCounts.size,
  };
}
