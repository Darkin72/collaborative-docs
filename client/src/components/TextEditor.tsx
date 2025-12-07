import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { TOOLBAR_OPTIONS, SAVE_INTERVAL_MS } from "../constants";
import socket from "../socket";
import { RoleManagement } from "./RoleManagement";
import { ExportButton } from "./ExportButton";

export const TextEditor = () => {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const [quill, setQuill] = useState<Quill>();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch (err) {
        console.error("Failed to parse user:", err);
      }
    }
  }, []);

  const handleDeleteDocument = async () => {
    if (!documentId || !currentUser) return;
    
    const confirmDelete = window.confirm("Are you sure you want to delete this document? This action cannot be undone.");
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/documents/${documentId}?userId=${currentUser.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (data.success) {
        alert("Document deleted successfully");
        navigate("/");
      } else {
        alert(data.error || "Failed to delete document");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete document");
    } finally {
      setIsDeleting(false);
    }
  };

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

      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          socket.auth = {
            userId: user.id,
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

  // Handle access denied
  useEffect(() => {
    const handleAccessDenied = (data: { error: string }) => {
      alert(data.error);
      navigate("/");
    };

    const handlePermissionError = (data: { error: string }) => {
      console.error("Permission error:", data.error);
      if (quill) {
        quill.disable();
      }
    };

    socket.on("access-denied", handleAccessDenied);
    socket.on("permission-error", handlePermissionError);

    return () => {
      socket.off("access-denied", handleAccessDenied);
      socket.off("permission-error", handlePermissionError);
    };
  }, [navigate, quill]);

  // Load document
  useEffect(() => {
    if (!quill || !documentId) return;

    const handleLoadDocument = (response: any) => {
      const document = response.data || response;
      const role = response.role;
      const editable = response.canEdit;

      setUserRole(role);
      setCanEdit(editable);

      quill.setContents(document);
      
      if (editable) {
        quill.enable();
      } else {
        quill.disable();
        // Show read-only message
        const toolbar = document.querySelector('.ql-toolbar');
        if (toolbar && role === 'viewer') {
          const notice = document.createElement('div');
          notice.style.cssText = 'background: #fef3c7; padding: 8px; text-align: center; font-size: 14px; color: #92400e;';
          notice.textContent = 'You have view-only access to this document';
          toolbar.parentElement?.insertBefore(notice, toolbar);
        }
      }
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
    if (!quill || !canEdit) return;

    const handler = (delta: any, _oldDelta: any, source: string) => {
      if (source !== "user") return;
      socket.emit("send-changes", delta);
    };

    quill.on("text-change", handler);

    return () => {
      quill.off("text-change", handler);
    };
  }, [quill, canEdit]);

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
    if (!quill || !canEdit) return;

    const interval = setInterval(() => {
      socket.emit("save-document", quill.getContents());
    }, SAVE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [quill, canEdit]);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-between items-center gap-2 p-2 px-4 bg-secondary/50 dark:bg-secondary border-b border-border">
        <button
          onClick={() => navigate('/')}
          className="bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors"
        >
          ← Back to Home
        </button>
        {userRole && (
          <div className={`
            px-4 py-2 text-sm font-medium rounded-md flex-1 text-center
            ${userRole === 'owner' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300' : ''}
            ${userRole === 'editor' ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' : ''}
            ${userRole === 'viewer' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300' : ''}
          `}>
            Your role: {userRole.toUpperCase()}
          </div>
        )}
        {currentUser && documentId && (
          <ExportButton documentId={documentId} userId={currentUser.id} />
        )}
        {currentUser && userRole === 'owner' && (
          <>
            <RoleManagement currentUser={currentUser} isOwner={true} />
            <button
              onClick={handleDeleteDocument}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting...' : 'Delete Document'}
            </button>
          </>
        )}
      </div>
      <div className="editorContainer" ref={wrapperRef}></div>
    </div>
  );
};
