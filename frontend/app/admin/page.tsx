"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput/PasswordInput";
import styles from "./AdminPanel.module.css";

export default function AdminPanel() {
  const { user, refreshUser, loading } = useAuth();
  const router = useRouter();

  // Panel readiness
  const [isReady, setIsReady] = useState(false);

  // Users list
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [usernameExists, setUsernameExists] = useState(false);

  // Editing existing users
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");

  // Reset password
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");

  // Basic password validation
  const isPasswordValid = (pwd: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return regex.test(pwd);
  };

  // On mount: check token, refresh user
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
    } else {
      refreshUser();
    }
  }, [router, refreshUser]);

  // After loading: verify user role
  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== "admin") {
        router.push("/");
      } else {
        setIsReady(true);
      }
    }
  }, [user, loading, router]);

  // Fetch users
  const fetchUsers = async () => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        console.error("Failed to fetch users");
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
    setLoadingUsers(false);
  };

  useEffect(() => {
    if (isReady) {
      fetchUsers();
    }
  }, [isReady]);

  // Check if username is taken
  const checkUsername = async () => {
    if (!newUsername) return;
    try {
      const res = await fetch(
        `/api/auth/check-username?username=${encodeURIComponent(newUsername)}`
      );
      if (res.ok) {
        const data = await res.json();
        setUsernameExists(data.exists);
      } else {
        setUsernameExists(false);
      }
    } catch (err) {
      console.error("Error checking username", err);
      setUsernameExists(false);
    }
  };

  // Create user
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

    const token = localStorage.getItem("token");
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
      const errText = await res.text();
      setCreateError(errText || "Failed to create user");
      return;
    }

    const responseData = await res.json();
    setCreateSuccess(`User created successfully: ${responseData.message}`);
    setNewUsername("");
    setNewPassword("");
    setNewName("");
    setNewSurname("");
    setNewEmail("");
    setNewRole("user");
    setUsernameExists(false);
    fetchUsers();
  };

  // Delete user
  const handleDeleteUser = async (userId: number) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errText = await res.text();
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

  // Start editing
  const handleEditClick = (u: any) => {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditSurname(u.surname);
    setEditEmail(u.email);
  };

  // Update user
  const handleUpdateUser = async () => {
    const token = localStorage.getItem("token");
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
        const errText = await res.text();
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

  // Reset password
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
    const token = localStorage.getItem("token");
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
        const errText = await res.text();
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

  if (!isReady) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Admin Panel</h1>

      {/* Create User Section */}
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

      {/* Manage Users Section */}
      <section className={styles.section}>
        <h2>Manage Users</h2>
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
                      {editingUserId === u.id ? (
                        <>
                          <button
                            className={styles.actionButton}
                            onClick={handleUpdateUser}
                          >
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
                                    onChange={(e) =>
                                      setNewResetPassword(e.target.value)
                                    }
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

      {/* Navigation */}
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