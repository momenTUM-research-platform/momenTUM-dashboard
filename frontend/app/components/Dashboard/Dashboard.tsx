"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import styles from "./Dashboard.module.css";

interface DashboardProps {
  user: any;
  dashboardData: any; // should contain { surveys: string[] }
}

const Dashboard: React.FC<DashboardProps> = ({ user, dashboardData }) => {
  const [deleteMessage, setDeleteMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<string[]>([]);

  // Get token from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("token");
      if (t) setToken(t);
    }
  }, []);

  // Update surveys once dashboardData is available
  useEffect(() => {
    if (dashboardData?.surveys) {
      setSurveys(dashboardData.surveys);
    }
  }, [dashboardData]);

  const handleDeleteStudy = async (studyId: string) => {
    if (!token) {
      setDeleteMessage("Authentication token not available.");
      return;
    }

    try {
      const res = await fetch("/api/user/studies", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ study_id: studyId }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setDeleteMessage(
          typeof errData.detail === "string"
            ? errData.detail
            : JSON.stringify(errData.detail)
        );
      } else {
        setDeleteMessage("Study deleted successfully!");
        setSurveys((prev) => prev.filter((id) => id !== studyId));
      }
    } catch (error) {
      setDeleteMessage("Error deleting study");
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Dashboard</h1>
      <p className={styles.welcome}>Welcome, {user.username}!</p>

      <div className={styles.studySection}>
        <h2>Your Studies</h2>
        {surveys && surveys.length > 0 ? (
          <ul className={styles.studyList}>
            {surveys.map((studyId: string) => (
              <li key={studyId} className={styles.studyItem}>
                <Link href={`/study/${studyId}`} className={styles.studyLink}>
                  {studyId}
                </Link>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteStudy(studyId)}
                  title="Delete Study"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noStudies}>No studies associated.</p>
        )}

        {deleteMessage && (
          <p className={styles.deleteMessage}>{deleteMessage}</p>
        )}

        <div className={styles.buttonGroup}>
          <Link href="/retrieve-study">
            <button className={styles.button}>Add/Search Studies</button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;