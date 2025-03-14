"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface GroupedBySection {
  section_name: string;
  qa: Record<string, any>;
  raw_responses?: any[];
}

interface GroupedByModule {
  module_name: string;
  sections: {
    [sectionIndex: string]: GroupedBySection;
  };
}

interface GroupedResponses {
  [userId: string]: {
    [moduleId: string]: GroupedByModule | {
      module_name: string;
      raw_responses: any[];
    };
  };
}

interface StudyResponse {
  study_id: string;
  grouped_responses: GroupedResponses;
}

export default function RetrieveStudyPage() {
  const [studyId, setStudyId] = useState("");
  const [data, setData] = useState<StudyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  // Protect the route: if user is not logged in, redirect to login.
  useEffect(() => {
    if (!user || !user.username) {
      router.push("/login");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/studies_responses_grouped/${studyId}`);
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Error fetching study responses");
      } else {
        const jsonData = await res.json();
        setData(jsonData);
      }
    } catch (err) {
      setError("Error fetching study responses");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Retrieve Study Responses</h1>
      <form onSubmit={handleSubmit}>
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
          Retrieve
        </button>
      </form>
      {loading && <p>Loading study responses...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data && (
        <div>
          <h2>Study ID: {data.study_id}</h2>
          {Object.keys(data.grouped_responses).map((userId) => (
            <div key={userId} style={{ marginBottom: "2rem" }}>
              <h3>User ID: {userId}</h3>
              {Object.keys(data.grouped_responses[userId]).map((moduleId) => {
                const moduleData = data.grouped_responses[userId][moduleId];
                if ("raw_responses" in moduleData) {
                  return (
                    <div key={moduleId} style={{ marginBottom: "1rem" }}>
                      <h4>Module: {moduleData.module_name} (Unknown)</h4>
                      <pre
                        style={{
                          background: "#f4f4f4",
                          padding: "1rem",
                          borderRadius: "4px",
                          overflowX: "auto",
                        }}
                      >
                        {JSON.stringify(moduleData.raw_responses, null, 2)}
                      </pre>
                    </div>
                  );
                } else {
                  return (
                    <div key={moduleId} style={{ marginBottom: "1rem" }}>
                      <h4>Module: {moduleData.module_name}</h4>
                      {Object.keys(moduleData.sections).map((secIndex) => {
                        const sectionData = moduleData.sections[secIndex];
                        return (
                          <div key={secIndex} style={{ marginLeft: "1rem", marginBottom: "1rem" }}>
                            <h5>Section: {sectionData.section_name}</h5>
                            <pre
                              style={{
                                background: "#f4f4f4",
                                padding: "1rem",
                                borderRadius: "4px",
                                overflowX: "auto",
                              }}
                            >
                              {JSON.stringify(sectionData.qa, null, 2)}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
