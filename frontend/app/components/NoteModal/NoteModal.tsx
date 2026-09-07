"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import ReactDOM from "react-dom";

import styles from "./NoteModal.module.css";

export type NoteParticipant = {
  userId: string;
  label: string;
};

type Props = {
  isOpen: boolean;

  selectedDate: string;

  participants: NoteParticipant[];

  saving?: boolean;

  error?: string | null;

  onClose: () => void;

  onSave: (input: {
    userId:
      | string
      | null;

    text: string;
  }) => void;
};

export default function NoteModal({
  isOpen,
  selectedDate,
  participants,
  saving = false,
  error,
  onClose,
  onSave,
}: Props) {
  const [
    scope,
    setScope,
  ] =
    useState<
      "study" | "participant"
    >("study");

  const [
    selectedUserId,
    setSelectedUserId,
  ] =
    useState("");

  const [
    text,
    setText,
  ] =
    useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setScope("study");

    setSelectedUserId(
      participants[0]
        ?.userId ?? "",
    );

    setText("");
  }, [
    isOpen,
    selectedDate,
    participants,
  ]);

  if (!isOpen) {
    return null;
  }

  const submit = (
    event: FormEvent,
  ) => {
    event.preventDefault();

    const cleanText =
      text.trim();

    if (!cleanText) {
      return;
    }

    if (
      scope ===
        "participant" &&
      !selectedUserId
    ) {
      return;
    }

    onSave({
      userId:
        scope ===
        "participant"
          ? selectedUserId
          : null,

      text: cleanText,
    });
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
          event.currentTarget
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
        aria-labelledby="add-note-title"
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
          disabled={saving}
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
            id="add-note-title"
            className={
              styles.title
            }
          >
            Add note
          </h3>

          <p
            className={
              styles.subtitle
            }
          >
            {selectedDate}
          </p>
        </div>

        <form
          onSubmit={
            submit
          }
        >
          <fieldset
            className={
              styles.fieldset
            }
          >
            <legend
              className={
                styles.label
              }
            >
              Applies to
            </legend>

            <label
              className={
                styles.radioOption
              }
            >
              <input
                type="radio"
                name="note-scope"
                checked={
                  scope ===
                  "study"
                }
                onChange={() =>
                  setScope(
                    "study",
                  )
                }
              />

              <span>
                <strong>
                  Whole study
                </strong>

                <small>
                  General annotation
                  for this date
                </small>
              </span>
            </label>

            <label
              className={
                styles.radioOption
              }
            >
              <input
                type="radio"
                name="note-scope"
                checked={
                  scope ===
                  "participant"
                }
                onChange={() =>
                  setScope(
                    "participant",
                  )
                }
                disabled={
                  participants.length ===
                  0
                }
              />

              <span>
                <strong>
                  Participant
                </strong>

                <small>
                  Associate the note
                  with one participant
                </small>
              </span>
            </label>
          </fieldset>

          {scope ===
            "participant" && (
            <div
              className={
                styles.field
              }
            >
              <label
                htmlFor="note-participant"
                className={
                  styles.label
                }
              >
                Participant
              </label>

              <select
                id="note-participant"
                className={
                  styles.select
                }
                value={
                  selectedUserId
                }
                onChange={(
                  event,
                ) =>
                  setSelectedUserId(
                    event.target
                      .value,
                  )
                }
                required
              >
                {participants.map(
                  (
                    participant,
                  ) => (
                    <option
                      key={
                        participant.userId
                      }
                      value={
                        participant.userId
                      }
                    >
                      {
                        participant.label
                      }
                    </option>
                  ),
                )}
              </select>
            </div>
          )}

          <div
            className={
              styles.field
            }
          >
            <label
              htmlFor="note-text"
              className={
                styles.label
              }
            >
              Note
            </label>

            <textarea
              id="note-text"
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
              placeholder="Add context about this date…"
              maxLength={
                5000
              }
              autoFocus
            />

            <div
              className={
                styles.characterCount
              }
            >
              {text.length} /
              5000
            </div>
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
              onClick={
                onClose
              }
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={
                styles.primaryButton
              }
              disabled={
                saving ||
                !text.trim() ||
                (
                  scope ===
                    "participant" &&
                  !selectedUserId
                )
              }
            >
              {saving
                ? "Saving…"
                : "Save note"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}