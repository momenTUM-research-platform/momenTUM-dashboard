"use client";
import { useEffect, useState } from "react";
import { fetchStudyQuestions } from "@/app/lib/responses";
import { InferredStudyQuestion } from "@/lib/types";

export function useStudyQuestions(studyId: string) {
  const [questions, setQuestions] = useState<InferredStudyQuestion[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const maybe = await (fetchStudyQuestions as any)(studyId, { infer: 1 });
        const qs: InferredStudyQuestion[] = Array.isArray(maybe)
          ? maybe
          : await fetchStudyQuestions(studyId);
        if (isMounted) setQuestions(qs as InferredStudyQuestion[]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [studyId]);

  return { questions, loading };
}