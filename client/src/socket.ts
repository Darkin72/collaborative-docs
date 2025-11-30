import { io } from "socket.io-client";

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
