"use client";

import { useParams } from "next/navigation";
import StudyResultsViewV2 from "../../components/StudyResultsViewV2/StudyResultsViewV2";
import styles from "./StudyDetails.module.css";

export default function StudyDetailsPage() {
  const { studyId } = useParams() as { studyId: string };
  if (!studyId) return <p className={styles.loading}>Loading study ID...</p>;

  return (
    <div className={styles.container}>
      <h1 className={styles.header}>Study: {decodeURIComponent(studyId)}</h1>
      <StudyResultsViewV2 studyId={decodeURIComponent(studyId)} />
    </div>
  );
}