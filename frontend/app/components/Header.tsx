"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (!mounted) return null;

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
          MomenTUM Dashboard
        </Link>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {user ? (
          <>
            <span>Hi, {user.username}</span>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: "#EB5757",
                color: "#FFFFFF",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" style={{ color: "#FFFFFF" }}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}