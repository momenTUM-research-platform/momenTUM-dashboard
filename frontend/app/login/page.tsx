"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput/PasswordInput";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

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
      localStorage.setItem("token", data.access_token);

      await refreshUser();
      // Redirect will happen via useEffect when user is updated
    } catch {
      setError("An unexpected error occurred.");
    }
  };

  return (
    <div className="container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit} className="form-login">
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label>Password</label>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="button">Login</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}