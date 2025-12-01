import { Server, Socket } from "socket.io";
import {
  findOrCreateDocument,
  updateDocument,
} from "../controllers/documentController";

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

      socket.on("save-document", async (data) => {
        await updateDocument(documentId, { data });
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
