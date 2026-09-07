"use client";

import {
  useEffect,
  useState,
} from "react";

import StudyResultsViewV2 from "../components/StudyResultsViewV2/StudyResultsViewV2";

import styles from "./RetrieveStudyPage.module.css";

type StudySuggestion = {
  study_id: string;
  name: string;
};

export default function RetrieveStudyPage() {
  const [
    studyQuery,
    setStudyQuery,
  ] = useState("");

  const [
    selectedStudyId,
    setSelectedStudyId,
  ] = useState<
    string | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    suggestions,
    setSuggestions,
  ] = useState<
    StudySuggestion[]
  >([]);

  const [
    saveMessage,
    setSaveMessage,
  ] = useState("");

  const [
    token,
    setToken,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (
      typeof window !==
      "undefined"
    ) {
      setToken(
        localStorage.getItem(
          "token",
        ),
      );
    }
  }, []);

  useEffect(() => {
    const handler =
      window.setTimeout(
        () => {
          if (
            studyQuery.trim()
              .length <= 2
          ) {
            setSuggestions(
              [],
            );

            return;
          }

          fetch(
            `/api/studies_suggestions?query=${encodeURIComponent(
              studyQuery.trim(),
            )}`,
          )
            .then(
              (response) => {
                if (
                  !response.ok
                ) {
                  throw new Error(
                    "Failed to load study suggestions.",
                  );
                }

                return response.json();
              },
            )
            .then(
              (
                data:
                  StudySuggestion[],
              ) =>
                setSuggestions(
                  Array.isArray(
                    data,
                  )
                    ? data
                    : [],
                ),
            )
            .catch(() =>
              setSuggestions(
                [],
              ),
            );
        },
        300,
      );

    return () =>
      window.clearTimeout(
        handler,
      );
  }, [
    studyQuery,
  ]);

  const handleSearch =
    async (
      event:
        React.FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      const trimmed =
        studyQuery.trim();

      if (!trimmed) {
        setError(
          "Enter a study ID or select a study.",
        );

        return;
      }

      setError(null);
      setSaveMessage("");
      setLoading(true);

      try {
        setSelectedStudyId(
          trimmed,
        );

        setSuggestions(
          [],
        );
      } catch {
        setError(
          "Could not select study.",
        );
      } finally {
        setLoading(false);
      }
    };

  const handleSaveStudy =
    async () => {
      if (!token) {
        setSaveMessage(
          "No token available.",
        );

        return;
      }

      if (
        !selectedStudyId
      ) {
        setSaveMessage(
          "No study to save.",
        );

        return;
      }

      try {
        const response =
          await fetch(
            "/api/user/studies",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify(
                  {
                    study_ids: [
                      selectedStudyId,
                    ],
                  },
                ),
            },
          );

        if (
          !response.ok
        ) {
          const errorData =
            await response
              .json()
              .catch(
                () => ({}),
              );

          const message =
            typeof errorData.detail ===
            "string"
              ? errorData.detail
              : JSON.stringify(
                  errorData.detail ??
                    {},
                );

          setSaveMessage(
            message ||
              "Error saving study.",
          );

          return;
        }

        setSaveMessage(
          "Study saved to profile.",
        );
      } catch {
        setSaveMessage(
          "Error saving study.",
        );
      }
    };

  return (
    <main
      className={
        styles.page
      }
    >
      <section
        className={
          styles.searchSection
        }
      >
        <div
          className={
            styles.intro
          }
        >
          <h1
            className={
              styles.heading
            }
          >
            Retrieve study
          </h1>

          <p
            className={
              styles.description
            }
          >
            Search by study ID or
            study name to open its
            response dashboard.
          </p>
        </div>

        <form
          onSubmit={
            handleSearch
          }
          className={
            styles.searchForm
          }
        >
          <div
            className={
              styles.inputWrapper
            }
          >
            <label
              htmlFor="study-search"
              className={
                styles.label
              }
            >
              Study
            </label>

            <input
              id="study-search"
              type="text"
              value={
                studyQuery
              }
              onChange={(
                event,
              ) =>
                setStudyQuery(
                  event.target
                    .value,
                )
              }
              placeholder="Search by study ID or name"
              required
              className={
                styles.inputField
              }
              autoComplete="off"
            />

            {suggestions.length >
              0 && (
              <ul
                className={
                  styles.dropdown
                }
              >
                {suggestions.map(
                  (
                    suggestion,
                  ) => (
                    <li
                      key={
                        suggestion.study_id
                      }
                      className={
                        styles.dropdownItem
                      }
                      onMouseDown={(
                        event,
                      ) => {
                        event.preventDefault();

                        setStudyQuery(
                          suggestion.study_id,
                        );

                        setSuggestions(
                          [],
                        );
                      }}
                    >
                      <span
                        className={
                          styles.suggestionName
                        }
                      >
                        {suggestion.name ||
                          suggestion.study_id}
                      </span>

                      {suggestion.name &&
                        suggestion.name !==
                          suggestion.study_id && (
                          <span
                            className={
                              styles.suggestionId
                            }
                          >
                            {
                              suggestion.study_id
                            }
                          </span>
                        )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          <button
            type="submit"
            className={
              styles.primaryButton
            }
            disabled={
              loading
            }
          >
            {loading
              ? "Opening…"
              : "Open study"}
          </button>
        </form>

        {error && (
          <div
            className={
              styles.error
            }
          >
            {error}
          </div>
        )}
      </section>

      {selectedStudyId && (
        <>
          <div
            className={
              styles.studyActions
            }
          >
            <button
              type="button"
              onClick={
                handleSaveStudy
              }
              className={
                styles.secondaryButton
              }
            >
              Save to profile
            </button>

            {saveMessage && (
              <span
                className={
                  styles.saveMessage
                }
              >
                {saveMessage}
              </span>
            )}
          </div>

          <StudyResultsViewV2
            studyId={
              selectedStudyId
            }
          />
        </>
      )}
    </main>
  );
}