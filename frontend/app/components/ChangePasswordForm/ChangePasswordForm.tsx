"use client";

import { useState } from "react";
import PasswordInput from "@/app/components/PasswordInput/PasswordInput";
import styles from "./ChangePasswordForm.module.css";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function isPasswordValid(pwd: string) {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return regex.test(pwd);
}

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirm) {
      setError("Please fill all fields.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setError("Password must be at least 8 characters and include uppercase, lowercase, and a number.");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("Not authenticated.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        setError(text || `${res.status} ${res.statusText}`);
        return;
      }

      setSuccess("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.group}>
        <label className={styles.label}>Current password</label>
        <PasswordInput
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          required
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>New password</label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 8 chars, uppercase, lowercase, number"
          required
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Confirm new password</label>
        <PasswordInput
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          required
        />
      </div>

      <button className={styles.button} type="submit" disabled={saving}>
        {saving ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}