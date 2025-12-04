import { Server, Socket } from "socket.io";
import {
  findOrCreateDocument,
  updateDocument,
} from "../controllers/documentController";

// Batching configuration
const BATCH_INTERVAL = 2000; // 2 seconds
const documentBatches = new Map<string, {
  data: any;
  timer: NodeJS.Timeout | null;
  lastUpdate: number;
}>();

export function setupDocumentSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
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
      socket.join(documentId);
      console.log(
        `User ${displayUsername} subscribed to document ${documentName} (document id: ${documentId})`,
      );

      const document = await findOrCreateDocument({ documentId, documentName });

      if (document) socket.emit("load-document", document.data);

      socket.removeAllListeners("send-changes");
      socket.removeAllListeners("save-document");

      socket.on("send-changes", (delta) => {
        socket.broadcast.to(documentId).emit("receive-changes", delta);
      });

      // Batching implementation for save-document
      socket.on("save-document", async (data) => {
        const now = Date.now();
        
        // Get or create batch for this document
        let batch = documentBatches.get(documentId);
        
        if (!batch) {
          batch = {
            data: null,
            timer: null,
            lastUpdate: now
          };
          documentBatches.set(documentId, batch);
        }

        // Update the data
        batch.data = data;
        batch.lastUpdate = now;

        // Clear existing timer if any
        if (batch.timer) {
          clearTimeout(batch.timer);
        }

        // Set new timer to batch writes
        batch.timer = setTimeout(async () => {
          const batchToSave = documentBatches.get(documentId);
          
          if (batchToSave && batchToSave.data) {
            try {
              await updateDocument(documentId, { data: batchToSave.data });
              console.log(`[BATCHING] Saved document ${documentId} (batched after ${BATCH_INTERVAL}ms)`);
            } catch (error) {
              console.error(`[BATCHING] Error saving document ${documentId}:`, error);
            }
          }
          
          // Clean up
          documentBatches.delete(documentId);
        }, BATCH_INTERVAL);
      });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          console.log(
            `User ${displayUsername} unsubscribing from document ${room}`,
          );
          socket.to(room).emit("user-left", {
            userId,
            username: displayUsername,
          });
          
          // Flush any pending batched writes for this document
          const batch = documentBatches.get(room);
          if (batch && batch.timer) {
            clearTimeout(batch.timer);
            
            // Immediately save if there's data
            if (batch.data) {
              updateDocument(room, { data: batch.data })
                .then(() => console.log(`[BATCHING] Flushed document ${room} on user disconnect`))
                .catch(err => console.error(`[BATCHING] Error flushing document ${room}:`, err));
            }
            
            documentBatches.delete(room);
          }
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
}
