"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SelectStudies() {
  const [availableStudies, setAvailableStudies] = useState<any[]>([]);
  const [selectedStudies, setSelectedStudies] = useState<number[]>([]);
  const [error, setError] = useState("");
  const router = useRouter();

  // Fetch all available studies
  useEffect(() => {
    fetch("/api/studies")
      .then((res) => res.json())
      .then((data) => setAvailableStudies(data))
      .catch((err) => setError("Failed to load studies"));
  }, []);

  const toggleStudySelection = (id: number) => {
    setSelectedStudies((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      setError("User not authenticated");
      return;
    }
    const res = await fetch("/api/user/studies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ study_ids: selectedStudies }),
    });
    if (!res.ok) {
      const errData = await res.text();
      setError(errData || "Failed to update studies");
      return;
    }
    router.push("/");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Select Studies</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        {availableStudies.map((study) => (
          <div key={study.id}>
            <input
              type="checkbox"
              id={`study-${study.id}`}
              checked={selectedStudies.includes(study.id)}
              onChange={() => toggleStudySelection(study.id)}
            />
            <label htmlFor={`study-${study.id}`}>
              {study.title} - {study.description}
            </label>
          </div>
        ))}
        <button type="submit" style={{ marginTop: "1rem" }}>
          Save Studies
        </button>
      </form>
    </div>
  );
}
