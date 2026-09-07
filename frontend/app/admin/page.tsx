"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
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

type ApiError = {
  detail?: unknown;
};

function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

async function apiJson(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(
    path,
    init,
  );

  const text =
    await response
      .text()
      .catch(() => "");

  if (!response.ok) {
    let message = text;

    try {
      const parsed =
        JSON.parse(text) as ApiError;

      if (
        typeof parsed.detail ===
        "string"
      ) {
        message =
          parsed.detail;
      }
    } catch {
      // Use the original response text.
    }

    throw new Error(
      message ||
        `${response.status} ${response.statusText}`,
    );
  }

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

function isPasswordValid(
  password: string,
): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(
    password,
  );
}

const PASSWORD_HELP =
  "At least 8 characters with uppercase, lowercase, and a number.";

export default function AdminPanel() {
  const {
    user,
    refreshUser,
    loading,
  } = useAuth();

  const router =
    useRouter();

  const [
    isReady,
    setIsReady,
  ] = useState(false);

  const [
    users,
    setUsers,
  ] = useState<UserRow[]>(
    [],
  );

  const [
    loadingUsers,
    setLoadingUsers,
  ] = useState(true);

  const [
    usersError,
    setUsersError,
  ] = useState<
    string | null
  >(null);

  const [
    newUsername,
    setNewUsername,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    newName,
    setNewName,
  ] = useState("");

  const [
    newSurname,
    setNewSurname,
  ] = useState("");

  const [
    newEmail,
    setNewEmail,
  ] = useState("");

  const [
    newRole,
    setNewRole,
  ] = useState("user");

  const [
    createError,
    setCreateError,
  ] = useState("");

  const [
    createSuccess,
    setCreateSuccess,
  ] = useState("");

  const [
    usernameExists,
    setUsernameExists,
  ] = useState(false);

  const [
    creatingUser,
    setCreatingUser,
  ] = useState(false);

  const [
    editingUserId,
    setEditingUserId,
  ] = useState<
    number | null
  >(null);

  const [
    editName,
    setEditName,
  ] = useState("");

  const [
    editSurname,
    setEditSurname,
  ] = useState("");

  const [
    editEmail,
    setEditEmail,
  ] = useState("");

  const [
    resetUserId,
    setResetUserId,
  ] = useState<
    number | null
  >(null);

  const [
    newResetPassword,
    setNewResetPassword,
  ] = useState("");

  const [
    studiesUserId,
    setStudiesUserId,
  ] = useState<
    number | null
  >(null);

  const [
    studiesText,
    setStudiesText,
  ] = useState("");

  const [
    studiesSaving,
    setStudiesSaving,
  ] = useState(false);

  const [
    studiesError,
    setStudiesError,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    const token =
      getToken();

    if (!token) {
      router.push("/");
      return;
    }

    void refreshUser();
  }, [
    router,
    refreshUser,
  ]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (
      !user ||
      user.role !== "admin"
    ) {
      router.push("/");
      return;
    }

    setIsReady(true);
  }, [
    user,
    loading,
    router,
  ]);

  const fetchUsers =
    useCallback(
      async () => {
        setLoadingUsers(true);
        setUsersError(null);

        const token =
          getToken();

        if (!token) {
          setUsersError(
            "Authentication token not available.",
          );
          setLoadingUsers(
            false,
          );
          return;
        }

        try {
          const data =
            await apiJson(
              "/api/auth/users",
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
              },
            );

          setUsers(
            Array.isArray(data)
              ? (data as UserRow[])
              : [],
          );
        } catch (
          error: unknown
        ) {
          console.error(
            "Error fetching users:",
            error,
          );

          setUsersError(
            error instanceof
              Error
              ? error.message
              : "Failed to load users.",
          );
        } finally {
          setLoadingUsers(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    if (isReady) {
      void fetchUsers();
    }
  }, [
    isReady,
    fetchUsers,
  ]);

  const checkUsername =
    async () => {
      const username =
        newUsername.trim();

      if (!username) {
        setUsernameExists(
          false,
        );
        return;
      }

      try {
        const response =
          await fetch(
            `/api/auth/check-username?username=${encodeURIComponent(
              username,
            )}`,
          );

        if (!response.ok) {
          setUsernameExists(
            false,
          );
          return;
        }

        const data =
          await response.json();

        setUsernameExists(
          Boolean(
            data?.exists,
          ),
        );
      } catch (
        error
      ) {
        console.error(
          "Error checking username",
          error,
        );

        setUsernameExists(
          false,
        );
      }
    };

  const handleCreateUser =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      setCreateError("");
      setCreateSuccess("");

      if (
        !isPasswordValid(
          newPassword,
        )
      ) {
        setCreateError(
          `Password must meet the following requirements: ${PASSWORD_HELP}`,
        );
        return;
      }

      if (
        usernameExists
      ) {
        setCreateError(
          "Username already exists. Please choose another.",
        );
        return;
      }

      const token =
        getToken();

      if (!token) {
        setCreateError(
          "Not authenticated.",
        );
        return;
      }

      setCreatingUser(true);

      try {
        const response =
          await fetch(
            "/api/auth/create-user",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${token}`,
              },
              body: JSON.stringify(
                {
                  username:
                    newUsername.trim(),
                  password:
                    newPassword,
                  name:
                    newName.trim(),
                  surname:
                    newSurname.trim(),
                  email:
                    newEmail.trim(),
                  role:
                    newRole,
                },
              ),
            },
          );

        if (!response.ok) {
          const text =
            await response
              .text()
              .catch(
                () => "",
              );

          throw new Error(
            text ||
              "Failed to create user.",
          );
        }

        setCreateSuccess(
          `User ${newUsername.trim()} was created successfully.`,
        );

        setNewUsername("");
        setNewPassword("");
        setNewName("");
        setNewSurname("");
        setNewEmail("");
        setNewRole("user");
        setUsernameExists(
          false,
        );

        await fetchUsers();
      } catch (
        error: unknown
      ) {
        setCreateError(
          error instanceof
            Error
            ? error.message
            : "Failed to create user.",
        );
      } finally {
        setCreatingUser(
          false,
        );
      }
    };

  const handleDeleteUser =
    async (
      targetUser: UserRow,
    ) => {
      const token =
        getToken();

      if (!token) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete ${targetUser.name} ${targetUser.surname} (${targetUser.username})?`,
        );

      if (!confirmed) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/auth/users/${targetUser.id}`,
            {
              method:
                "DELETE",
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          );

        if (!response.ok) {
          const text =
            await response
              .text()
              .catch(
                () => "",
              );

          window.alert(
            text ||
              "Failed to delete user.",
          );
          return;
        }

        await fetchUsers();
      } catch (
        error
      ) {
        console.error(
          "Error deleting user",
          error,
        );

        window.alert(
          "Error deleting user.",
        );
      }
    };

  const handleEditClick =
    (
      targetUser: UserRow,
    ) => {
      setEditingUserId(
        targetUser.id,
      );

      setEditName(
        targetUser.name,
      );

      setEditSurname(
        targetUser.surname,
      );

      setEditEmail(
        targetUser.email,
      );
    };

  const cancelEditing =
    () => {
      setEditingUserId(
        null,
      );

      setEditName("");
      setEditSurname("");
      setEditEmail("");
    };

  const handleUpdateUser =
    async () => {
      if (
        editingUserId ===
        null
      ) {
        return;
      }

      const token =
        getToken();

      if (!token) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/auth/users/${editingUserId}`,
            {
              method:
                "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${token}`,
              },
              body: JSON.stringify(
                {
                  name:
                    editName.trim(),
                  surname:
                    editSurname.trim(),
                  email:
                    editEmail.trim(),
                },
              ),
            },
          );

        if (!response.ok) {
          const text =
            await response
              .text()
              .catch(
                () => "",
              );

          window.alert(
            text ||
              "Failed to update user.",
          );
          return;
        }

        cancelEditing();
        await fetchUsers();
      } catch (
        error
      ) {
        console.error(
          "Error updating user",
          error,
        );

        window.alert(
          "Error updating user.",
        );
      }
    };

  const handleResetPassword =
    async () => {
      if (
        resetUserId ===
        null
      ) {
        return;
      }

      if (
        !newResetPassword
      ) {
        window.alert(
          "Please enter a new password.",
        );
        return;
      }

      if (
        !isPasswordValid(
          newResetPassword,
        )
      ) {
        window.alert(
          PASSWORD_HELP,
        );
        return;
      }

      const token =
        getToken();

      if (!token) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/auth/users/${resetUserId}/reset-password`,
            {
              method:
                "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${token}`,
              },
              body: JSON.stringify(
                {
                  new_password:
                    newResetPassword,
                },
              ),
            },
          );

        if (!response.ok) {
          const text =
            await response
              .text()
              .catch(
                () => "",
              );

          window.alert(
            text ||
              "Failed to reset password.",
          );
          return;
        }

        setResetUserId(
          null,
        );

        setNewResetPassword(
          "",
        );
      } catch (
        error
      ) {
        console.error(
          "Error resetting password",
          error,
        );

        window.alert(
          "Error resetting password.",
        );
      }
    };

  const openStudiesEditor =
    (
      targetUser: UserRow,
    ) => {
      setStudiesError(
        null,
      );

      setStudiesUserId(
        targetUser.id,
      );

      const existing =
        Array.isArray(
          targetUser.studies,
        )
          ? targetUser.studies
          : [];

      setStudiesText(
        existing.join(
          "\n",
        ),
      );
    };

  const closeStudiesEditor =
    () => {
      setStudiesUserId(
        null,
      );

      setStudiesText("");

      setStudiesError(
        null,
      );
    };

  const handleSaveStudies =
    async () => {
      if (
        studiesUserId ===
        null
      ) {
        return;
      }

      setStudiesSaving(true);
      setStudiesError(null);

      const token =
        getToken();

      if (!token) {
        setStudiesError(
          "Not authenticated.",
        );

        setStudiesSaving(
          false,
        );
        return;
      }

      const studies =
        studiesText
          .split("\n")
          .map(
            (study) =>
              study.trim(),
          )
          .filter(Boolean);

      try {
        await apiJson(
          `/api/auth/users/${studiesUserId}/studies`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${token}`,
            },
            body: JSON.stringify(
              {
                studies,
              },
            ),
          },
        );

        await fetchUsers();
        closeStudiesEditor();
      } catch (
        error: unknown
      ) {
        setStudiesError(
          error instanceof
            Error
            ? error.message
            : "Failed to update studies.",
        );
      } finally {
        setStudiesSaving(
          false,
        );
      }
    };

  if (!isReady) {
    return null;
  }

  const studiesUser =
    studiesUserId ===
    null
      ? null
      : users.find(
          (item) =>
            item.id ===
            studiesUserId,
        ) ?? null;

  return (
    <main
      className={
        styles.page
      }
    >
      <header
        className={
          styles.pageHeader
        }
      >
        <p
          className={
            styles.eyebrow
          }
        >
          Administration
        </p>

        <h1
          className={
            styles.title
          }
        >
          Admin panel
        </h1>

        <p
          className={
            styles.subtitle
          }
        >
          Create accounts,
          manage researcher
          details, and control
          study access.
        </p>
      </header>

      <section
        className={
          styles.section
        }
      >
        <div
          className={
            styles.sectionIntro
          }
        >
          <div>
            <h2
              className={
                styles.sectionTitle
              }
            >
              Create user
            </h2>

            <p
              className={
                styles.sectionDescription
              }
            >
              Add a researcher
              or administrator
              account.
            </p>
          </div>
        </div>

        <form
          className={
            styles.createForm
          }
          onSubmit={
            handleCreateUser
          }
        >
          <div
            className={
              styles.formGrid
            }
          >
            <div
              className={
                styles.formGroup
              }
            >
              <label
                htmlFor="username"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                value={
                  newUsername
                }
                onChange={(
                  event,
                ) =>
                  setNewUsername(
                    event.target
                      .value,
                  )
                }
                onBlur={() => {
                  void checkUsername();
                }}
                required
                className={`${styles.inputField} ${
                  usernameExists
                    ? styles.inputError
                    : ""
                }`}
              />

              {usernameExists && (
                <p
                  className={
                    styles.fieldMessage
                  }
                >
                  Username already
                  exists.
                </p>
              )}
            </div>

            <div
              className={
                styles.formGroup
              }
            >
              <label>
                Password
              </label>

              <PasswordInput
                value={
                  newPassword
                }
                onChange={(
                  event,
                ) =>
                  setNewPassword(
                    event.target
                      .value,
                  )
                }
                placeholder="Password"
                required
              />

              <p
                className={
                  styles.fieldHint
                }
              >
                {PASSWORD_HELP}
              </p>
            </div>

            <div
              className={
                styles.formGroup
              }
            >
              <label
                htmlFor="name"
              >
                First name
              </label>

              <input
                id="name"
                type="text"
                value={
                  newName
                }
                onChange={(
                  event,
                ) =>
                  setNewName(
                    event.target
                      .value,
                  )
                }
                required
                className={
                  styles.inputField
                }
              />
            </div>

            <div
              className={
                styles.formGroup
              }
            >
              <label
                htmlFor="surname"
              >
                Surname
              </label>

              <input
                id="surname"
                type="text"
                value={
                  newSurname
                }
                onChange={(
                  event,
                ) =>
                  setNewSurname(
                    event.target
                      .value,
                  )
                }
                required
                className={
                  styles.inputField
                }
              />
            </div>

            <div
              className={
                styles.formGroup
              }
            >
              <label
                htmlFor="email"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={
                  newEmail
                }
                onChange={(
                  event,
                ) =>
                  setNewEmail(
                    event.target
                      .value,
                  )
                }
                required
                placeholder="name@example.com"
                className={
                  styles.inputField
                }
              />
            </div>

            <div
              className={
                styles.formGroup
              }
            >
              <label
                htmlFor="role"
              >
                Role
              </label>

              <select
                id="role"
                value={
                  newRole
                }
                onChange={(
                  event,
                ) =>
                  setNewRole(
                    event.target
                      .value,
                  )
                }
                className={
                  styles.inputField
                }
              >
                <option value="user">
                  Researcher
                </option>

                <option value="admin">
                  Administrator
                </option>
              </select>
            </div>
          </div>

          {createError && (
            <div
              className={
                styles.errorMessage
              }
            >
              {createError}
            </div>
          )}

          {createSuccess && (
            <div
              className={
                styles.successMessage
              }
            >
              {createSuccess}
            </div>
          )}

          <div
            className={
              styles.formActions
            }
          >
            <button
              type="submit"
              className={
                styles.primaryButton
              }
              disabled={
                creatingUser
              }
            >
              {creatingUser
                ? "Creating…"
                : "Create user"}
            </button>
          </div>
        </form>
      </section>

      <section
        className={
          styles.section
        }
      >
        <div
          className={
            styles.sectionIntro
          }
        >
          <div>
            <h2
              className={
                styles.sectionTitle
              }
            >
              Users
            </h2>

            <p
              className={
                styles.sectionDescription
              }
            >
              Manage account
              information and
              study access.
            </p>
          </div>

          {!loadingUsers && (
            <span
              className={
                styles.count
              }
            >
              {users.length}{" "}
              {users.length ===
              1
                ? "user"
                : "users"}
            </span>
          )}
        </div>

        {studiesUser && (
          <div
            className={
              styles.studiesEditor
            }
          >
            <div
              className={
                styles.editorHeader
              }
            >
              <div>
                <h3
                  className={
                    styles.editorTitle
                  }
                >
                  Study access
                </h3>

                <p
                  className={
                    styles.editorDescription
                  }
                >
                  {studiesUser.name}{" "}
                  {studiesUser.surname}
                  <span>
                    {" "}
                    ·{" "}
                    {
                      studiesUser.username
                    }
                  </span>
                </p>
              </div>

              <button
                type="button"
                className={
                  styles.closeButton
                }
                onClick={
                  closeStudiesEditor
                }
                aria-label="Close study access editor"
              >
                ×
              </button>
            </div>

            <label
              className={
                styles.editorLabel
              }
              htmlFor="study-access"
            >
              Study IDs
            </label>

            <textarea
              id="study-access"
              className={`${styles.inputField} ${styles.studiesTextarea}`}
              value={
                studiesText
              }
              onChange={(
                event,
              ) =>
                setStudiesText(
                  event.target
                    .value,
                )
              }
              placeholder={
                "ambient_bd_ema_1\nanother_study_id"
              }
            />

            <p
              className={
                styles.fieldHint
              }
            >
              One study ID per
              line. These IDs are
              used for study-level
              authorization.
            </p>

            {studiesError && (
              <div
                className={
                  styles.errorMessage
                }
              >
                {studiesError}
              </div>
            )}

            <div
              className={
                styles.editorActions
              }
            >
              <button
                type="button"
                className={
                  styles.primaryButton
                }
                onClick={() => {
                  void handleSaveStudies();
                }}
                disabled={
                  studiesSaving
                }
              >
                {studiesSaving
                  ? "Saving…"
                  : "Save access"}
              </button>

              <button
                type="button"
                className={
                  styles.secondaryButton
                }
                onClick={
                  closeStudiesEditor
                }
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {usersError && (
          <div
            className={
              styles.errorMessage
            }
          >
            {usersError}
          </div>
        )}

        {loadingUsers ? (
          <div
            className={
              styles.emptyState
            }
          >
            Loading users…
          </div>
        ) : users.length ===
          0 ? (
          <div
            className={
              styles.emptyState
            }
          >
            No users found.
          </div>
        ) : (
          <div
            className={
              styles.tableWrapper
            }
          >
            <table
              className={
                styles.table
              }
            >
              <thead>
                <tr>
                  <th>User</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Studies</th>
                  <th
                    className={
                      styles.actionsHeading
                    }
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {users.map(
                  (
                    targetUser,
                  ) => {
                    const isEditing =
                      editingUserId ===
                      targetUser.id;

                    const isResetting =
                      resetUserId ===
                      targetUser.id;

                    return (
                      <tr
                        key={
                          targetUser.id
                        }
                      >
                        <td
                          className={
                            styles.userCell
                          }
                        >
                          {isEditing ? (
                            <div
                              className={
                                styles.inlineFields
                              }
                            >
                              <input
                                type="text"
                                aria-label="First name"
                                value={
                                  editName
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setEditName(
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                className={
                                  styles.compactInput
                                }
                              />

                              <input
                                type="text"
                                aria-label="Surname"
                                value={
                                  editSurname
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setEditSurname(
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                className={
                                  styles.compactInput
                                }
                              />
                            </div>
                          ) : (
                            <>
                              <div
                                className={
                                  styles.personName
                                }
                              >
                                {
                                  targetUser.name
                                }{" "}
                                {
                                  targetUser.surname
                                }
                              </div>

                              <div
                                className={
                                  styles.username
                                }
                              >
                                @
                                {
                                  targetUser.username
                                }
                              </div>
                            </>
                          )}
                        </td>

                        <td>
                          {isEditing ? (
                            <input
                              type="email"
                              aria-label="Email"
                              value={
                                editEmail
                              }
                              onChange={(
                                event,
                              ) =>
                                setEditEmail(
                                  event
                                    .target
                                    .value,
                                )
                              }
                              className={
                                styles.compactInput
                              }
                            />
                          ) : (
                            <span
                              className={
                                styles.email
                              }
                            >
                              {
                                targetUser.email
                              }
                            </span>
                          )}
                        </td>

                        <td>
                          <span
                            className={`${styles.roleBadge} ${
                              targetUser.role ===
                              "admin"
                                ? styles.adminBadge
                                : ""
                            }`}
                          >
                            {targetUser.role ===
                            "admin"
                              ? "Administrator"
                              : "Researcher"}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className={
                              styles.studyAccessButton
                            }
                            onClick={() =>
                              openStudiesEditor(
                                targetUser,
                              )
                            }
                          >
                            {Array.isArray(
                              targetUser.studies,
                            )
                              ? targetUser
                                  .studies
                                  .length
                              : 0}
                            <span>
                              {" "}
                              studies
                            </span>
                          </button>
                        </td>

                        <td
                          className={
                            styles.actionsCell
                          }
                        >
                          {isEditing ? (
                            <div
                              className={
                                styles.actions
                              }
                            >
                              <button
                                type="button"
                                className={
                                  styles.smallPrimaryButton
                                }
                                onClick={() => {
                                  void handleUpdateUser();
                                }}
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                className={
                                  styles.textButton
                                }
                                onClick={
                                  cancelEditing
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div
                              className={
                                styles.actions
                              }
                            >
                              <button
                                type="button"
                                className={
                                  styles.textButton
                                }
                                onClick={() =>
                                  handleEditClick(
                                    targetUser,
                                  )
                                }
                              >
                                Edit
                              </button>

                              {targetUser.username.toLowerCase() !==
                                "admin" && (
                                <button
                                  type="button"
                                  className={
                                    styles.textButton
                                  }
                                  onClick={() => {
                                    setResetUserId(
                                      targetUser.id,
                                    );

                                    setNewResetPassword(
                                      "",
                                    );
                                  }}
                                >
                                  Reset password
                                </button>
                              )}

                              <button
                                type="button"
                                className={
                                  styles.deleteButton
                                }
                                onClick={() => {
                                  void handleDeleteUser(
                                    targetUser,
                                  );
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}

                          {isResetting &&
                            !isEditing && (
                              <div
                                className={
                                  styles.passwordReset
                                }
                              >
                                <PasswordInput
                                  type="password"
                                  placeholder="New password"
                                  value={
                                    newResetPassword
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setNewResetPassword(
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                />

                                <div
                                  className={
                                    styles.passwordResetActions
                                  }
                                >
                                  <button
                                    type="button"
                                    className={
                                      styles.smallPrimaryButton
                                    }
                                    onClick={() => {
                                      void handleResetPassword();
                                    }}
                                  >
                                    Save
                                  </button>

                                  <button
                                    type="button"
                                    className={
                                      styles.textButton
                                    }
                                    onClick={() => {
                                      setResetUserId(
                                        null,
                                      );

                                      setNewResetPassword(
                                        "",
                                      );
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}