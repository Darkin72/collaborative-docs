import "./App.css";
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TextEditor } from "./components/TextEditor";
import { Login } from "./components/Login";
import { LandingPage } from "./components/LandingPage";
import { ThemeProvider } from "./context/ThemeContext";
import socket from "./socket";

interface User {
  id: string;
  username: string;
  displayName: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const storedUser = JSON.parse(userStr);
        setUser(storedUser);
        // Store the user ID for socket auth
        localStorage.setItem("socket-user-id", storedUser.id);
        // DON'T connect socket here - only connect when opening a document
      } catch {
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    
    // Use the actual user ID from the account
    localStorage.setItem("socket-user-id", loggedInUser.id);
    
    // Set socket auth but DON'T connect yet - will connect when user opens a document
    socket.auth = {
      userId: loggedInUser.id,
      username: loggedInUser.username,
    };
  };

  const handleLogout = async () => {
    // Call logout API
    try {
      await fetch(`${import.meta.env.VITE_SERVER_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout API error:", err);
    }

    setUser(null);
    localStorage.removeItem("user");
    localStorage.removeItem("socket-user-id");

    // Disconnect socket if connected
    if (socket.connected) {
      socket.disconnect();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <ThemeProvider defaultTheme="system">
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" />
              ) : (
                <Login onLoginSuccess={handleLoginSuccess} />
              )
            }
          />
          <Route
            path="/*"
            element={
              user ? (
                <LandingPage user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route path="/documents/:id" element={<TextEditor />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
