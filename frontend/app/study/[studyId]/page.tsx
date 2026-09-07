"use client";

import {
  useEffect,
  useState,
} from "react";
import { useParams } from "next/navigation";

import StudyResultsViewV2 from "../../components/StudyResultsViewV2/StudyResultsViewV2";

import styles from "./StudyDetails.module.css";

type StudyMetadata = {
  study_id: string;
  study_name: string;
};

export default function StudyDetailsPage() {
  const { studyId } =
    useParams() as {
      studyId: string;
    };

  const [
    metadata,
    setMetadata,
  ] =
    useState<
      StudyMetadata | null
    >(null);

  const decodedStudyId =
    studyId
      ? decodeURIComponent(
          studyId
        )
      : "";

  useEffect(() => {
    if (!decodedStudyId) {
      return;
    }

    const token =
      localStorage.getItem(
        "token"
      );

    const controller =
      new AbortController();

    async function loadMetadata() {
      try {
        const response =
          await fetch(
            `/api/studies/${encodeURIComponent(
              decodedStudyId
            )}/metadata`,
            {
              headers: {
                Accept:
                  "application/json",
                ...(token
                  ? {
                      Authorization:
                        `Bearer ${token}`,
                    }
                  : {}),
              },
              cache: "no-store",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as StudyMetadata;

        setMetadata(data);
      } catch (error) {
        if (
          error instanceof
            DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Failed to load study metadata",
          error
        );
      }
    }

    void loadMetadata();

    return () =>
      controller.abort();
  }, [decodedStudyId]);

  if (!decodedStudyId) {
    return (
      <p
        className={
          styles.loading
        }
      >
        Loading study…
      </p>
    );
  }

  return (
    <main
      className={
        styles.page
      }
    >
      <div
        className={
          styles.studyHeader
        }
      >
        <p
          className={
            styles.eyebrow
          }
        >
          Study
        </p>

        <h1
          className={
            styles.title
          }
        >
          {metadata?.study_name ??
            decodedStudyId}
        </h1>

        {metadata?.study_name && (
          <p
            className={
              styles.studyId
            }
          >
            {decodedStudyId}
          </p>
        )}
      </div>

      <StudyResultsViewV2
        studyId={
          decodedStudyId
        }
      />
    </main>
  );
}