// app/retrieve-study/page.tsx
"use client";

import { useState } from "react";
import TableView, { StudyData } from "../components/TableView";
import TimelineView from "../components/TimelineView";

/**
 * RetrieveStudyPage fetches and displays grouped study responses.
 * The page provides filtering by user ID, pagination, and view switching (Table, Timeline, JSON Debug).
 */
export default function RetrieveStudyPage() {
  const [studyId, setStudyId] = useState("");
  const [data, setData] = useState<StudyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "timeline" | "json">("table");

  // Pagination and filtering state.
  const [filterUser, setFilterUser] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  /**
   * Fetch grouped study responses based on the study ID.
   */
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
    } catch (err) {
      setError("Error fetching study data");
    } finally {
      setLoading(false);
    }
  };

  // Filter and paginate the grouped responses.
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
    <div className="container">
      <h1>Retrieve Study Responses</h1>
      <form onSubmit={handleSearch}>
        <input
          type="text"
          value={studyId}
          onChange={(e) => setStudyId(e.target.value)}
          placeholder="Enter Study ID (e.g., test_ecosleep_ema)"
          required
          className="input-field"
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>
      {loading && <p>Loading study responses...</p>}
      {error && <p className="error">Error: {error}</p>}
      {data && (
        <div>
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
              className="input-field"
              style={{ width: "50%", marginBottom: "1rem" }}
            />
          </div>
          <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center", gap: "1rem" }}>
            <button
              className="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{ width: "auto", padding: "0.5rem 1rem" }}
            >
              Previous
            </button>
            <button
              className="button"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              style={{ width: "auto", padding: "0.5rem 1rem" }}
            >
              Next
            </button>
          </div>
          <div className="view-switcher" style={{ margin: "1rem 0" }}>
            <button className="button" onClick={() => setView("table")}>
              Table View
            </button>
            <button className="button" onClick={() => setView("timeline")}>
              Timeline View
            </button>
            <button className="button" onClick={() => setView("json")}>
              JSON Debug
            </button>
          </div>
          {view === "table" && paginatedData && <TableView data={paginatedData} />}
          {view === "timeline" && paginatedData && <TimelineView data={paginatedData} />}
          {view === "json" && (
            <pre style={{ background: "#f4f4f4", padding: "1rem", borderRadius: "4px" }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}