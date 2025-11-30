import { io } from "socket.io-client";

// Generate or retrieve persistent user ID
function getUserId(): string {
  let userId = localStorage.getItem("socket-user-id");
  if (!userId) {
    userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("socket-user-id", userId);
  }
  return userId;
}

// Get username from stored user data
function getUsername(): string {
  const userStr = localStorage.getItem("user");
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      return user.username || "Guest";
    } catch {
      return "Guest";
    }
  }
  return "Guest";
}

const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: false, // Changed to false - only connect after login
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  auth: {
    userId: getUserId(),
    username: getUsername(),
  },
});

export default socket;
