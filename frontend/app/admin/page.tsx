"use client";

import { getAccessToken } from "@/app/lib/auth";
import { formatInvitationExpiry, invitationEmail } from "@/app/lib/invitation";

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
  is_active: boolean;
  password_set: boolean;
};

type SetupLink = {
  user: UserRow;
  url: string;
  expiresAt: string;
  purpose: "invite" | "reset";
};

type InvitationResult = {
  user: UserRow;
  setup_path: string;
  expires_at: string;
};

type ApiError = {
  detail?: unknown;
};

function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return getAccessToken();
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
    startPreview,
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

  const [newPassword, setNewPassword] = useState("");
  const [useSetupLink, setUseSetupLink] = useState(true);
  const [setupLink, setSetupLink] = useState<SetupLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");

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
    startPreview,
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

  const showSetupLink = (result: InvitationResult, purpose: "invite" | "reset") => {
    setSetupLink({ user: result.user, url: new URL(result.setup_path, window.location.origin).href,
      expiresAt: result.expires_at, purpose });
    setLinkMessage("");
  };

  const prepareLink = async (target: UserRow, replace = false) => {
    if (setupLink?.user.id === target.id && !replace && Date.parse(setupLink.expiresAt) > Date.now()) {
      document.getElementById("setup-link-panel")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!window.confirm(`Create a ${target.password_set ? "password reset" : "setup"} link for ${target.username}? Previous links for this account will stop working.`)) return;
    setLinkBusy(true);
    setUsersError("");
    try {
      const result = await apiJson(`/api/auth/users/${target.id}/${target.password_set ? "reset-invitation" : "invitation"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ delivery: "link" }),
      }) as InvitationResult;
      showSetupLink(result, target.password_set ? "reset" : "invite");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not create link.");
    } finally {
      setLinkBusy(false);
    }
  };

  const copySetupLink = async () => {
    if (!setupLink) return;
    if (Date.parse(setupLink.expiresAt) <= Date.now()) {
      setLinkMessage("This link has expired. Generate a replacement.");
      return;
    }
    try {
      await navigator.clipboard.writeText(setupLink.url);
      setLinkMessage("Link copied.");
    } catch {
      setLinkMessage("Select the link below and copy it manually.");
      const input = document.getElementById("setup-link") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }
  };

  const accountAction = async (target: UserRow) => {
    if (!window.confirm(`${target.is_active ? "Suspend" : "Reactivate"} ${target.username}?`)) return;
    setUsersError("");
    setCreateSuccess("");
    try {
      await apiJson(`/api/auth/users/${target.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ is_active: !target.is_active }),
      });
      if (setupLink?.user.id === target.id) setSetupLink(null);
      setCreateSuccess("Account status updated.");
      await fetchUsers();
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Account action failed.");
    }
  };

  const previewUser = async (target: UserRow) => {
    try {
      await startPreview(target.id);
      router.push("/");
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Could not start preview.");
    }
  };

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
            { headers: { Authorization: `Bearer ${getToken()}` } },
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
      setSetupLink(null);

      if (!useSetupLink && !isPasswordValid(newPassword)) {
        setCreateError(PASSWORD_HELP);
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
            useSetupLink ? "/api/auth/invite-user" : "/api/auth/create-user",
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
                  ...(useSetupLink ? { delivery: "link" } : { password: newPassword }),
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

          let message = "Failed to create user.";
          try {
            const data = JSON.parse(text);
            if (typeof data.detail === "string") message = data.detail;
          } catch {
            message = text || message;
          }
          throw new Error(message);
        }

        if (useSetupLink) {
          showSetupLink(await response.json() as InvitationResult, "invite");
        }
        setCreateSuccess(`User ${newUsername.trim()} created.`);

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
        await fetchUsers();
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

        setSetupLink(null);
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
        setSetupLink(null);
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
          <label className={styles.deliveryOption}>
            <input type="checkbox" checked={useSetupLink}
              onChange={event => setUseSetupLink(event.target.checked)} />
            Let the user set their password using a setup link
          </label>
          {!useSetupLink && (
            <div className={styles.formGroup}>
              <label htmlFor="initial-password">Initial password</label>
              <PasswordInput id="initial-password" autoComplete="new-password" required
                value={newPassword} onChange={event => setNewPassword(event.target.value)} />
              <p className={styles.fieldHint}>{PASSWORD_HELP}</p>
            </div>
          )}
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
                : useSetupLink ? "Create user and setup link" : "Create user"}
            </button>
          </div>
        </form>
      </section>

      {setupLink && (
        <section id="setup-link-panel" className={styles.linkPanel} aria-labelledby="setup-link-title">
          <h2 id="setup-link-title">{setupLink.purpose === "invite" ? "Account setup" : "Password reset"}: {setupLink.user.username}</h2>
          <p>Recipient: {setupLink.user.email}</p>
          <p>Single-use link. Expires {formatInvitationExpiry(setupLink.expiresAt)}.</p>
          <div className={styles.linkActions}>
            <button type="button" className={styles.primaryButton} onClick={() => void copySetupLink()}>Copy setup link</button>
            <a className={styles.secondaryButton} href={invitationEmail(setupLink)}
              onClick={event => {
                if (Date.parse(setupLink.expiresAt) <= Date.now()) {
                  event.preventDefault();
                  setLinkMessage("This link has expired. Generate a replacement.");
                }
              }}>Open invitation email</a>
          </div>
          <p>Your default email app opens a draft. Choose the sender account and click Send.</p>
          <label htmlFor="setup-link">Setup link</label>
          <input id="setup-link" className={styles.inputField} readOnly value={setupLink.url}
            autoComplete="off" spellCheck={false} onFocus={event => event.target.select()} />
          <p role="status">{linkMessage}</p>
          <div className={styles.linkActions}>
            <button type="button" className={styles.textButton} disabled={linkBusy}
              onClick={() => void prepareLink(setupLink.user, true)}>Generate replacement link</button>
            <button type="button" className={styles.textButton} onClick={() => setSetupLink(null)}>Dismiss</button>
          </div>
        </section>
      )}

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

                              <span className={styles.accountStatus}>
                                {!targetUser.is_active ? "Suspended" : targetUser.password_set ? "Active" : "Pending invitation"}
                              </span>
                              <button type="button" className={styles.textButton}
                                disabled={!targetUser.is_active || linkBusy}
                                onClick={() => void prepareLink(targetUser)}>
                                {targetUser.password_set ? "Prepare reset link" : "Prepare setup link"}
                              </button>
                              {targetUser.id !== user.id && targetUser.username.toLowerCase() !== "admin" && (
                                <button type="button" className={styles.textButton}
                                  onClick={() => void accountAction(targetUser)}>
                                  {targetUser.is_active ? "Suspend" : "Reactivate"}
                                </button>
                              )}
                              {targetUser.role !== "admin" && targetUser.is_active && targetUser.password_set && (
                                <button type="button" className={styles.textButton}
                                  onClick={() => void previewUser(targetUser)}>View as user</button>
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