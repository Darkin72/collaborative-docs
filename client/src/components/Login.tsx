import { useState } from "react";

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        }
      );

      const data = await response.json();

      if (data.success) {
        // Store user info in localStorage
        localStorage.setItem("user", JSON.stringify(data.user));
        onLoginSuccess(data.user);
      } else {
        setError(data.error || "Invalid username or password");
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-background">
      <div className="bg-white dark:bg-card p-8 rounded-lg shadow-md w-96 dark:border dark:border-border">
        <h1 className="text-2xl font-bold mb-6 text-center text-blue-600 dark:text-blue-400">
          Collaborative Docs
        </h1>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 dark:text-foreground text-sm font-bold mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-input dark:bg-background dark:text-foreground rounded-lg focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              placeholder="Enter username"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 dark:text-foreground text-sm font-bold mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-input dark:bg-background dark:text-foreground rounded-lg focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              placeholder="Enter password"
              required
            />
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg text-sm text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-colors"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
        <div className="mt-6 p-4 bg-gray-50 dark:bg-muted rounded-lg text-sm text-gray-600 dark:text-muted-foreground">
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
