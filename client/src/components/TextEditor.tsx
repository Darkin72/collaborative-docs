import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { TOOLBAR_OPTIONS, SAVE_INTERVAL_MS } from "../constants";
import socket from "../socket";

export const TextEditor = () => {
  const { id: documentId } = useParams();
  const [quill, setQuill] = useState<Quill>();

  const wrapperRef = useCallback((wrapper: HTMLDivElement) => {
    if (!wrapper) return;
    wrapper.innerHTML = "";

    const editor = document.createElement("div");
    wrapper.append(editor);

    const qul = new Quill(editor, {
      theme: "snow",
      modules: {
        toolbar: TOOLBAR_OPTIONS,
      },
    });
    qul.disable();
    qul.setText("Loading...");
    setQuill(qul);
  }, []);

  // Connect socket on mount, disconnect on unmount
  useEffect(() => {
    if (!socket.connected) {
      const userStr = localStorage.getItem("user");
      const socketUserId = localStorage.getItem("socket-user-id");

      if (userStr && socketUserId) {
        try {
          const user = JSON.parse(userStr);
          socket.auth = {
            userId: socketUserId,
            username: user.username,
          };
          socket.connect();
        } catch (err) {
          console.error("Failed to set socket auth:", err);
        }
      }
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  // Load document
  useEffect(() => {
    if (!quill || !documentId) return;

    const handleLoadDocument = (document: any) => {
      quill.setContents(document);
      quill.enable();
    };

    const handleConnect = () => {
      const documentName = localStorage.getItem(
        `document-name-for-${documentId}`
      );
      socket.emit("get-document", {
        documentId,
        documentName: documentName ? documentName : "Untitled",
      });
    };

    socket.on("load-document", handleLoadDocument);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    return () => {
      socket.off("load-document", handleLoadDocument);
      socket.off("connect", handleConnect);
    };
  }, [quill, documentId]);

  // Sending changes to server
  useEffect(() => {
    if (!quill) return;

    const handler = (delta: any, oldDelta: any, source: string) => {
      if (source !== "user") return;
      socket.emit("send-changes", delta);
    };

    quill.on("text-change", handler);

    return () => {
      quill.off("text-change", handler);
    };
  }, [quill]);

  // Receiving changes from server
  useEffect(() => {
    if (!quill) return;

    const handler = (delta: any) => {
      quill.updateContents(delta);
    };

    socket.on("receive-changes", handler);

    return () => {
      socket.off("receive-changes", handler);
    };
  }, [quill]);

  // Auto-save document
  useEffect(() => {
    if (!quill) return;

    const interval = setInterval(() => {
      socket.emit("save-document", quill.getContents());
    }, SAVE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [quill]);

  return <div className="editorContainer" ref={wrapperRef}></div>;
};
