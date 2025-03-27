"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import styles from "./Header.module.css"; // CSS module

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
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.link}>
          MomenTUM Dashboard
        </Link>
        {user && user.role === "admin" && (
          <Link href="/admin" className={styles.adminLink}>
            Admin Panel
          </Link>
        )}
      </nav>
      <div className={styles.userControls}>
        {user ? (
          <>
            <span>Hi, {user.username}</span>
            <button className={styles.logoutButton} onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" className={styles.loginLink}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}