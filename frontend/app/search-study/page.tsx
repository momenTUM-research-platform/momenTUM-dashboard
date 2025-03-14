"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface GroupedResponses {
  [userId: string]: any[];
}

interface StudyData {
  study_id: string;
  grouped_responses: GroupedResponses;
}

export default function SearchStudyPage() {
  const [studyId, setStudyId] = useState("");
  const [data, setData] = useState<StudyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  // Protect the page: if no authenticated user is found, redirect to /login.
  useEffect(() => {
    if (!user || !user.username) {
      router.push("/login");
    }
  }, [user, router]);

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
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

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Search Study Responses</h1>
      <form onSubmit={handleSearch}>
        <label htmlFor="studyId">Enter Study ID:</label>
        <input
          id="studyId"
          type="text"
          value={studyId}
          onChange={(e) => setStudyId(e.target.value)}
          placeholder="e.g., test_ecosleep_ema"
          style={{
            width: "100%",
            padding: "0.5rem",
            marginTop: "0.5rem",
            marginBottom: "1rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
          required
        />
        <button
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
          Search
        </button>
      </form>
      {loading && <p>Loading study data...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data && (
        <div>
          <h2>Study ID: {data.study_id}</h2>
          {Object.keys(data.grouped_responses).map((userId) => (
            <div key={userId} style={{ marginBottom: "2rem" }}>
              <h3>User ID: {userId}</h3>
              <pre
                style={{
                  background: "#f4f4f4",
                  padding: "1rem",
                  borderRadius: "4px",
                }}
              >
                {JSON.stringify(data.grouped_responses[userId], null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
