"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useStudyQuestions,
} from "../../hooks/useStudyQuestions";

import {
  useSleep,
} from "../../hooks/useSleep";

import {
  InferredStudyQuestion,
  RoleKey,
} from "../../lib/types";

import {
  isSchemaNumeric,
  isTime,
} from "../../lib/vizUtils";

import RoleSelect from "./RoleSelect";
import SleepRibbon from "./SleepRibbon";
import SleepStats from "./SleepStats";

import styles from "./SleepVizPanel.module.css";

type Props = {
  studyId: string;
  userIds?: string[];
  moduleIds?: string[];
  from?: string;
  to?: string;
  mapping?: Record<string, string>;
  mappingName?: string;
};

type RoleAssignments = Partial<
  Record<RoleKey, string>
>;

const STORAGE_PREFIX = "sleepviz:";

const REQUIRED_ROLES: Array<{
  role: RoleKey;
  label: string;
  description: string;
  predicate: (
    question: InferredStudyQuestion,
  ) => boolean;
}> = [
  {
    role: "trySleepTime",
    label: "Try to sleep",
    description:
      "Time the participant tried to fall asleep.",
    predicate: isTime,
  },
  {
    role: "outOfBedTime",
    label: "Out of bed",
    description:
      "Time the participant got out of bed.",
    predicate: isTime,
  },
];

const OPTIONAL_ROLES: Array<{
  role: RoleKey;
  label: string;
  description: string;
  predicate: (
    question: InferredStudyQuestion,
  ) => boolean;
}> = [
  {
    role: "sleepLatencyMin",
    label: "Sleep latency",
    description:
      "Minutes between trying to sleep and falling asleep.",
    predicate: isSchemaNumeric,
  },
  {
    role: "finalAwakeningTime",
    label: "Final awakening",
    description:
      "Time of final awakening before getting out of bed.",
    predicate: isTime,
  },
  {
    role: "awakeningsCount",
    label: "Number of awakenings",
    description:
      "Number of awakenings during the sleep period.",
    predicate: isSchemaNumeric,
  },
  {
    role: "awakeningsDurationMin",
    label: "Awake during night",
    description:
      "Total minutes awake during the sleep period.",
    predicate: isSchemaNumeric,
  },
  {
    role: "napMinutes",
    label: "Nap duration",
    description:
      "Total nap duration in minutes.",
    predicate: isSchemaNumeric,
  },
  {
    role: "napCount",
    label: "Number of naps",
    description:
      "Number of naps during the day.",
    predicate: isSchemaNumeric,
  },
];

function questionKey(
  question: InferredStudyQuestion,
) {
  return `${question.module_id}:${question.question_id}`;
}

export default function SleepVizPanel({
  studyId,
  userIds,
  moduleIds,
  from,
  to,
  mapping,
  mappingName,
}: Props) {
  const {
    questions,
    loading: questionsLoading,
    error: questionsError,
  } = useStudyQuestions(
    studyId,
  );

  const [
    roles,
    setRoles,
  ] =
    useState<RoleAssignments>(
      {},
    );

  const [
    generatedRoles,
    setGeneratedRoles,
  ] =
    useState<RoleAssignments | null>(
      null,
    );

  const allowedQuestions =
    useMemo(() => {
      if (!questions) {
        return [];
      }

      if (
        !moduleIds?.length
      ) {
        return questions;
      }

      const allowed =
        new Set(
          moduleIds,
        );

      return questions.filter(
        (question) =>
          allowed.has(
            question.module_id,
          ),
      );
    }, [
      questions,
      moduleIds,
    ]);

  useEffect(() => {
    const raw =
      sessionStorage.getItem(
        `${STORAGE_PREFIX}${studyId}`,
      );

    if (!raw) {
      return;
    }

    try {
      const parsed =
        JSON.parse(
          raw,
        ) as RoleAssignments;

      setRoles(
        parsed,
      );
    } catch {
      sessionStorage.removeItem(
        `${STORAGE_PREFIX}${studyId}`,
      );
    }
  }, [
    studyId,
  ]);

  useEffect(() => {
    if (
      !allowedQuestions.length
    ) {
      return;
    }

    const validIds =
      new Set(
        allowedQuestions.map(
          questionKey,
        ),
      );

    setRoles(
      (current) => {
        let changed =
          false;

        const next = {
          ...current,
        };

        for (
          const role
          of Object.keys(
            next,
          ) as RoleKey[]
        ) {
          const selected =
            next[
              role
            ];

          if (
            selected &&
            !validIds.has(
              selected,
            )
          ) {
            delete next[
              role
            ];

            changed =
              true;
          }
        }

        return changed
          ? next
          : current;
      },
    );
  }, [
    allowedQuestions,
  ]);

  useEffect(() => {
    sessionStorage.setItem(
      `${STORAGE_PREFIX}${studyId}`,
      JSON.stringify(
        roles,
      ),
    );
  }, [
    studyId,
    roles,
  ]);

  const roleQuestionMap =
    useMemo(() => {
      const map =
        new Map<
          string,
          InferredStudyQuestion
        >();

      for (
        const question
        of allowedQuestions
      ) {
        map.set(
          questionKey(
            question,
          ),
          question,
        );
      }

      return map;
    }, [
      allowedQuestions,
    ]);

  const selectedRoleQuestions =
    useMemo(() => {
      const result: Partial<
        Record<
          RoleKey,
          InferredStudyQuestion
        >
      > = {};

      for (
        const [
          role,
          key,
        ]
        of Object.entries(
          generatedRoles ??
            {},
        ) as Array<
          [
            RoleKey,
            string,
          ]
        >
      ) {
        const question =
          roleQuestionMap.get(
            key,
          );

        if (
          question
        ) {
          result[
            role
          ] =
            question;
        }
      }

      return result;
    }, [
      generatedRoles,
      roleQuestionMap,
    ]);

  const canGenerate =
    Boolean(
      roles.trySleepTime,
    ) &&
    Boolean(
      roles.outOfBedTime,
    );

  const {
    rows,
    loading:
      sleepLoading,
    error:
      sleepError,
  } = useSleep({
    studyId,
    userIds,
    from,
    to,
    roles:
      selectedRoleQuestions,
  });

  function updateRole(
    role: RoleKey,
    value: string,
  ) {
    setRoles(
      (current) => {
        const next = {
          ...current,
        };

        if (value) {
          next[
            role
          ] =
            value;
        } else {
          delete next[
            role
          ];
        }

        return next;
      },
    );

    setGeneratedRoles(
      null,
    );
  }

  function generateAnalysis() {
    if (
      !canGenerate
    ) {
      return;
    }

    setGeneratedRoles({
      ...roles,
    });
  }

  if (
    questionsLoading
  ) {
    return (
      <div
        className={
          styles.state
        }
      >
        Loading study
        questions…
      </div>
    );
  }

  if (
    questionsError
  ) {
    return (
      <div
        className={
          styles.errorState
        }
      >
        {
          questionsError
        }
      </div>
    );
  }

  if (
    !questions ||
    questions.length ===
      0
  ) {
    return (
      <div
        className={
          styles.state
        }
      >
        No study questions
        are available for
        visualization.
      </div>
    );
  }

  return (
    <div
      className={
        styles.panel
      }
    >
      <div
        className={
          styles.intro
        }
      >
        <h2
          className={
            styles.title
          }
        >
          Sleep analysis
        </h2>

        <p
          className={
            styles.description
          }
        >
          Map study questions
          to sleep variables
          to explore sleep
          timing and derived
          sleep measures.
        </p>
      </div>

      <div
        className={
          styles.mappingSection
        }
      >
        <div
          className={
            styles.sectionHeader
          }
        >
          <div>
            <h3
              className={
                styles.sectionTitle
              }
            >
              Variable mapping
            </h3>

            <p
              className={
                styles.sectionDescription
              }
            >
              Select the study
              questions that
              correspond to each
              sleep variable.
            </p>
          </div>
        </div>

        <div
          className={
            styles.roleGrid
          }
        >
          {REQUIRED_ROLES.map(
            ({
              role,
              label,
              description,
              predicate,
            }) => (
              <RoleSelect
                key={
                  role
                }
                label={
                  label
                }
                description={
                  description
                }
                questions={
                  allowedQuestions.filter(
                    predicate,
                  )
                }
                value={
                  roles[
                    role
                  ] ??
                  ""
                }
                onChange={(
                  value,
                ) =>
                  updateRole(
                    role,
                    value,
                  )
                }
                required
              />
            ),
          )}

          {OPTIONAL_ROLES.map(
            ({
              role,
              label,
              description,
              predicate,
            }) => (
              <RoleSelect
                key={
                  role
                }
                label={
                  label
                }
                description={
                  description
                }
                questions={
                  allowedQuestions.filter(
                    predicate,
                  )
                }
                value={
                  roles[
                    role
                  ] ??
                  ""
                }
                onChange={(
                  value,
                ) =>
                  updateRole(
                    role,
                    value,
                  )
                }
                optional
              />
            ),
          )}
        </div>

        <div
          className={
            styles.mappingActions
          }
        >
          <button
            type="button"
            className={
              styles.primaryButton
            }
            disabled={
              !canGenerate
            }
            onClick={
              generateAnalysis
            }
          >
            Generate analysis
          </button>

          {!canGenerate && (
            <span
              className={
                styles.mappingHint
              }
            >
              Try-to-sleep and
              out-of-bed questions
              are required.
            </span>
          )}
        </div>
      </div>

      {generatedRoles && (
        <div
          className={
            styles.resultsSection
          }
        >
          {sleepLoading && (
            <div
              className={
                styles.state
              }
            >
              Loading sleep
              responses…
            </div>
          )}

          {sleepError && (
            <div
              className={
                styles.errorState
              }
            >
              {
                sleepError
              }
            </div>
          )}

          {!sleepLoading &&
            !sleepError &&
            rows.length ===
              0 && (
              <div
                className={
                  styles.state
                }
              >
                No matching sleep
                responses were
                found for the
                selected mapping
                and filters.
              </div>
            )}

          {!sleepLoading &&
            !sleepError &&
            rows.length >
              0 && (
              <>
                <SleepRibbon
                  data={
                    rows
                  }
                  mapping={
                    mapping
                  }
                  mappingName={
                    mappingName
                  }
                />

                <SleepStats
                  data={
                    rows
                  }
                  mapping={
                    mapping
                  }
                  mappingName={
                    mappingName
                  }
                />

              </>
            )}
        </div>
      )}
    </div>
  );
}