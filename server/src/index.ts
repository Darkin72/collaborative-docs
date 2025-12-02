import { Server } from "socket.io";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { connectToDatabase } from "./config/database";
import { initializeRedisAdapter } from "./config/redis";
import authRoutes from "./routes/auth.routes";
import documentsRoutes from "./routes/documents.routes";
import { setupDocumentSocket } from "./sockets/documentSocket";

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

const httpServer = createServer(app);

/** HTTP API Routes */
app.use("/api", authRoutes);
app.use("/api/documents", documentsRoutes);

/** Socket.IO Server Setup */
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.CLIENT_ORIGIN || "http://localhost:5173",
      "https://ldquan-backend.iselab.info",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

/** Initialize Redis adapter and Socket handlers */
initializeRedisAdapter(io).then(() => {
  console.log(`Socket.io server ready on port ${PORT}`);
});

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
