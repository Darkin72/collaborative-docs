import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import express from "express";
import { Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";

interface User {
  id: string;
  username: string;
  displayName: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

dotenv.config();
import {
  getAllDocuments,
  findOrCreateDocument,
  updateDocument,
} from "./controllers/documentController";
import { validateCredentials } from "./data/accounts";

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

/** Express HTTP Server Setup */
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

const httpServer = createServer(app);

/** HTTP API Routes */
app.post(
  "/api/login",
  (
    req: Request<{}, LoginResponse, LoginRequest>,
    res: Response<LoginResponse>,
  ) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Username and password required" });
    }

    const account = validateCredentials(username, password);
    if (account) {
      res.json({
        success: true,
        user: {
          id: account.id,
          username: account.username,
          displayName: account.displayName,
        },
      });
    } else {
      res.status(401).json({ success: false, error: "Invalid credentials" });
    }
  },
);

app.post(
  "/api/logout",
  (req: Request, res: Response<{ success: boolean; message: string }>) => {
    res.json({ success: true, message: "Logged out successfully" });
  },
);

interface DocumentsResponse {
  success: boolean;
  documents?: any[];
  error?: string;
}

app.get(
  "/api/documents",
  async (req: Request, res: Response<DocumentsResponse>) => {
    try {
      const allDocuments = await getAllDocuments();
      allDocuments.reverse();
      res.json({ success: true, documents: allDocuments });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch documents" });
    }
  },
);

/** Socket.IO Server Setup */
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
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
  const userId = socket.handshake.auth.userId as string;
  const username = socket.handshake.auth.username as string;

  if (!userId) {
    console.error("Connection rejected: no userId provided");
    socket.disconnect();
    return;
  }

  const displayUsername = username || "Guest";

  console.log(
    `User connected: ${displayUsername} (current # of channels: ${currentClients})`,
  );

  socket.on("get-document", async ({ documentId, documentName }) => {
    // Join both Socket.io room AND create dedicated Redis channel
    socket.join(documentId);
    console.log(
      `User ${displayUsername} subscribed to document ${documentName} (document id: ${documentId})`,
    );

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
        console.log(
          `User ${displayUsername} unsubscribing from document ${room}`,
        );
        // Notify room that user left
        socket.to(room).emit("user-left", {
          userId,
          username: displayUsername,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const currentClients = io.sockets.sockets.size;
    console.log(
      `User ${displayUsername} disconnected (current # of channels: ${currentClients})`,
    );
  });
});

// Start HTTP server (handles both Express and Socket.IO)
httpServer.listen(PORT, () => {
  console.log(`HTTP + Socket.IO server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing server gracefully");

  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
