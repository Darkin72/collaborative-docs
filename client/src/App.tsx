import "./App.css";
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TextEditor } from "./components/TextEditor";
import { Login } from "./components/Login";
import { LandingPage } from "./components/LandingPage";
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
        // Connect socket for logged-in user
        socket.auth = {
          userId: localStorage.getItem("socket-user-id") || "",
          username: storedUser.username,
        };
        socket.connect();
      } catch {
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);

    // Listen for force logout from server (permanent disconnect)
    const handleForceLogout = () => {
      console.log("Session expired - logging out");
      handleLogout();
    };

    socket.on("force-logout", handleForceLogout);

    return () => {
      socket.off("force-logout", handleForceLogout);
    };
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    // Connect socket with new username
    socket.auth = {
      userId: localStorage.getItem("socket-user-id") || "",
      username: loggedInUser.username,
    };
    socket.connect();
  };

  const handleLogout = () => {
    // Emit logout event to server BEFORE disconnecting
    socket.emit("user-logout");
    
    setUser(null);
    localStorage.removeItem("user");
    // Generate new socket user ID on logout
    localStorage.removeItem("socket-user-id");
    
    // Small delay to ensure logout event is sent
    setTimeout(() => {
      socket.disconnect();
    }, 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
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
  );
}

export default App;
