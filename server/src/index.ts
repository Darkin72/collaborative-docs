import { Server } from "socket.io";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { connectToDatabase } from "./config/database";
import { initializeRedisAdapter, getRedisClient } from "./config/redis";
import authRoutes from "./routes/auth.routes";
import documentsRoutes from "./routes/documents.routes";
import { setupDocumentSocket } from "./sockets/documentSocket";
import { 
  generalRateLimiter, 
  authRateLimiter, 
  documentRateLimiter,
  setRateLimitRedisClient 
} from "./middleware/rateLimiter";
import { 
  socketConnectionRateLimiter, 
  setSocketRateLimitRedisClient,
  startRateLimitCleanup 
} from "./middleware/socketRateLimiter";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

/** Connect to MongoDB */
connectToDatabase();

/** Express HTTP Server Setup */
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

/** Apply general rate limiting to all routes */
app.use(generalRateLimiter);

/** Health check endpoint (not rate limited) */
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

const httpServer = createServer(app);

/** HTTP API Routes with specific rate limiters */
// Auth routes with stricter rate limiting (20 req/min)
app.use("/api/login", authRateLimiter);
app.use("/api", authRoutes);

// Document routes with document-specific rate limiting (50 req/min)
app.use("/api/documents", documentRateLimiter, documentsRoutes);

/** Socket.IO Server Setup */
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.CLIENT_ORIGIN || "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/** Initialize Redis adapter and Socket handlers */
initializeRedisAdapter(io).then((result) => {
  // Set up Redis client for rate limiting if available
  const redisClient = getRedisClient();
  if (redisClient) {
    setRateLimitRedisClient(redisClient as any);
    setSocketRateLimitRedisClient(redisClient as any);
    console.log("Rate limiting configured with Redis backend");
  } else {
    console.log("Rate limiting using in-memory storage (single server mode)");
  }
  
  // Start cleanup for in-memory rate limit records
  startRateLimitCleanup();
  
  console.log(`Socket.io server ready on port ${PORT}`);
});

/** Apply Socket.IO connection rate limiting */
socketConnectionRateLimiter(io);

setupDocumentSocket(io);

/** Start HTTP server */
httpServer.listen(PORT, () => {
  console.log(`HTTP + Socket.IO server running on port ${PORT}`);
});

/** Graceful shutdown */
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server gracefully");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
