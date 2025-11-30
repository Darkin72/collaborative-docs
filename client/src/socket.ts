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

const socket = io(import.meta.env.VITE_SERVER_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  transports: ["websocket"],
  upgrade: false,
  auth: {
    userId: getUserId(),
  },
});

export default socket;
