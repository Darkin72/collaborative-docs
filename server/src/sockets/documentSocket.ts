import { Server, Socket } from "socket.io";
import {
  findOrCreateDocument,
  updateDocument,
} from "../controllers/documentController";
import { checkDocumentPermission } from "../middleware/permissions";
import { createEventRateLimiter } from "../middleware/socketRateLimiter";
import { extendDocumentCacheTTL, updateDocumentDataInCache } from "../config/documentCache";

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

    // Create rate limiter for this socket's events
    const rateLimitEvent = createEventRateLimiter(socket);

    console.log(`[SOCKET] Connection attempt - userId: ${userId}, username: ${username}, type: ${typeof userId}`);

    if (!userId) {
      console.error("Connection rejected: no userId provided");
      socket.disconnect();
      return;
    }

    const displayUsername = username || "Guest";

    console.log(
      `User connected: ${displayUsername} (userId: ${userId}) (current # of channels: ${currentClients})`,
    );

    socket.on("get-document", rateLimitEvent("get-document", async ({ documentId, documentName }) => {
      console.log(`[SOCKET] get-document: userId=${userId}, documentId=${documentId}`);
      try {
        // Try to find or create the document first
        const document = await findOrCreateDocument({ 
          documentId, 
          documentName,
          userId 
        });

        if (!document) {
          socket.emit("access-denied", {
            error: "Failed to load document"
          });
          return;
        }

        socket.join(documentId);
        console.log(
          `User ${displayUsername} subscribed to document ${documentName} (document id: ${documentId}) with role: ${document.userRole}`,
        );

        // Extend cache TTL since document is being actively viewed
        extendDocumentCacheTTL(documentId);

        socket.emit("load-document", {
          data: document.data,
          role: document.userRole,
          canEdit: document.canEdit
        });

        socket.removeAllListeners("send-changes");
        socket.removeAllListeners("save-document");

        socket.on("send-changes", rateLimitEvent("send-changes", (delta) => {
          // Only users with edit permission can send changes
          if (document.canEdit) {
            socket.broadcast.to(documentId).emit("receive-changes", delta);
          } else {
            socket.emit("permission-error", {
              error: "You do not have permission to edit this document"
            });
          }
        }));

        // Batching implementation for save-document
        socket.on("save-document", rateLimitEvent("save-document", async (data) => {
          // Only users with edit permission can save
          if (!document.canEdit) {
            socket.emit("permission-error", {
              error: "You do not have permission to edit this document"
            });
            return;
          }

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
                await updateDocument(documentId, { data: batchToSave.data }, userId);
                console.log(`[BATCHING] Saved document ${documentId} (batched after ${BATCH_INTERVAL}ms)`);
              } catch (error: any) {
                console.error(`[BATCHING] Error saving document ${documentId}:`, error);
                socket.emit("save-error", {
                  error: error.message || "Failed to save document"
                });
              }
            }
            
            // Clean up
            documentBatches.delete(documentId);
          }, BATCH_INTERVAL);
        }));
      } catch (error: any) {
        console.error(`Error loading document ${documentId}:`, error);
        socket.emit("access-denied", {
          error: error.message || "Failed to load document"
        });
      }
    }));

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
              updateDocument(room, { data: batch.data }, userId)
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
