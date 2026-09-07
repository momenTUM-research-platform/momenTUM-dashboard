"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  fetchStudyQuestions,
} from "@/app/lib/responses";

import {
  InferredStudyQuestion,
} from "@/lib/types";

export function useStudyQuestions(
  studyId: string,
) {
  const [
    questions,
    setQuestions,
  ] =
    useState<
      InferredStudyQuestion[] | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  useEffect(() => {
    let cancelled =
      false;

    const load =
      async () => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const result =
            await fetchStudyQuestions(
              studyId,
            );

          if (
            cancelled
          ) {
            return;
          }

          setQuestions(
            result,
          );
        } catch (
          caughtError:
            unknown
        ) {
          if (
            cancelled
          ) {
            return;
          }

          setQuestions(
            [],
          );

          setError(
            caughtError instanceof
            Error
              ? caughtError.message
              : "Failed to load study questions.",
          );
        } finally {
          if (
            !cancelled
          ) {
            setLoading(
              false,
            );
          }
        }
      };

    void load();

    return () => {
      cancelled =
        true;
    };
  }, [
    studyId,
  ]);

  return {
    questions,
    loading,
    error,
  };
}