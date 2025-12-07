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
    <div className="p-4">
      <button
        onClick={() => setShowModal(true)}
        className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        Manage Access
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[1000]"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white dark:bg-card p-6 rounded-lg w-[90%] max-w-[500px] dark:border dark:border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mt-0 mb-5 text-xl font-semibold text-foreground">
              Manage Document Access
            </h2>

            {/* Current Permissions List */}
            {permissions.length > 0 && (
              <div className="mb-5 p-3 bg-gray-50 dark:bg-muted rounded-md border border-gray-200 dark:border-border">
                <div className="font-semibold text-sm mb-2 text-gray-700 dark:text-foreground">
                  Current Access:
                </div>
                {isLoadingPermissions ? (
                  <div className="text-xs text-gray-500 dark:text-muted-foreground">Loading...</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {permissions.map((perm, index) => (
                      <div key={index} className="flex justify-between text-sm p-1.5 px-2 bg-white dark:bg-secondary rounded">
                        <span className="font-medium text-gray-900 dark:text-foreground">{perm.username}</span>
                        <span className={`font-medium capitalize ${perm.role === 'editor' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {perm.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="block mb-2 font-medium text-sm text-foreground">
                Username
              </label>
              <input
                type="text"
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                placeholder="Enter username (e.g., john, jane, alice)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-input dark:bg-background dark:text-foreground rounded-md text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              />
            </div>

            <div className="mb-5">
              <label className="block mb-2 font-medium text-sm text-foreground">
                Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as DocumentRole)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-input dark:bg-background dark:text-foreground rounded-md text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              >
                <option value={DocumentRole.VIEWER}>Viewer (can view only)</option>
                <option value={DocumentRole.EDITOR}>Editor (can view and edit)</option>
                <option value={DocumentRole.GUEST}>Guest (no access)</option>
              </select>
            </div>

            {message && (
              <div
                className={`p-3 mb-4 rounded-md text-sm ${
                  message.includes("Success")
                    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-500 dark:border-green-700"
                    : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-500 dark:border-red-700"
                } ${message.includes("admin") ? "font-semibold" : ""}`}
              >
                {message}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowModal(false);
                  setMessage("");
                  setSelectedUsername("");
                }}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-border bg-white dark:bg-secondary text-foreground text-sm hover:bg-gray-50 dark:hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRole}
                disabled={isUpdating || !selectedUsername}
                className="px-4 py-2 rounded-md text-white font-medium text-sm transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {isUpdating ? "Updating..." : "Update Role"}
              </button>
            </div>

            <div className="mt-5 p-3 bg-gray-100 dark:bg-muted rounded-md text-xs text-gray-500 dark:text-muted-foreground">
              <p className="m-0 mb-2 font-semibold">Role Descriptions:</p>
              <ul className="m-0 pl-5">
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
