"use client";

import { useState, useEffect } from "react";
import StudyResultsView from "../components/StudyResultsView/StudyResultsView";
import styles from "./RetrieveStudyPage.module.css";

export default function RetrieveStudyPage() {
  const [studyQuery, setStudyQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ study_id: string; name: string }[]>([]);
  const [saveMessage, setSaveMessage] = useState("");

  // Fetch suggestions for partial study search (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (studyQuery.length > 2) {
        fetch(`/api/studies_suggestions?query=${encodeURIComponent(studyQuery)}`)
          .then((res) => res.json())
          .then((data) => setSuggestions(data))
          .catch((err) => console.error("Error fetching suggestions", err));
      } else {
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [studyQuery]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    setSaveMessage("");
    try {
      const res = await fetch(`/api/studies_responses_grouped/${studyQuery}`);
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Error fetching study data");
      } else {
        const jsonData = await res.json();
        setData(jsonData);
      }
    } catch (err) {
      setError("Error fetching study data");
    } finally {
      setLoading(false);
    }
  };

  // Save the current study (data.study_id) to the user's profile.
  const handleSaveStudy = async () => {
    try {
      const token = localStorage.getItem("token");
      const studyToSave = data?.study_id;
      if (!studyToSave) {
        setSaveMessage("No study to save.");
        return;
      }
      const res = await fetch("/api/user/studies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ study_ids: [studyToSave] }),
      });
      if (!res.ok) {
        const errData = await res.json();
        const errorMessage =
          typeof errData.detail === "string"
            ? errData.detail
            : JSON.stringify(errData.detail);
        setSaveMessage(errorMessage || "Error saving study");
      } else {
        setSaveMessage("Study saved successfully!");
      }
    } catch (err) {
      setSaveMessage("Error saving study");
    }
  };

  return (
    <div className={styles.container}>
      <h1>Retrieve Study Responses</h1>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          list="studySuggestions"
          value={studyQuery}
          onChange={(e) => setStudyQuery(e.target.value)}
          placeholder="Search studies by ID or name..."
          required
          className={styles.inputField}
        />
        <datalist id="studySuggestions">
          {suggestions.map((s, idx) => (
            <option key={`${s.study_id}-${idx}`} value={s.study_id} label={s.name} />
          ))}
        </datalist>
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>
      {loading && <p>Loading study responses...</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && (
        <>
          <div className={styles.saveStudy}>
            <button onClick={handleSaveStudy} className={styles.button}>
              Save Study to Profile
            </button>
            {saveMessage && <p className={styles.saveMessage}>{saveMessage}</p>}
          </div>
          <StudyResultsView data={data} />
        </>
      )}
    </div>
  );
}