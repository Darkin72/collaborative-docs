import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

dotenv.config();
import {
  getAllDocuments,
  findOrCreateDocument,
  updateDocument,
} from "./controllers/documentController";

const PORT = Number(process.env.PORT || 3000);

/** Connect to MongoDB */
mongoose
  .connect(process.env.DATABASE_URL || "", { dbName: "Google-Docs" })
  .then(() => {
    console.log("Database connected.");
  })
  .catch((error) => {
    console.log("DB connection failed. " + error);
  });

const io = new Server(PORT, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

/** Redis Setup for Socket.io Adapter (Pub/Sub) */
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

async function initializeRedisAdapter() {
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

    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.io Redis Pub/Sub adapter initialized");

    // DEBUG: Log all Redis channels being subscribed
    setInterval(() => {
      const adapter = io.of("/").adapter as any;
      console.log("Active Redis channels:", adapter.rooms?.size || 0);
    }, 10000); // Log every 10s

    return { pubClient, subClient };
  } catch (error) {
    console.error("Failed to initialize Redis adapter:", error);
    console.log("Continuing without Redis adapter (single server mode)");
    return null;
  }
}

// Initialize Redis adapter before handling connections
initializeRedisAdapter().then(() => {
  console.log(`Socket.io server ready on port ${PORT}`);
});

io.on("connection", (socket) => {
  const currentClients = io.sockets.sockets.size;
  console.log(
    `Client connected: ${socket.id} (Currently connected: ${currentClients})`,
  );

  socket.on("get-all-documents", async () => {
    const allDocuments = await getAllDocuments();
    allDocuments.reverse();
    socket.emit("all-documents", allDocuments);
  });

  socket.on("get-document", async ({ documentId, documentName }) => {
    // Join both Socket.io room AND create dedicated Redis channel
    socket.join(documentId);
    console.log(`User ${socket.id} subscribed to document ${documentId}`);

    const document = await findOrCreateDocument({ documentId, documentName });

    if (document) socket.emit("load-document", document.data);

    // Remove any existing listeners to prevent duplicates on reconnection
    socket.removeAllListeners("send-changes");
    socket.removeAllListeners("save-document");

    socket.on("send-changes", (delta) => {
      // Only broadcast in this document's "room"
      // Redis adapter automatically route to channel: `socket.io#${documentId}#`
      socket.broadcast.to(documentId).emit("receive-changes", delta);
    });

    socket.on("save-document", async (data) => {
      await updateDocument(documentId, { data });
    });
  });

  socket.on("disconnecting", () => {
    // Log which documents the user is unsubscribing from
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        console.log(`User ${socket.id} unsubscribed from document ${room}`);
      }
    }
  });

  socket.on("disconnect", () => {
    const currentClients = io.sockets.sockets.size;
    console.log(`Client disconnected: ${socket.id} (Currently connected: ${currentClients})`);
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server gracefully");
  io.close(() => {
    console.log("Socket.io server closed");
    process.exit(0);
  });
});
