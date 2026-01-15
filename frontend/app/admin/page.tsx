"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput/PasswordInput";
import styles from "./AdminPanel.module.css";

type UserRow = {
  id: number;
  username: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  studies?: string[] | null;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function apiJson(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(path, init);
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return text ? JSON.parse(text) : null;
}

export default function AdminPanel() {
  const { user, refreshUser, loading } = useAuth();
  const router = useRouter();

  const [isReady, setIsReady] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [usernameExists, setUsernameExists] = useState(false);

  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");

  const [studiesUserId, setStudiesUserId] = useState<number | null>(null);
  const [studiesText, setStudiesText] = useState("");
  const [studiesSaving, setStudiesSaving] = useState(false);
  const [studiesError, setStudiesError] = useState<string | null>(null);

  const isPasswordValid = (pwd: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return regex.test(pwd);
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/");
    } else {
      refreshUser();
    }
  }, [router, refreshUser]);

  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== "admin") {
        router.push("/");
      } else {
        setIsReady(true);
      }
    }
  }, [user, loading, router]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    const token = getToken();
    try {
      const data = await apiJson("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isReady) fetchUsers();
  }, [isReady]);

  const checkUsername = async () => {
    if (!newUsername) return;
    try {
      const res = await fetch(
        `/api/auth/check-username?username=${encodeURIComponent(newUsername)}`
      );
      if (res.ok) {
        const data = await res.json();
        setUsernameExists(Boolean(data?.exists));
      } else {
        setUsernameExists(false);
      }
    } catch (err) {
      console.error("Error checking username", err);
      setUsernameExists(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");

    if (!isPasswordValid(newPassword)) {
      setCreateError(
        "Password must be at least 8 characters and include uppercase, lowercase, and a number."
      );
      return;
    }
    if (usernameExists) {
      setCreateError("Username already exists. Please choose another.");
      return;
    }

    const token = getToken();
    if (!token) {
      setCreateError("Not authenticated");
      return;
    }

    const res = await fetch("/api/auth/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
        name: newName,
        surname: newSurname,
        email: newEmail,
        role: newRole,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      setCreateError(errText || "Failed to create user");
      return;
    }

    const responseData = await res.json().catch(() => ({}));
    setCreateSuccess(`User created successfully: ${responseData.message || ""}`);
    setNewUsername("");
    setNewPassword("");
    setNewName("");
    setNewSurname("");
    setNewEmail("");
    setNewRole("user");
    setUsernameExists(false);
    fetchUsers();
  };

  const handleDeleteUser = async (userId: number) => {
    const token = getToken();
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        alert(errText || "Failed to delete user");
      } else {
        alert("User deleted successfully");
        fetchUsers();
      }
    } catch (err) {
      console.error("Error deleting user", err);
      alert("Error deleting user");
    }
  };

  const handleEditClick = (u: UserRow) => {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditSurname(u.surname);
    setEditEmail(u.email);
  };

  const handleUpdateUser = async () => {
    const token = getToken();
    try {
      const res = await fetch(`/api/auth/users/${editingUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          surname: editSurname,
          email: editEmail,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        alert(errText || "Failed to update user");
      } else {
        alert("User updated successfully");
        setEditingUserId(null);
        fetchUsers();
      }
    } catch (err) {
      console.error("Error updating user", err);
      alert("Error updating user");
    }
  };

  const handleResetPassword = async () => {
    if (!newResetPassword) {
      alert("Please enter a new password.");
      return;
    }
    if (!isPasswordValid(newResetPassword)) {
      alert(
        "New password must be at least 8 characters and include uppercase, lowercase, and a number."
      );
      return;
    }
    const token = getToken();
    try {
      const res = await fetch(`/api/auth/users/${resetUserId}/reset-password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_password: newResetPassword }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        alert(errText || "Failed to reset password");
      } else {
        alert("Password reset successfully");
        setResetUserId(null);
        setNewResetPassword("");
        fetchUsers();
      }
    } catch (err) {
      console.error("Error resetting password", err);
      alert("Error resetting password");
    }
  };

  const openStudiesEditor = (u: UserRow) => {
    setStudiesError(null);
    setStudiesUserId(u.id);
    const existing = Array.isArray(u.studies) ? u.studies : [];
    setStudiesText(existing.join("\n"));
  };

  const closeStudiesEditor = () => {
    setStudiesUserId(null);
    setStudiesText("");
    setStudiesError(null);
  };

  const handleSaveStudies = async () => {
    if (studiesUserId == null) return;
    setStudiesSaving(true);
    setStudiesError(null);

    const token = getToken();
    if (!token) {
      setStudiesError("Not authenticated");
      setStudiesSaving(false);
      return;
    }

    const studies = studiesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await apiJson(`/api/auth/users/${studiesUserId}/studies`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studies }),
      });

      await fetchUsers();
      closeStudiesEditor();
      alert("Studies updated");
    } catch (e: any) {
      setStudiesError(e?.message || "Failed to update studies");
    } finally {
      setStudiesSaving(false);
    }
  };

  if (!isReady) return null;

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Admin Panel</h1>

      <section className={styles.section}>
        <h2>Create New User</h2>
        {createError && <p className={styles.errorMessage}>{createError}</p>}
        {createSuccess && <p className={styles.successMessage}>{createSuccess}</p>}
        <form onSubmit={handleCreateUser}>
          <div className={styles.formGroup}>
            <label>Username:</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onBlur={checkUsername}
              required
              className={styles.inputField}
              style={{ borderColor: usernameExists ? "#e53e3e" : undefined }}
            />
            {usernameExists && (
              <p className={styles.errorMessage}>Username already exists.</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Password:</label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase, lowercase, number"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label>Name:</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Surname:</label>
            <input
              type="text"
              value={newSurname}
              onChange={(e) => setNewSurname(e.target.value)}
              required
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Email:</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="example@example.com"
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Role:</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className={styles.inputField}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <button type="submit" className={styles.button}>
            Create User
          </button>
        </form>
      </section>

      <hr className={styles.hr} />

      <section className={styles.section}>
        <h2>Manage Users</h2>

        {studiesUserId != null && (
          <div className={styles.section} style={{ marginTop: "1rem" }}>
            <h3>Assign Studies (user ID {studiesUserId})</h3>
            <p className={styles.helpText}>
              One study ID per line. These are the IDs checked by study-level authorization.
            </p>

            {studiesError && <p className={styles.errorMessage}>{studiesError}</p>}

            <textarea
              className={styles.inputField}
              style={{ minHeight: 140, width: "100%" }}
              value={studiesText}
              onChange={(e) => setStudiesText(e.target.value)}
              placeholder={"ambient_bd_ema_1\nanother_study_id"}
            />

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                className={styles.actionButton}
                onClick={handleSaveStudies}
                disabled={studiesSaving}
              >
                Save Studies
              </button>
              <button className={styles.actionButton} onClick={closeStudiesEditor}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {loadingUsers ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Surname</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Studies</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>

                    <td>
                      {editingUserId === u.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className={styles.inputField}
                        />
                      ) : (
                        u.name
                      )}
                    </td>

                    <td>
                      {editingUserId === u.id ? (
                        <input
                          type="text"
                          value={editSurname}
                          onChange={(e) => setEditSurname(e.target.value)}
                          className={styles.inputField}
                        />
                      ) : (
                        u.surname
                      )}
                    </td>

                    <td>
                      {editingUserId === u.id ? (
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className={styles.inputField}
                        />
                      ) : (
                        u.email
                      )}
                    </td>

                    <td>{u.role}</td>

                    <td>
                      {Array.isArray(u.studies) && u.studies.length > 0
                        ? u.studies.length
                        : 0}
                    </td>

                    <td>
                      {editingUserId === u.id ? (
                        <>
                          <button className={styles.actionButton} onClick={handleUpdateUser}>
                            Save
                          </button>
                          <button
                            className={styles.actionButton}
                            onClick={() => setEditingUserId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className={styles.actionButton}
                            onClick={() => handleEditClick(u)}
                          >
                            Edit
                          </button>

                          <button
                            className={styles.actionButton}
                            onClick={() => openStudiesEditor(u)}
                          >
                            Studies
                          </button>

                          <button
                            className={styles.deleteButton}
                            onClick={() => handleDeleteUser(u.id)}
                          >
                            Delete
                          </button>

                          {u.username.toLowerCase() !== "admin" && (
                            <>
                              {resetUserId === u.id ? (
                                <>
                                  <PasswordInput
                                    type="password"
                                    placeholder="New password"
                                    value={newResetPassword}
                                    onChange={(e) => setNewResetPassword(e.target.value)}
                                  />
                                  <button
                                    className={styles.actionButton}
                                    onClick={handleResetPassword}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className={styles.actionButton}
                                    onClick={() => setResetUserId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  className={styles.actionButton}
                                  onClick={() => setResetUserId(u.id)}
                                >
                                  Reset Password
                                </button>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <hr className={styles.hr} />

      <section className={styles.navSection}>
        <h2>Navigation</h2>
        <div className={styles.navLinks}>
          <a href="/" className={styles.navLink}>
            Dashboard
          </a>
          <span>|</span>
          <a href="/retrieve-study" className={styles.navLink}>
            Retrieve Studies
          </a>
        </div>
      </section>
    </div>
  );
}