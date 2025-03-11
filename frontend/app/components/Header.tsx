"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Set mounted to true once the component has mounted (client-side only)
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    router.push("/login");
  };

  // Until mounted, render a static header that matches the server-rendered HTML.
  if (!mounted) {
    return (
      <header
        style={{
          backgroundColor: "#2F80ED",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#FFFFFF",
        }}
      >
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link
            href="/"
            style={{
              color: "#FFFFFF",
              textDecoration: "none",
              fontWeight: "bold",
              fontSize: "1.1rem",
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/other"
            style={{
              color: "#FFFFFF",
              textDecoration: "none",
              fontSize: "1rem",
            }}
          >
            Other Page
          </Link>
        </nav>
      </header>
    );
  }

  return (
    <header
      style={{
        backgroundColor: "#2F80ED", // modern blue
        padding: "1rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        color: "#FFFFFF",
      }}
    >
      <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <Link
          href="/"
          style={{
            color: "#FFFFFF",
            textDecoration: "none",
            fontWeight: "bold",
            fontSize: "1.1rem",
          }}
        >
          Dashboard
        </Link>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {user ? (
          <>
            <span style={{ fontSize: "1rem" }}>Hi, {user.username}</span>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: "#EB5757", // clear red
                color: "#FFFFFF",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: "1rem",
              color: "#FFFFFF",
              textDecoration: "none",
            }}
          >
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
