import { Server, Socket } from "socket.io";
import {
  findOrCreateDocument,
  updateDocument,
  VersionConflictError,
} from "../controllers/documentController";
import { checkDocumentPermission } from "../middleware/permissions";
import { createEventRateLimiter } from "../middleware/socketRateLimiter";
import { extendDocumentCacheTTL, updateDocumentDataInCache } from "../config/documentCache";
import { otManager } from "../utils/otDocumentManager";

// Batching configuration
const BATCH_INTERVAL = 2000; // 2 seconds
const ENABLE_BATCHING = true;

const documentBatches = new Map<string, {
  data: any;
  timer: NodeJS.Timeout | null;
  lastUpdate: number;
  expectedVersion?: number;  // Track version for OCC
}>();

// Metrics tracking
let totalSaveRequests = 0;
let totalDbWrites = 0;

export function setupDocumentSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    const currentClients = io.sockets.sockets.size;
    
    // Allow test connections without auth (for load testing)
    const userId = socket.handshake.auth.userId as string || `test-user-${Date.now()}-${Math.random()}`;
    const username = socket.handshake.auth.username as string || "TestUser";

    // Create rate limiter for this socket's events
    const rateLimitEvent = createEventRateLimiter(socket);

    console.log(`[SOCKET] Connection attempt - userId: ${userId}, username: ${username}, type: ${typeof userId}`);

    // Commented out for load testing - REMEMBER TO UNCOMMENT AFTER TESTING
    // if (!userId) {
    //   console.error("Connection rejected: no userId provided");
    //   socket.disconnect();
    //   return;
    // }

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

        // Initialize OT manager for this document
        otManager.initDocument(documentId, document.data, document.version);

        socket.emit("load-document", {
          data: document.data,
          role: document.userRole,
          canEdit: document.canEdit,
          version: document.version  // Include version for OCC and OT
        });

        socket.removeAllListeners("send-changes");
        socket.removeAllListeners("send-changes-ot");
        socket.removeAllListeners("save-document");

        // Original send-changes (without OT)
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

        // NEW: Operational Transformation enabled send-changes
        socket.on("send-changes-ot", rateLimitEvent("send-changes-ot", (payload: { delta: any; version: number }) => {
          // Only users with edit permission can send changes
          if (!document.canEdit) {
            socket.emit("permission-error", {
              error: "You do not have permission to edit this document"
            });
            return;
          }

          const { delta, version: clientVersion } = payload;
          
          // Process operation through OT
          const result = otManager.processOperation(
            documentId,
            userId,
            delta,
            clientVersion
          );

          if (!result.success) {
            // Send error back to client
            socket.emit("ot-error", {
              error: result.error,
              currentVersion: otManager.getVersion(documentId)
            });
            return;
          }

          // If operation was transformed, send acknowledgment with new delta
          if (result.transformedDelta !== delta) {
            socket.emit("ot-transform", {
              originalDelta: delta,
              transformedDelta: result.transformedDelta,
              version: result.newVersion
            });
          } else {
            // No transformation needed, just acknowledge
            socket.emit("ot-ack", {
              version: result.newVersion
            });
          }

          // Broadcast transformed operation to all other clients
          socket.broadcast.to(documentId).emit("receive-changes-ot", {
            delta: result.transformedDelta,
            version: result.newVersion,
            clientId: userId
          });
        }));

        // Batching implementation for save-document with Optimistic Concurrency Control
        socket.on("save-document", rateLimitEvent("save-document", async (payload: { data: any; version?: number }) => {
          // Support both old format (just data) and new format ({ data, version })
          const data = payload.data !== undefined ? payload.data : payload;
          const expectedVersion = payload.version;
          
          // Track total save requests
          totalSaveRequests++;
          
          // Only users with edit permission can save
          if (!document.canEdit) {
            socket.emit("permission-error", {
              error: "You do not have permission to edit this document"
            });
            return;
          }

          // If batching is disabled, save immediately
          if (!ENABLE_BATCHING) {
            try {
              const result = await updateDocument(
                documentId, 
                { data }, 
                userId,
                expectedVersion
              );
              
              totalDbWrites++;
              const batchingRatio = ((1 - totalDbWrites/totalSaveRequests) * 100).toFixed(1);
              console.log(`[NO-BATCH] Saved document ${documentId} immediately (requests: ${totalSaveRequests}, writes: ${totalDbWrites}, reduction: ${batchingRatio}%)`);
              
              socket.emit("save-success", {
                version: result?.version,
                timestamp: Date.now()
              });
              
              socket.broadcast.to(documentId).emit("version-update", {
                version: result?.version,
                timestamp: Date.now()
              });
            } catch (error: any) {
              console.error(`[NO-BATCH] Error saving document ${documentId}:`, error);
              
              if (error instanceof VersionConflictError) {
                socket.emit("version-conflict", {
                  error: error.message,
                  currentVersion: error.currentVersion,
                  currentData: error.currentData,
                  timestamp: Date.now()
                });
              } else {
                socket.emit("save-error", {
                  error: error.message || "Failed to save document"
                });
              }
            }
            return;
          }

          const now = Date.now();
          
          // Get or create batch for this document
          let batch = documentBatches.get(documentId);
          
          if (!batch) {
            batch = {
              data: null,
              timer: null,
              lastUpdate: now,
              expectedVersion: expectedVersion
            };
            documentBatches.set(documentId, batch);
          }

          // Update the data and version
          batch.data = data;
          batch.lastUpdate = now;
          // Only update expectedVersion if provided (for OCC)
          if (expectedVersion !== undefined) {
            batch.expectedVersion = expectedVersion;
          }

          // Clear existing timer if any
          if (batch.timer) {
            clearTimeout(batch.timer);
          }

          // Set new timer to batch writes
          batch.timer = setTimeout(async () => {
            const batchToSave = documentBatches.get(documentId);
            
            if (batchToSave && batchToSave.data) {
              try {
                const result = await updateDocument(
                  documentId, 
                  { data: batchToSave.data }, 
                  userId,
                  batchToSave.expectedVersion
                );
                
                totalDbWrites++;
                const batchingRatio = ((1 - totalDbWrites/totalSaveRequests) * 100).toFixed(1);
                console.log(`[BATCHING] Saved document ${documentId} (batched after ${BATCH_INTERVAL}ms, version: ${result?.version}) | Requests: ${totalSaveRequests}, Writes: ${totalDbWrites}, Reduction: ${batchingRatio}%`);
                
                // Notify client of successful save with new version
                socket.emit("save-success", {
                  version: result?.version,
                  timestamp: Date.now()
                });
                
                // Broadcast version update to other clients editing the same document
                socket.broadcast.to(documentId).emit("version-update", {
                  version: result?.version,
                  timestamp: Date.now()
                });
                
              } catch (error: any) {
                console.error(`[BATCHING] Error saving document ${documentId}:`, error);
                
                if (error instanceof VersionConflictError) {
                  // Send version conflict error with current data for merge
                  socket.emit("version-conflict", {
                    error: error.message,
                    currentVersion: error.currentVersion,
                    currentData: error.currentData,
                    timestamp: Date.now()
                  });
                } else {
                  socket.emit("save-error", {
                    error: error.message || "Failed to save document"
                  });
                }
              }
            }
            
            // Clean up
            documentBatches.delete(documentId);
          }, BATCH_INTERVAL);
        }));

        // NEW: OT-aware periodic save
        socket.on("save-document-ot", rateLimitEvent("save-document-ot", async () => {
          if (!document.canEdit) {
            socket.emit("permission-error", {
              error: "You do not have permission to edit this document"
            });
            return;
          }

          // Get current state from OT manager
          const docState = otManager.getDocumentState(documentId);
          if (!docState) {
            socket.emit("save-error", {
              error: "Document not found in OT manager"
            });
            return;
          }

          try {
            // Save current OT state to database
            const result = await updateDocument(
              documentId,
              { data: { ops: [{ insert: docState.content }] } },  // Convert plain text to Delta
              userId,
              docState.version
            );

            console.log(`[OT] Saved document ${documentId} (version: ${result?.version})`);

            socket.emit("save-success", {
              version: result?.version,
              timestamp: Date.now()
            });

            socket.broadcast.to(documentId).emit("version-update", {
              version: result?.version,
              timestamp: Date.now()
            });

          } catch (error: any) {
            console.error(`[OT] Error saving document ${documentId}:`, error);
            
            if (error instanceof VersionConflictError) {
              socket.emit("version-conflict", {
                error: error.message,
                currentVersion: error.currentVersion,
                currentData: error.currentData,
                timestamp: Date.now()
              });
            } else {
              socket.emit("save-error", {
                error: error.message || "Failed to save document"
              });
            }
          }
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
          
          // Check if this is the last user in the room
          const socketsInRoom = io.sockets.adapter.rooms.get(room);
          const isLastUser = !socketsInRoom || socketsInRoom.size <= 1;
          
          // Flush any pending batched writes for this document
          const batch = documentBatches.get(room);
          if (batch && batch.timer) {
            clearTimeout(batch.timer);
            
            // Immediately save if there's data (without version check on disconnect to prevent data loss)
            if (batch.data) {
              updateDocument(room, { data: batch.data }, userId, undefined)
                .then((result) => {
                  totalDbWrites++;
                  const batchingRatio = ((1 - totalDbWrites/totalSaveRequests) * 100).toFixed(1);
                  console.log(`[BATCHING] Flushed document ${room} on user disconnect (version: ${result?.version}) | Requests: ${totalSaveRequests}, Writes: ${totalDbWrites}, Reduction: ${batchingRatio}%`);
                })
                .catch(err => console.error(`[BATCHING] Error flushing document ${room}:`, err));
            }
            
            documentBatches.delete(room);
          }

          // Clean up OT manager if last user
          if (isLastUser) {
            console.log(`[OT] Clearing document ${room} from OT manager (last user disconnecting)`);
            otManager.clearDocument(room);
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
