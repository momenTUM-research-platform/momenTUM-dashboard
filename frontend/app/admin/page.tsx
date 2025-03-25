"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import PasswordInput from "../components/PasswordInput/PasswordInput";

export default function AdminPanel() {
  const { user, refreshUser, loading } = useAuth();
  const router = useRouter();
  
  // State to indicate panel readiness
  const [isReady, setIsReady] = useState(false);
  
  // State for managing users list
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // State for create user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newSurname, setNewSurname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [usernameExists, setUsernameExists] = useState(false);
  
  // State for inline editing of existing users
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");
  
  // State for password reset
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");

  // Basic password validation: at least 8 characters, one uppercase, one lowercase, one number.
  const isPasswordValid = (pwd: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return regex.test(pwd);
  };

  // On mount: refresh user info; if no token, redirect.
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
    } else {
      refreshUser();
    }
  }, [router, refreshUser]);

  // Once auth loading is complete, check user role.
  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== "admin") {
        router.push("/");
      } else {
        setIsReady(true);
      }
    }
  }, [user, loading, router]);

  // Fetch the list of users.
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

  // Check if the new username already exists.
  const checkUsername = async () => {
    if (!newUsername) return;
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(newUsername)}`);
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

  // Create user handler.
  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");

    if (!isPasswordValid(newPassword)) {
      setCreateError("Password must be at least 8 characters long and include uppercase, lowercase, and a number.");
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

    const data = await res.json();
    setCreateSuccess(`User created successfully: ${data.message}`);
    setNewUsername("");
    setNewPassword("");
    setNewName("");
    setNewSurname("");
    setNewEmail("");
    setNewRole("user");
    setUsernameExists(false);
    fetchUsers();
  };

  // Delete user handler.
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

  // Start editing a user's details.
  const handleEditClick = (u: any) => {
    setEditingUserId(u.id);
    setEditName(u.name);
    setEditSurname(u.surname);
    setEditEmail(u.email);
  };

  // Update user details handler.
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

  // Reset password handler with validation.
  const handleResetPassword = async () => {
    if (!newResetPassword) {
      alert("Please enter a new password.");
      return;
    }
    if (!isPasswordValid(newResetPassword)) {
      alert("New password must be at least 8 characters long and include uppercase, lowercase, and a number.");
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
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Admin Panel</h1>

      {/* Create User Section */}
      <section>
        <h2>Create New User</h2>
        {createError && <p style={{ color: "red" }}>{createError}</p>}
        {createSuccess && <p style={{ color: "green" }}>{createSuccess}</p>}
        <form onSubmit={handleCreateUser}>
          <div style={{ marginBottom: "1rem" }}>
            <label>Username:</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onBlur={checkUsername}
              required
              style={{
                width: "100%",
                padding: "0.5rem",
                border: usernameExists ? "1px solid red" : "1px solid #ccc",
                borderRadius: "4px",
              }}
            />
            {usernameExists && <p style={{ color: "red" }}>Username already exists.</p>}
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Password:</label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, uppercase, lowercase, number"
              required
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Name:</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Surname:</label>
            <input
              type="text"
              value={newSurname}
              onChange={(e) => setNewSurname(e.target.value)}
              required
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Email:</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="example@example.com"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label>Role:</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid #ccc", borderRadius: "4px" }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            className="button"
            type="submit"
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#2F80ED",
              border: "none",
              color: "white",
              fontSize: "1rem",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Create User
          </button>
        </form>
      </section>

      <hr style={{ margin: "2rem 0" }} />

      {/* Manage Users Section */}
      <section>
        <h2>Manage Users</h2>
        {loadingUsers ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>ID</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Username</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Name</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Surname</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Email</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Role</th>
                <th style={{ border: "1px solid #ccc", padding: "0.5rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{u.id}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{u.username}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    {editingUserId === u.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      u.name
                    )}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    {editingUserId === u.id ? (
                      <input
                        type="text"
                        value={editSurname}
                        onChange={(e) => setEditSurname(e.target.value)}
                      />
                    ) : (
                      u.surname
                    )}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    {editingUserId === u.id ? (
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    ) : (
                      u.email
                    )}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{u.role}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    {editingUserId === u.id ? (
                      <>
                        <button className="button" onClick={handleUpdateUser} style={{ marginRight: "0.5rem" }}>
                          Save
                        </button>
                        <button className="button" onClick={() => setEditingUserId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="button" onClick={() => handleEditClick(u)} style={{ marginRight: "0.5rem" }}>
                          Edit
                        </button>
                        <button
                          className="button"
                          onClick={() => handleDeleteUser(u.id)}
                          style={{
                            backgroundColor: "#e74c3c",
                            border: "none",
                            color: "white",
                            padding: "0.5rem",
                            borderRadius: "4px",
                            cursor: "pointer",
                            marginRight: "0.5rem",
                          }}
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
                                <button className="button" onClick={handleResetPassword} style={{ marginRight: "0.5rem" }}>
                                  Save Password
                                </button>
                                <button className="button" onClick={() => setResetUserId(null)}>Cancel</button>
                              </>
                            ) : (
                              <button className="button" onClick={() => setResetUserId(u.id)} style={{ marginRight: "0.5rem" }}>
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
        )}
      </section>
  
      <hr style={{ margin: "2rem 0" }} />
  
      <section style={{ textAlign: "center", marginTop: "2rem" }}>
        <h2>Navigation</h2>
        <p>
          <a href="/" style={{ textDecoration: "none", color: "#2F80ED", margin: "0 0.5rem" }}>
            Dashboard
          </a>
          |
          <a href="/select-studies" style={{ textDecoration: "none", color: "#2F80ED", margin: "0 0.5rem" }}>
            Select Studies
          </a>
        </p>
      </section>
    </div>
  );
}
