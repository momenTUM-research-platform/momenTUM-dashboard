"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import StudyResultsView from "../../components/StudyResultsView/StudyResultsView";
import styles from "./StudyDetails.module.css"; // Create and adjust this CSS file as needed

export default function StudyDetailsPage() {
  const { studyId } = useParams() as { studyId: string };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (studyId) {
      fetch(`/api/studies_responses_grouped/${studyId}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error("Error fetching study details");
          }
          return res.json();
        })
        .then((jsonData) => {
          setData(jsonData);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || "Error loading study details");
          setLoading(false);
        });
    }
  }, [studyId]);

  if (loading) return <p className={styles.loading}>Loading study details...</p>;
  if (error) return <p className={styles.error}>Error: {error}</p>;
  if (!data) return <p className={styles.noData}>No study details found.</p>;

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Study Details: {studyId}</h1>
      {/* Reuse the StudyResultsView to display responses, filters, and view switcher */}
      <StudyResultsView data={data} />
    </div>
  );
}