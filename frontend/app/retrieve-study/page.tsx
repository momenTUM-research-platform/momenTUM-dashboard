"use client";

import { useState } from "react";
import TableView, { StudyData } from "../components/TableView/TableView";
import styles from "./RetrieveStudyPage.module.css";
import dynamic from "next/dynamic";
const CalendarView = dynamic(() => import("../components/CalendarView/CalendarView"), {
  ssr: false,
  loading: () => <p>Loading calendar...</p>,
});

export default function RetrieveStudyPage() {
  const [studyId, setStudyId] = useState("");
  const [data, setData] = useState<StudyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "calendar" | "json">("table");
  const [filterUser, setFilterUser] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    setCurrentPage(1);
    try {
      const res = await fetch(`/api/studies_responses_grouped/${studyId}`);
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Error fetching study data");
      } else {
        const jsonData = await res.json();
        setData(jsonData);
      }
    } catch {
      setError("Error fetching study data");
    } finally {
      setLoading(false);
    }
  };

  const getPaginatedData = (): StudyData | null => {
    if (!data) return null;
    const allUserIds = Object.keys(data.grouped_responses);
    const filteredUserIds = filterUser
      ? allUserIds.filter((userId) => userId.toLowerCase().includes(filterUser.toLowerCase()))
      : allUserIds;
    const totalUsers = filteredUserIds.length;
    const totalPages = Math.ceil(totalUsers / pageSize);
    const current = Math.min(currentPage, totalPages) || 1;
    const paginatedUserIds = filteredUserIds.slice((current - 1) * pageSize, current * pageSize);
    const paginatedGroupedResponses: { [userId: string]: any } = {};
    paginatedUserIds.forEach((userId) => {
      paginatedGroupedResponses[userId] = data.grouped_responses[userId];
    });
    return { study_id: data.study_id, grouped_responses: paginatedGroupedResponses };
  };

  const paginatedData = getPaginatedData();
  const totalUsers = data
    ? Object.keys(data.grouped_responses).filter((userId) =>
        filterUser ? userId.toLowerCase().includes(filterUser.toLowerCase()) : true
      ).length
    : 0;
  const totalPages = Math.ceil(totalUsers / pageSize);

  return (
    <div className={styles.container}>
      <h1>Retrieve Study Responses</h1>
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={studyId}
          onChange={(e) => setStudyId(e.target.value)}
          placeholder="Enter Study ID (e.g., test_ecosleep_ema)"
          required
          className={styles.inputField}
        />
        <button type="submit" className={styles.button}>
          Search
        </button>
      </form>
      {loading && <p>Loading study responses...</p>}
      {error && <p className={styles.error}>Error: {error}</p>}
      {data && (
        <>
          <div style={{ margin: "1rem 0" }}>
            <p>
              Total Users: {totalUsers} {totalUsers > 0 && `(Page ${currentPage} of ${totalPages})`}
            </p>
            <input
              type="text"
              value={filterUser}
              onChange={(e) => {
                setFilterUser(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter by User ID"
              className={styles.inputField}
            />
          </div>
          <div className={styles.pagination}>
            <button
              className={styles.button}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            <button
              className={styles.button}
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
            >
              Next
            </button>
          </div>
          <div className={styles.viewSwitcher}>
            {["table", "calendar", "json"].map((v) => (
              <button
                key={v}
                className={`${styles.viewButton} ${view === v ? styles.active : ""}`}
                onClick={() => setView(v as any)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)} View
              </button>
            ))}
          </div>
          {view === "table" && paginatedData && <TableView data={paginatedData} />}
          {view === "calendar" && paginatedData && <CalendarView data={paginatedData} />}
          {view === "json" && (
            <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: "4px" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}