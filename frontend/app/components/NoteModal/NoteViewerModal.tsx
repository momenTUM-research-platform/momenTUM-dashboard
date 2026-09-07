"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import ReactDOM from "react-dom";

import type {
  CalendarNote,
} from "@/app/lib/calendarNotes";

import styles from "./NoteModal.module.css";

type Props = {
  isOpen: boolean;

  note:
    | CalendarNote
    | null;

  participantLabel?: string;

  saving?: boolean;

  deleting?: boolean;

  error?: string | null;

  onClose: () => void;

  onSave: (
    text: string,
  ) => void;

  onDelete: () => void;
};

function formatTimestamp(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleString();
}

export default function NoteViewerModal({
  isOpen,
  note,
  participantLabel,
  saving = false,
  deleting = false,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [
    editing,
    setEditing,
  ] =
    useState(false);

  const [
    text,
    setText,
  ] =
    useState("");

  useEffect(() => {
    if (!note) {
      return;
    }

    setText(
      note.text,
    );

    setEditing(
      false,
    );
  }, [
    note,
    isOpen,
  ]);

  if (
    !isOpen ||
    !note
  ) {
    return null;
  }

  const busy =
    saving ||
    deleting;

  const submit = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const cleanText =
      text.trim();

    if (!cleanText) {
      return;
    }

    onSave(
      cleanText,
    );
  };

  return ReactDOM.createPortal(
    <div
      className={
        styles.overlay
      }
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget &&
          !busy
        ) {
          onClose();
        }
      }}
    >
      <div
        className={
          styles.modal
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-note-title"
      >
        <button
          type="button"
          className={
            styles.closeButton
          }
          onClick={
            onClose
          }
          aria-label="Close"
          disabled={busy}
        >
          ×
        </button>

        <div
          className={
            styles.modalHeader
          }
        >
          <p
            className={
              styles.eyebrow
            }
          >
            Calendar annotation
          </p>

          <h3
            id="view-note-title"
            className={
              styles.title
            }
          >
            Note
          </h3>

          <p
            className={
              styles.subtitle
            }
          >
            {note.date}
          </p>
        </div>

        <dl
          className={
            styles.noteMetadata
          }
        >
          <div>
            <dt>
              Applies to
            </dt>

            <dd>
              {note.user_id
                ? participantLabel ??
                  note.user_id
                : "Whole study"}
            </dd>
          </div>

          <div>
            <dt>
              Created by
            </dt>

            <dd>
              {
                note.created_by
              }
            </dd>
          </div>

          <div>
            <dt>
              Created
            </dt>

            <dd>
              {formatTimestamp(
                note.created_at,
              )}
            </dd>
          </div>

          {note.updated_at !==
            note.created_at && (
            <div>
              <dt>
                Updated
              </dt>

              <dd>
                {formatTimestamp(
                  note.updated_at,
                )}
              </dd>
            </div>
          )}
        </dl>

        {editing ? (
          <form
            onSubmit={
              submit
            }
          >
            <div
              className={
                styles.field
              }
            >
              <label
                htmlFor="edit-note-text"
                className={
                  styles.label
                }
              >
                Note
              </label>

              <textarea
                id="edit-note-text"
                className={
                  styles.textarea
                }
                value={text}
                onChange={(
                  event,
                ) =>
                  setText(
                    event.target
                      .value,
                  )
                }
                maxLength={
                  5000
                }
                autoFocus
              />
            </div>

            {error && (
              <div
                className={
                  styles.error
                }
                role="alert"
              >
                {error}
              </div>
            )}

            <div
              className={
                styles.actions
              }
            >
              <button
                type="button"
                className={
                  styles.secondaryButton
                }
                onClick={() => {
                  setText(
                    note.text,
                  );

                  setEditing(
                    false,
                  );
                }}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={
                  styles.primaryButton
                }
                disabled={
                  busy ||
                  !text.trim()
                }
              >
                {saving
                  ? "Saving…"
                  : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div
              className={
                styles.noteText
              }
            >
              {note.text}
            </div>

            {error && (
              <div
                className={
                  styles.error
                }
                role="alert"
              >
                {error}
              </div>
            )}

            <p
              className={
                styles.permissionHint
              }
            >
              Notes can be changed
              by their author or
              an administrator.
            </p>

            <div
              className={
                styles.actionsBetween
              }
            >
              <button
                type="button"
                className={
                  styles.dangerButton
                }
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this note?",
                    )
                  ) {
                    onDelete();
                  }
                }}
                disabled={busy}
              >
                {deleting
                  ? "Deleting…"
                  : "Delete"}
              </button>

              <div
                className={
                  styles.actions
                }
              >
                <button
                  type="button"
                  className={
                    styles.secondaryButton
                  }
                  onClick={
                    onClose
                  }
                  disabled={busy}
                >
                  Close
                </button>

                <button
                  type="button"
                  className={
                    styles.primaryButton
                  }
                  onClick={() =>
                    setEditing(
                      true,
                    )
                  }
                  disabled={busy}
                >
                  Edit
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}