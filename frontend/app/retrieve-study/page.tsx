"use client";

import { useEffect, useState } from "react";
import StudyResultsViewV2 from "../components/StudyResultsViewV2/StudyResultsViewV2";
import styles from "./RetrieveStudyPage.module.css";

export default function RetrieveStudyPage() {
  const [studyQuery, setStudyQuery] = useState("");
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false); // used for the search button UX
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ study_id: string; name: string }[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);

  // Load token from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      setToken(localStorage.getItem("token"));
    }
  }, []);

  // Debounced study suggestions
  useEffect(() => {
    const handler = setTimeout(() => {
      if (studyQuery.length > 2) {
        fetch(`/api/studies_suggestions?query=${encodeURIComponent(studyQuery)}`)
          .then((res) => res.json())
          .then((data) => setSuggestions(data))
          .catch(() => setSuggestions([]));
      } else {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [studyQuery]);

  // Select study and let the V2 view fetch/render results
  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaveMessage("");
    setLoading(true);
    try {
      setSelectedStudyId(studyQuery.trim());
    } catch {
      setError("Could not select study.");
    } finally {
      setLoading(false);
    }
  };

  // Save selected study to user profile
  const handleSaveStudy = async () => {
    if (!token) {
      setSaveMessage("No token available.");
      return;
    }
    if (!selectedStudyId) {
      setSaveMessage("No study to save.");
      return;
    }
    try {
      const res = await fetch("/api/user/studies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ study_ids: [selectedStudyId] }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const message =
          typeof errData.detail === "string"
            ? errData.detail
            : JSON.stringify(errData.detail ?? {});
        setSaveMessage(message || "Error saving study.");
      } else {
        setSaveMessage("Study saved successfully!");
      }
    } catch {
      setSaveMessage("Error saving study.");
    }
  };

  return (
    <div className={styles.container}>
      <h1>Retrieve Study Responses</h1>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <div className={styles.inputWrapper}>
          <input
            type="text"
            value={studyQuery}
            onChange={(e) => setStudyQuery(e.target.value)}
            placeholder="Search studies by ID or name..."
            required
            className={styles.inputField}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <ul className={styles.dropdown}>
              {suggestions.map((s, idx) => (
                <li
                  key={`${s.study_id}-${idx}`}
                  className={styles.dropdownItem}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setStudyQuery(s.study_id);
                    setSuggestions([]);
                  }}
                >
                  {s.study_id} — {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? "Selecting..." : "Search"}
        </button>
      </form>

      {error && <p className={styles.error}>Error: {error}</p>}

      {selectedStudyId && (
        <>
          <div className={styles.saveStudy}>
            <button onClick={handleSaveStudy} className={styles.button}>
              Save Study to Profile
            </button>
            {saveMessage && <p className={styles.saveMessage}>{saveMessage}</p>}
          </div>

          <StudyResultsViewV2 studyId={selectedStudyId} />
        </>
      )}
    </div>
  );
}