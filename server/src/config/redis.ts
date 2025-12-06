import { createClient, RedisClientType } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Export Redis client for use in other modules (e.g., rate limiting)
let sharedRedisClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType | null {
  return sharedRedisClient;
}

export async function initializeRedisAdapter(io: Server) {
  try {
    const pubClient = createClient({
      socket: { host: REDIS_HOST, port: REDIS_PORT },
      password: REDIS_PASSWORD,
    });

    const subClient = pubClient.duplicate();

    pubClient.on("error", (err) =>
      console.error("Redis Pub Client Error:", err),
    );
    subClient.on("error", (err) =>
      console.error("Redis Sub Client Error:", err),
    );

    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log("Redis clients connected successfully");

    // Store shared client for use in other modules
    sharedRedisClient = pubClient as RedisClientType;

    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.io Redis Pub/Sub adapter initialized");

    // DEBUG: Log all Redis channels being subscribed
    setInterval(() => {
      const adapter = io.of("/").adapter as any;
      console.log("Active Redis channels:", adapter.rooms?.size || 0);
    }, 10000);

    return { pubClient, subClient };
  } catch (error) {
    console.error("Failed to initialize Redis adapter:", error);
    console.log("Continuing without Redis adapter (single server mode)");
    return null;
  }
}
