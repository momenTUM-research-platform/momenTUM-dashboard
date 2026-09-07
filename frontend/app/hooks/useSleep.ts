"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchLabeledResponses,
} from "../lib/responses";

import type {
  LabeledSurveyResponseOut,
} from "../types/schemas";

import type {
  InferredStudyQuestion,
  RoleKey,
  SleepRow,
} from "../lib/types";

import {
  toDate,
  toInt,
} from "../lib/vizUtils";

type SleepRoles = Partial<
  Record<
    RoleKey,
    InferredStudyQuestion
  >
>;

type UseSleepOptions = {
  studyId: string;
  roles?: SleepRoles;
  userIds?: string[];
  from?: string;
  to?: string;
};

function minutesBetween(
  start: Date,
  end: Date,
): number {
  let difference =
    (
      end.getTime() -
      start.getTime()
    ) /
    60000;

  if (difference < 0) {
    difference +=
      24 * 60;
  }

  return Math.round(
    difference,
  );
}

function addMinutes(
  value: Date,
  minutes: number,
): Date {
  return new Date(
    value.getTime() +
      minutes * 60000,
  );
}

function dayKeyFromResponseTime(
  iso: string,
): string {
  const value =
    new Date(iso);

  const year =
    value.getFullYear();

  const month =
    String(
      value.getMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      value.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function answerForQuestion(
  response:
    LabeledSurveyResponseOut,
  question:
    InferredStudyQuestion |
    undefined,
): unknown {
  if (!question) {
    return undefined;
  }

  const answers =
    response.responses ?? {};

  return answers[
    question.question_id
  ];
}

export function useSleep({
  studyId,
  roles,
  userIds,
  from,
  to,
}: UseSleepOptions) {
  const safeRoles =
    roles ?? {};

  const [
    docs,
    setDocs,
  ] =
    useState<
      LabeledSurveyResponseOut[]
    >([]);

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

  const requestIdRef =
    useRef(0);

  const chosenModules =
    useMemo(() => {
      const modules =
        new Set<string>();

      for (
        const question
        of Object.values(
          safeRoles,
        )
      ) {
        if (
          question?.module_id
        ) {
          modules.add(
            question.module_id,
          );
        }
      }

      return Array.from(
        modules,
      );
    }, [
      safeRoles,
    ]);

  const canQuery =
    Boolean(
      safeRoles.trySleepTime,
    ) &&
    Boolean(
      safeRoles.outOfBedTime,
    ) &&
    chosenModules.length >
      0;

  useEffect(() => {
    const requestId =
      ++requestIdRef.current;

    if (!canQuery) {
      setDocs([]);
      setLoading(false);
      setError(null);

      return;
    }

    if (
      userIds !==
        undefined &&
      userIds.length === 0
    ) {
      setDocs([]);
      setLoading(false);
      setError(null);

      return;
    }

    const load =
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetchLabeledResponses(
              studyId,
              {
                user_id:
                  userIds,

                module_id:
                  chosenModules,

                from:
                  from ||
                  undefined,

                to:
                  to ||
                  undefined,

                sort:
                  "asc",

                skip:
                  0,

                limit:
                  50000,
              },
            );

          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setDocs(
            response,
          );
        } catch (
          caughtError:
            unknown
        ) {
          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setDocs([]);

          setError(
            caughtError instanceof
              Error
              ? caughtError.message
              : "Failed to load sleep data.",
          );
        } finally {
          if (
            requestId ===
            requestIdRef.current
          ) {
            setLoading(false);
          }
        }
      };

    void load();
  }, [
    canQuery,
    studyId,
    userIds,
    from,
    to,
    chosenModules,
  ]);

  const rows:
    SleepRow[] =
    useMemo(() => {
      if (
        docs.length === 0
      ) {
        return [];
      }

      const bucket =
        new Map<
          string,
          SleepRow
        >();

      for (
        const response
        of docs
      ) {
        const day =
          dayKeyFromResponseTime(
            response.response_time,
          );

        const key =
          `${response.user_id}|${day}`;

        if (
          !bucket.has(
            key,
          )
        ) {
          bucket.set(
            key,
            {
              user_id:
                response.user_id,

              date:
                day,

              trySleepTime:
                null,

              outOfBedTime:
                null,

              sleepLatencyMin:
                null,

              finalAwakeningTime:
                null,

              awakeningsCount:
                null,

              awakeningsDurationMin:
                null,

              napMinutes:
                null,

              napCount:
                null,

              sleepOnsetTime:
                null,

              sleepDurationMin:
                null,

              sleepDurationInclNapsMin:
                null,
            },
          );
        }

        const row =
          bucket.get(
            key,
          )!;

        const trySleepTime =
          toDate(
            answerForQuestion(
              response,
              safeRoles.trySleepTime,
            ),
          );

        const outOfBedTime =
          toDate(
            answerForQuestion(
              response,
              safeRoles.outOfBedTime,
            ),
          );

        const sleepLatencyMin =
          toInt(
            answerForQuestion(
              response,
              safeRoles.sleepLatencyMin,
            ),
          );

        const finalAwakeningTime =
          toDate(
            answerForQuestion(
              response,
              safeRoles.finalAwakeningTime,
            ),
          );

        const awakeningsCount =
          toInt(
            answerForQuestion(
              response,
              safeRoles.awakeningsCount,
            ),
          );

        const awakeningsDurationMin =
          toInt(
            answerForQuestion(
              response,
              safeRoles.awakeningsDurationMin,
            ),
          );

        const napMinutes =
          toInt(
            answerForQuestion(
              response,
              safeRoles.napMinutes,
            ),
          );

        const napCount =
          toInt(
            answerForQuestion(
              response,
              safeRoles.napCount,
            ),
          );

        if (
          trySleepTime &&
          !row.trySleepTime
        ) {
          row.trySleepTime =
            trySleepTime;
        }

        if (
          outOfBedTime &&
          !row.outOfBedTime
        ) {
          row.outOfBedTime =
            outOfBedTime;
        }

        if (
          sleepLatencyMin !==
            null &&
          row.sleepLatencyMin ===
            null
        ) {
          row.sleepLatencyMin =
            sleepLatencyMin;
        }

        if (
          finalAwakeningTime &&
          !row.finalAwakeningTime
        ) {
          row.finalAwakeningTime =
            finalAwakeningTime;
        }

        if (
          awakeningsCount !==
            null &&
          row.awakeningsCount ===
            null
        ) {
          row.awakeningsCount =
            awakeningsCount;
        }

        if (
          awakeningsDurationMin !==
            null &&
          row.awakeningsDurationMin ===
            null
        ) {
          row.awakeningsDurationMin =
            awakeningsDurationMin;
        }

        if (
          napMinutes !==
            null &&
          row.napMinutes ===
            null
        ) {
          row.napMinutes =
            napMinutes;
        }

        if (
          napCount !==
            null &&
          row.napCount ===
            null
        ) {
          row.napCount =
            napCount;
        }
      }

      for (
        const row
        of bucket.values()
      ) {
        if (
          !row.trySleepTime ||
          !row.outOfBedTime
        ) {
          continue;
        }

        const latency =
          Math.max(
            0,
            row.sleepLatencyMin ??
              0,
          );

        const onset =
          addMinutes(
            row.trySleepTime,
            latency,
          );

        row.sleepOnsetTime =
          onset;

        const sleepEnd =
          row.finalAwakeningTime ??
          row.outOfBedTime;

        const sleepPeriod =
          minutesBetween(
            onset,
            sleepEnd,
          );

        const awakeMinutes =
          Math.max(
            0,
            row.awakeningsDurationMin ??
              0,
          );

        const sleepMinutes =
          Math.max(
            0,
            sleepPeriod -
              awakeMinutes,
          );

        row.sleepDurationMin =
          sleepMinutes;

        row.sleepDurationInclNapsMin =
          sleepMinutes +
          Math.max(
            0,
            row.napMinutes ??
              0,
          );
      }

      return Array.from(
        bucket.values(),
      ).sort(
        (
          a,
          b,
        ) => {
          if (
            a.user_id ===
            b.user_id
          ) {
            return a.date.localeCompare(
              b.date,
            );
          }

          return a.user_id.localeCompare(
            b.user_id,
          );
        },
      );
    }, [
      docs,
      safeRoles,
    ]);

  return {
    rows,
    loading,
    error,
    canQuery,
  };
}