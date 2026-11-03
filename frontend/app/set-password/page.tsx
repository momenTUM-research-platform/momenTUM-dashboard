"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import PasswordInput from "../components/PasswordInput/PasswordInput";
import styles from "./SetPassword.module.css";

export default function SetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") || "");

  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save password.");
      setPassword("");
      setConfirmation("");
      setToken("");
      window.history.replaceState(null, "", window.location.pathname);
      setSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.panel}>
      <h1>Set your password</h1>
      {success ? <p>Password saved. <Link href="/login">Sign in</Link> with your username and new password.</p> : (
        <form onSubmit={submit} className={styles.form}>
          <p>Use at least 8 characters, including uppercase, lowercase, and a number. Maximum 72 UTF-8 bytes.</p>
          <label htmlFor="new-password">New password</label>
          <PasswordInput id="new-password" name="password" autoComplete="new-password" required
            value={password} onChange={event => setPassword(event.target.value)} />
          <label htmlFor="confirm-password">Confirm password</label>
          <PasswordInput id="confirm-password" name="confirmation" autoComplete="new-password" required
            value={confirmation} onChange={event => setConfirmation(event.target.value)} />
          <button type="submit" disabled={busy || !token}>{busy ? "Saving…" : "Save password"}</button>
          {!token && <p>Open the link from your invitation email. Contact your administrator for a new link if needed.</p>}
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
