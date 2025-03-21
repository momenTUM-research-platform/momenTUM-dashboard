"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Login failed");
        return;
      }
      const data = await res.json();
      // Save the token to localStorage
      localStorage.setItem("token", data.access_token);
      // Refresh the AuthContext (if refreshUser returns a promise, await it)
      await refreshUser();
      // Redirect to the dashboard (or default page)
      router.push("/");
    } catch (err) {
      setError("An unexpected error occurred.");
    }
  };

  return (
    <div className="container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit} className="form-login">
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username" // Required for browser autofill
            type="text"
            value={username}
            autoComplete="username"
            placeholder="Enter username"
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            name="password" // Required for browser autofill
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            required
          />
        </div>
        <button type="submit">Login</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}