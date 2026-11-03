"use client";

import { getAccessToken } from "@/app/lib/auth";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import styles from "./AccountPage.module.css";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return getAccessToken();
}

export default function AccountPage() {
  const router = useRouter();
  const { user, refreshUser, loading } = useAuth();

  useEffect(() => {
    const token = getToken();
    if (!token) router.push("/login");
    else refreshUser();
  }, [router, refreshUser]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Account</h1>

      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.label}>Username</div>
          <div className={styles.value}>{user.username}</div>
        </div>

        <div className={styles.row}>
          <div className={styles.label}>Role</div>
          <div className={styles.value}>{user.role}</div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.subheader}>Change password</h2>
        <p>Contact your administrator to change your password.</p>
      </div>
    </div>
  );
}