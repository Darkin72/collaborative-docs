import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface User {
  id: string;
  username: string;
  displayName: string;
}

enum DocumentRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  GUEST = 'guest'
}

interface RoleManagementProps {
  currentUser: User;
  isOwner: boolean;
}

interface Permission {
  username: string;
  role: string;
}

export const RoleManagement = ({ currentUser, isOwner }: RoleManagementProps) => {
  const { id: documentId } = useParams();
  const [showModal, setShowModal] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedRole, setSelectedRole] = useState<DocumentRole>(DocumentRole.VIEWER);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  if (!isOwner) {
    return null;
  }

  const fetchPermissions = async () => {
    if (!documentId) return;
    
    setIsLoadingPermissions(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/documents/permissions-list/${documentId}`,
        {
          credentials: "include",
        }
      );
      const data = await response.json();
      if (data.success) {
        setPermissions(data.permissions);
      }
    } catch (error) {
      console.error("Failed to fetch permissions:", error);
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  useEffect(() => {
    if (showModal) {
      fetchPermissions();
    }
  }, [showModal, documentId]);

  const handleUpdateRole = async () => {
    if (!selectedUsername || !documentId) {
      setMessage("Please enter a username");
      return;
    }

    setIsUpdating(true);
    setMessage("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/documents/update-role?ownerId=${currentUser.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            documentId,
            username: selectedUsername,
            role: selectedRole,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setMessage(`Successfully updated role to ${selectedRole}`);
        setSelectedUsername("");
        await fetchPermissions(); // Refresh the list
        setTimeout(() => {
          setMessage("");
        }, 2000);
      } else {
        setMessage(data.error || "Failed to update role");
      }
    } catch (error) {
      setMessage("Failed to connect to server");
      console.error("Update role error:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ padding: "16px" }}>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: "#3b82f6",
          color: "white",
          padding: "8px 16px",
          borderRadius: "6px",
          border: "none",
          cursor: "pointer",
          fontWeight: "500",
        }}
      >
        Manage Access
      </button>

      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "white",
              padding: "24px",
              borderRadius: "8px",
              width: "90%",
              maxWidth: "500px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px", fontSize: "20px", fontWeight: "600" }}>
              Manage Document Access
            </h2>

            {/* Current Permissions List */}
            {permissions.length > 0 && (
              <div style={{
                marginBottom: "20px",
                padding: "12px",
                background: "#f9fafb",
                borderRadius: "6px",
                border: "1px solid #e5e7eb"
              }}>
                <div style={{ fontWeight: "600", fontSize: "14px", marginBottom: "8px", color: "#374151" }}>
                  Current Access:
                </div>
                {isLoadingPermissions ? (
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>Loading...</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {permissions.map((perm, index) => (
                      <div key={index} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "13px",
                        padding: "6px 8px",
                        background: "white",
                        borderRadius: "4px"
                      }}>
                        <span style={{ fontWeight: "500", color: "#111827" }}>{perm.username}</span>
                        <span style={{
                          color: perm.role === 'editor' ? '#059669' : '#d97706',
                          fontWeight: "500",
                          textTransform: "capitalize"
                        }}>
                          {perm.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                  fontSize: "14px",
                }}
              >
                Username
              </label>
              <input
                type="text"
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                placeholder="Enter username (e.g., john, jane, alice)"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                  fontSize: "14px",
                }}
              >
                Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as DocumentRole)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              >
                <option value={DocumentRole.VIEWER}>Viewer (can view only)</option>
                <option value={DocumentRole.EDITOR}>Editor (can view and edit)</option>
                <option value={DocumentRole.GUEST}>Guest (no access)</option>
              </select>
            </div>

            {message && (
              <div
                style={{
                  padding: "12px",
                  marginBottom: "16px",
                  borderRadius: "6px",
                  fontSize: "14px",
                  background: message.includes("Success") ? "#d1fae5" : "#fee2e2",
                  color: message.includes("Success") ? "#065f46" : "#991b1b",
                  border: message.includes("Success") ? "1px solid #059669" : "1px solid #ef4444",
                  fontWeight: message.includes("admin") ? "600" : "normal"
                }}
              >
                {message}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowModal(false);
                  setMessage("");
                  setSelectedUsername("");
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                disabled={isUpdating || !selectedUsername}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: isUpdating || !selectedUsername ? "#9ca3af" : "#3b82f6",
                  color: "white",
                  cursor: isUpdating || !selectedUsername ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                {isUpdating ? "Updating..." : "Update Role"}
              </button>
            </div>

            <div
              style={{
                marginTop: "20px",
                padding: "12px",
                background: "#f3f4f6",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#6b7280",
              }}
            >
              <p style={{ margin: "0 0 8px 0", fontWeight: "600" }}>Role Descriptions:</p>
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                <li><strong>Viewer:</strong> Can open and view the document (read-only)</li>
                <li><strong>Editor:</strong> Can view and edit the document</li>
                <li><strong>Guest:</strong> No access to the document</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
