import { useState } from "react";
import socket from "../socket";

interface LoginProps {
  onLoginSuccess: (user: {
    id: string;
    username: string;
    displayName: string;
  }) => void;
}

export const Login = ({ onLoginSuccess }: LoginProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Ensure a persistent socket user id exists
  const ensureSocketUserId = (): string => {
    let id = localStorage.getItem("socket-user-id");
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("socket-user-id", id);
    }
    return id;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Ensure socket handshake contains the attempted username and a valid userId
    const userId = ensureSocketUserId();
    socket.auth = {
      userId,
      username, // set the username the user entered BEFORE connecting
    };

    // Connect socket (handshake now carries correct username + valid userId)
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("login", { username, password }, (response: any) => {
      setIsLoading(false);
      if (response.success) {
        // Store user info in localStorage
        localStorage.setItem("user", JSON.stringify(response.user));
        onLoginSuccess(response.user);
      } else {
        setError(response.error || "Invalid username or password");
        // Disconnect socket if login failed
        socket.disconnect();
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600">
          Collaborative Docs
        </h1>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter username"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter password"
              required
            />
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p className="font-semibold mb-2">Demo Accounts:</p>
          <p className="font-mono text-xs">admin / admin123</p>
          <p className="font-mono text-xs">john / john123</p>
          <p className="font-mono text-xs">jane / jane123</p>
          <p className="font-mono text-xs">alice / alice123</p>
          <p className="font-mono text-xs">bob / bob123</p>
        </div>
      </div>
    </div>
  );
};
