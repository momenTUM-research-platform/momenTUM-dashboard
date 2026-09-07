"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  fetchAdherenceExpected,
  fetchAdherenceStructureCount,
  ModuleMeta,
  OccurrenceOut,
  safeTZ,
  toYMD,
} from "@/app/lib/adherence";

import {
  Facets,
  fetchFacets,
  fetchLabeledResponses,
  LabeledSurveyResponseOut,
} from "@/app/lib/responses";

import styles from "./AdherencePanel.module.css";

type Props = {
  studyId: string;

  userIds?: string[];

  moduleIds?: string[];

  from?: string;

  to?: string;

  mapping?: Record<
    string,
    string
  >;

  mappingName?: string;
};

type ModuleSummary = {
  module_name: string;
  expected: number;
  completed: number;
};

type UserSummary = {
  user_id: string;

  participantLabel: string;

  internalLabel: string;

  expected: number;

  completed: number;

  completion: number;

  perModule: Record<
    string,
    ModuleSummary
  >;
};

type OverallSummary = {
  participants: number;
  expected: number;
  completed: number;
  completion: number;
};

const GOOD_THRESHOLD =
  80;

const MID_THRESHOLD =
  60;

function addDays(
  value: Date,
  days: number,
): Date {
  const result =
    new Date(value);

  result.setDate(
    result.getDate() +
      days,
  );

  return result;
}

function adherenceClass(
  percentageValue: number,
): string {
  if (
    percentageValue >=
    GOOD_THRESHOLD
  ) {
    return styles.good;
  }

  if (
    percentageValue >=
    MID_THRESHOLD
  ) {
    return styles.mid;
  }

  return styles.low;
}

function baselineTime(
  response:
    LabeledSurveyResponseOut,
): number | null {
  const raw =
    response.alert_time ??
    response.response_time;

  if (!raw) {
    return null;
  }

  const parsed =
    Date.parse(
      String(raw),
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function completionTime(
  response:
    LabeledSurveyResponseOut,
): number | null {
  const raw =
    response.response_time ??
    response.alert_time;

  if (!raw) {
    return null;
  }

  const parsed =
    Date.parse(
      String(raw),
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function percentage(
  completed: number,
  expected: number,
): number {
  if (
    expected <= 0
  ) {
    return 0;
  }

  return Math.round(
    (
      completed /
      expected
    ) * 100,
  );
}

export default function AdherencePanel({
  studyId,
  userIds,
  moduleIds,
  mapping,
  mappingName = "Participant ID",
}: Props) {
  const [
    rows,
    setRows,
  ] =
    useState<
      LabeledSurveyResponseOut[]
    >([]);

  const [
    facets,
    setFacets,
  ] =
    useState<
      Facets | null
    >(null);

  const [
    studyDays,
    setStudyDays,
  ] =
    useState(7);

  const [
    maxOffsetDays,
    setMaxOffsetDays,
  ] =
    useState(0);

  const [
    scheduleSpanDays,
    setScheduleSpanDays,
  ] =
    useState(7);

  const [
    structurePerModule,
    setStructurePerModule,
  ] =
    useState<
      Record<
        string,
        number
      >
    >({});

  const [
    moduleMeta,
    setModuleMeta,
  ] =
    useState<
      Record<
        string,
        ModuleMeta
      >
    >({});

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

  const [
    summary,
    setSummary,
  ] =
    useState<
      UserSummary[]
    >([]);

  const tz =
    safeTZ();

  const hasExplicitUserFilter =
    userIds !==
    undefined;

  const hasImpossibleUserFilter =
    hasExplicitUserFilter &&
    userIds.length ===
      0;

  const userIdsKey =
    JSON.stringify(
      userIds ??
      null,
    );

  const moduleIdsKey =
    JSON.stringify(
      moduleIds ??
      null,
    );

  const moduleFilterSet =
    useMemo(() => {
      if (
        !moduleIds ||
        moduleIds.length ===
          0
      ) {
        return null;
      }

      return new Set(
        moduleIds,
      );
    }, [
      moduleIdsKey,
    ]);

  useEffect(() => {
    let cancelled =
      false;

    if (
      hasImpossibleUserFilter
    ) {
      setRows(
        [],
      );

      setFacets(
        null,
      );

      setLoading(
        false,
      );

      setError(
        null,
      );

      return () => {
        cancelled =
          true;
      };
    }

    const load =
      async () => {
        setLoading(
          true,
        );

        setError(
          null,
        );

        try {
          const [
            responseRows,
            responseFacets,
          ] =
            await Promise.all([
              fetchLabeledResponses(
                studyId,
                {
                  user_id:
                    hasExplicitUserFilter
                      ? userIds
                      : undefined,

                  sort:
                    "asc",

                  skip:
                    0,

                  limit:
                    50000,
                },
              ),

              fetchFacets(
                studyId,
                {
                  user_id:
                    hasExplicitUserFilter
                      ? userIds
                      : undefined,
                },
              ),
            ]);

          if (
            cancelled
          ) {
            return;
          }

          setRows(
            responseRows,
          );

          setFacets(
            responseFacets,
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

          const message =
            caughtError instanceof
            Error
              ? caughtError.message
              : "Failed to load adherence data.";

          setError(
            message,
          );

          setRows(
            [],
          );

          setFacets(
            null,
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
    userIdsKey,
    hasExplicitUserFilter,
    hasImpossibleUserFilter,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    const loadStructure =
      async () => {
        try {
          const result =
            await fetchAdherenceStructureCount(
              studyId,
            );

          if (
            cancelled
          ) {
            return;
          }

          setStudyDays(
            Math.max(
              1,
              Number.isFinite(
                result.study_days,
              )
                ? result.study_days
                : 7,
            ),
          );

          setStructurePerModule(
            result.per_module ??
              {},
          );

          setModuleMeta(
            result.per_module_meta ??
              {},
          );

          setMaxOffsetDays(
            Number.isFinite(
              result.max_offset_days,
            )
              ? Math.max(
                  0,
                  result.max_offset_days,
                )
              : 0,
          );

          setScheduleSpanDays(
            Number.isFinite(
              result.schedule_span_days,
            )
              ? Math.max(
                  1,
                  result.schedule_span_days,
                )
              : Math.max(
                  1,
                  result.study_days ??
                    7,
                ),
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

          console.error(
            "Failed to load adherence structure.",
            caughtError,
          );
        }
      };

    void loadStructure();

    return () => {
      cancelled =
        true;
    };
  }, [
    studyId,
  ]);

  useEffect(() => {
    let cancelled =
      false;

    const calculate =
      async () => {
        if (
          hasImpossibleUserFilter
        ) {
          setSummary(
            [],
          );

          return;
        }

        const explicitUsers =
          hasExplicitUserFilter
            ? userIds ??
              []
            : [];

        const usersFromRows =
          rows.map(
            (row) =>
              row.user_id,
          );

        const usersFromFacets =
          facets?.users ??
          [];

        const users =
          Array.from(
            new Set([
              ...explicitUsers,
              ...usersFromRows,
              ...usersFromFacets,
            ]),
          ).filter(
            Boolean,
          );

        if (
          users.length ===
          0
        ) {
          setSummary(
            [],
          );

          return;
        }

        const earliestByUser:
          Record<
            string,
            number
          > = {};

        const actualByUser:
          Record<
            string,
            Record<
              string,
              number[]
            >
          > = {};

        for (
          const row
          of rows
        ) {
          const baseline =
            baselineTime(
              row,
            );

          if (
            baseline !==
            null
          ) {
            const previous =
              earliestByUser[
                row.user_id
              ];

            if (
              previous ===
                undefined ||
              baseline <
                previous
            ) {
              earliestByUser[
                row.user_id
              ] =
                baseline;
            }
          }

          const completedAt =
            completionTime(
              row,
            );

          if (
            completedAt ===
            null
          ) {
            continue;
          }

          const userModules =
            actualByUser[
              row.user_id
            ] ??
            {};

          const times =
            userModules[
              row.module_id
            ] ??
            [];

          times.push(
            completedAt,
          );

          userModules[
            row.module_id
          ] =
            times;

          actualByUser[
            row.user_id
          ] =
            userModules;
        }

        for (
          const modules
          of Object.values(
            actualByUser,
          )
        ) {
          for (
            const times
            of Object.values(
              modules,
            )
          ) {
            times.sort(
              (
                a,
                b,
              ) =>
                a - b,
            );
          }
        }

        const output:
          UserSummary[] = [];

        for (
          const userId
          of users
        ) {
          const baseline =
            earliestByUser[
              userId
            ];

          if (
            baseline ===
            undefined
          ) {
            continue;
          }

          const baselineDate =
            new Date(
              baseline,
            );

          const endDate =
            addDays(
              baselineDate,
              scheduleSpanDays -
                1,
            );

          const fromYmd =
            toYMD(
              baselineDate,
            );

          const toYmd =
            toYMD(
              endDate,
            );

          let expectedOccurrences:
            OccurrenceOut[] =
              [];

          try {
            expectedOccurrences =
              await fetchAdherenceExpected(
                {
                  studyId,

                  from:
                    fromYmd,

                  to:
                    toYmd,

                  tz,

                  userId,
                },
              );
          } catch (
            caughtError:
              unknown
          ) {
            console.error(
              `Failed to load expected adherence for ${userId}.`,
              caughtError,
            );

            expectedOccurrences =
              [];
          }

          if (
            moduleFilterSet
          ) {
            expectedOccurrences =
              expectedOccurrences.filter(
                (
                  occurrence,
                ) =>
                  moduleFilterSet.has(
                    occurrence.module_id,
                  ),
              );
          }

          const perModule:
            Record<
              string,
              ModuleSummary
            > = {};

          for (
            const [
              moduleId,
              structureExpected,
            ]
            of Object.entries(
              structurePerModule,
            )
          ) {
            if (
              moduleFilterSet &&
              !moduleFilterSet.has(
                moduleId,
              )
            ) {
              continue;
            }

            const meta =
              moduleMeta[
                moduleId
              ];

            perModule[
              moduleId
            ] = {
              module_name:
                meta?.module_name ??
                moduleId,

              expected:
                meta?.repeat ===
                "daily"
                  ? 0
                  : structureExpected,

              completed:
                0,
            };
          }

          const expectedByModule:
            Record<
              string,
              number
            > = {};

          for (
            const occurrence
            of expectedOccurrences
          ) {
            const moduleId =
              occurrence.module_id;

            const meta =
              moduleMeta[
                moduleId
              ];

            if (
              meta?.repeat ===
              "never"
            ) {
              continue;
            }

            expectedByModule[
              moduleId
            ] =
              (
                expectedByModule[
                  moduleId
                ] ??
                0
              ) + 1;
          }

          for (
            const [
              moduleId,
              expected,
            ]
            of Object.entries(
              expectedByModule,
            )
          ) {
            const existing =
              perModule[
                moduleId
              ];

            if (
              existing
            ) {
              existing.expected =
                expected;

              continue;
            }

            perModule[
              moduleId
            ] = {
              module_name:
                moduleMeta[
                  moduleId
                ]
                  ?.module_name ??
                moduleId,

              expected,

              completed:
                0,
            };
          }

          const userActual =
            actualByUser[
              userId
            ] ??
            {};

          for (
            const [
              moduleId,
              moduleSummary,
            ]
            of Object.entries(
              perModule,
            )
          ) {
            const meta =
              moduleMeta[
                moduleId
              ];

            if (
              meta?.repeat !==
              "never"
            ) {
              continue;
            }

            const actualCount =
              (
                userActual[
                  moduleId
                ] ??
                []
              ).length;

            moduleSummary.completed =
              Math.min(
                actualCount,
                moduleSummary.expected,
              );
          }

          const consumedIndex:
            Record<
              string,
              number
            > = {};

          for (
            const occurrence
            of expectedOccurrences
          ) {
            const moduleId =
              occurrence.module_id;

            const meta =
              moduleMeta[
                moduleId
              ];

            if (
              meta?.repeat ===
              "never"
            ) {
              continue;
            }

            const windowStart =
              Date.parse(
                occurrence.start,
              );

            const windowEnd =
              Date.parse(
                occurrence.end,
              );

            if (
              !Number.isFinite(
                windowStart,
              ) ||
              !Number.isFinite(
                windowEnd,
              )
            ) {
              continue;
            }

            const times =
              userActual[
                moduleId
              ] ??
              [];

            const startingIndex =
              consumedIndex[
                moduleId
              ] ??
              0;

            let matchedIndex =
              -1;

            for (
              let index =
                startingIndex;
              index <
              times.length;
              index += 1
            ) {
              const time =
                times[
                  index
                ];

              if (
                time <
                windowStart
              ) {
                continue;
              }

              if (
                time >
                windowEnd
              ) {
                break;
              }

              matchedIndex =
                index;

              break;
            }

            if (
              matchedIndex <
              0
            ) {
              continue;
            }

            consumedIndex[
              moduleId
            ] =
              matchedIndex +
              1;

            if (
              !perModule[
                moduleId
              ]
            ) {
              perModule[
                moduleId
              ] = {
                module_name:
                  moduleMeta[
                    moduleId
                  ]
                    ?.module_name ??
                  occurrence.module_name ??
                  moduleId,

                expected:
                  0,

                completed:
                  0,
              };
            }

            perModule[
              moduleId
            ].completed +=
              1;
          }

          for (
            const moduleSummary
            of Object.values(
              perModule,
            )
          ) {
            moduleSummary.completed =
              Math.min(
                moduleSummary.completed,
                moduleSummary.expected,
              );
          }

          const expectedTotal =
            Object.values(
              perModule,
            ).reduce(
              (
                total,
                moduleSummary,
              ) =>
                total +
                moduleSummary.expected,
              0,
            );

          const completedTotal =
            Object.values(
              perModule,
            ).reduce(
              (
                total,
                moduleSummary,
              ) =>
                total +
                moduleSummary.completed,
              0,
            );

          const mapped =
            mapping?.[
              userId
            ];

          output.push({
            user_id:
              userId,

            participantLabel:
              mapped ??
              userId,

            internalLabel:
              userId,

            expected:
              expectedTotal,

            completed:
              completedTotal,

            completion:
              percentage(
                completedTotal,
                expectedTotal,
              ),

            perModule,
          });
        }

        if (
          cancelled
        ) {
          return;
        }

        output.sort(
          (
            a,
            b,
          ) =>
            a.participantLabel.localeCompare(
              b.participantLabel,
              undefined,
              {
                numeric:
                  true,
              },
            ),
        );

        setSummary(
          output,
        );
      };

    void calculate();

    return () => {
      cancelled =
        true;
    };
  }, [
    studyId,
    userIdsKey,
    moduleIdsKey,
    rows,
    facets,
    scheduleSpanDays,
    structurePerModule,
    moduleMeta,
    tz,
    mapping,
    hasExplicitUserFilter,
    hasImpossibleUserFilter,
    moduleFilterSet,
  ]);

  const moduleColumns =
    useMemo(() => {
      const seen =
        new Set<string>();

      for (
        const participant
        of summary
      ) {
        for (
          const moduleId
          of Object.keys(
            participant.perModule,
          )
        ) {
          seen.add(
            moduleId,
          );
        }
      }

      return Array.from(
        seen,
      ).sort(
        (
          a,
          b,
        ) => {
          const aName =
            moduleMeta[a]
              ?.module_name ??
            a;

          const bName =
            moduleMeta[b]
              ?.module_name ??
            b;

          return aName.localeCompare(
            bName,
          );
        },
      );
    }, [
      summary,
      moduleMeta,
    ]);

  const overall =
    useMemo<
      OverallSummary | null
    >(() => {
      if (
        summary.length ===
        0
      ) {
        return null;
      }

      const expected =
        summary.reduce(
          (
            total,
            participant,
          ) =>
            total +
            participant.expected,
          0,
        );

      const completed =
        summary.reduce(
          (
            total,
            participant,
          ) =>
            total +
            participant.completed,
          0,
        );

      return {
        participants:
          summary.length,

        expected,

        completed,

        completion:
          percentage(
            completed,
            expected,
          ),
      };
    }, [
      summary,
    ]);

  return (
    <div
      className={
        styles.root
      }
    >
      <div
        className={
          styles.header
        }
      >
        <div>
          <h3
            className={
              styles.heading
            }
          >
            Adherence
          </h3>

          <p
            className={
              styles.description
            }
          >
            Study-wide expected
            versus completed
            responses for each
            participant.
            The longest daily
            schedule contains{" "}
            {studyDays}{" "}
            {studyDays ===
            1
              ? "scheduled day"
              : "scheduled days"}
            , and the full
            schedule spans{" "}
            {scheduleSpanDays}{" "}
            {scheduleSpanDays ===
            1
              ? "calendar day"
              : "calendar days"}
            {maxOffsetDays >
            0
              ? ` with module offsets up to ${maxOffsetDays} days`
              : ""}
            .
          </p>
        </div>

        {overall && (
          <div
            className={
              styles.summary
            }
          >
            <div
              className={
                styles.summaryItem
              }
            >
              <span
                className={
                  styles.summaryLabel
                }
              >
                Participants
              </span>

              <strong
                className={
                  styles.summaryValue
                }
              >
                {
                  overall.participants
                }
              </strong>
            </div>

            <div
              className={
                styles.summaryItem
              }
            >
              <span
                className={
                  styles.summaryLabel
                }
              >
                Completed /
                expected
              </span>

              <strong
                className={
                  styles.summaryValue
                }
              >
                {
                  overall.completed
                }
                {" / "}
                {
                  overall.expected
                }
              </strong>
            </div>

            <div
              className={
                styles.overallSummary
              }
            >
              <div
                className={
                  styles.overallTop
                }
              >
                <span
                  className={
                    styles.summaryLabel
                  }
                >
                  Overall
                </span>

                <strong
                  className={
                    styles.summaryValue
                  }
                >
                  {
                    overall.completion
                  }
                  %
                </strong>
              </div>

              <div
                className={
                  styles.summaryProgress
                }
              >
                <span
                  className={`${styles.summaryProgressFill} ${adherenceClass(
                    overall.completion,
                  )}`}
                  style={{
                    width:
                      `${Math.min(
                        100,
                        Math.max(
                          0,
                          overall.completion,
                        ),
                      )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={
          styles.contextRow
        }
      >
        <span>
          Participant labels use{" "}
          <strong>
            {mappingName}
          </strong>{" "}
          where available.
        </span>

        <span
          className={
            styles.contextDivider
          }
          aria-hidden="true"
        >
          ·
        </span>

        <span>
          Green ≥{" "}
          {GOOD_THRESHOLD}%,
          amber ≥{" "}
          {MID_THRESHOLD}%.
        </span>
      </div>

      {loading && (
        <div
          className={
            styles.state
          }
        >
          Loading adherence…
        </div>
      )}

      {error && (
        <div
          className={
            styles.error
          }
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        summary.length ===
          0 && (
          <div
            className={
              styles.state
            }
          >
            No participants
            available for the
            current filters.
          </div>
        )}

      {!loading &&
        !error &&
        summary.length >
          0 && (
          <div
            className={
              styles.tableWrap
            }
          >
            <table
              className={
                styles.table
              }
            >
              <thead>
                <tr>
                  <th
                    className={
                      styles.participantColumn
                    }
                  >
                    Participant
                  </th>

                  <th
                    className={
                      styles.overallColumn
                    }
                  >
                    Overall
                  </th>

                  {moduleColumns.map(
                    (
                      moduleId,
                    ) => (
                      <th
                        key={
                          moduleId
                        }
                        className={
                          styles.moduleColumn
                        }
                        title={
                          moduleMeta[
                            moduleId
                          ]
                            ?.module_name ??
                          moduleId
                        }
                      >
                        {
                          moduleMeta[
                            moduleId
                          ]
                            ?.module_name ??
                          moduleId
                        }
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {summary.map(
                  (
                    participant,
                  ) => (
                    <tr
                      key={
                        participant.user_id
                      }
                    >
                      <td
                        className={
                          styles.participantCell
                        }
                      >
                        <div
                          className={
                            styles.participantName
                          }
                        >
                          {
                            participant.participantLabel
                          }
                        </div>

                        {participant.participantLabel !==
                          participant.internalLabel && (
                          <div
                            className={
                              styles.internalId
                            }
                            title={
                              participant.internalLabel
                            }
                          >
                            {
                              participant.internalLabel
                            }
                          </div>
                        )}
                      </td>

                      <td>
                        <AdherenceCell
                          completed={
                            participant.completed
                          }
                          expected={
                            participant.expected
                          }
                          completion={
                            participant.completion
                          }
                        />
                      </td>

                      {moduleColumns.map(
                        (
                          moduleId,
                        ) => {
                          const moduleSummary =
                            participant.perModule[
                              moduleId
                            ];

                          if (
                            !moduleSummary
                          ) {
                            return (
                              <td
                                key={
                                  moduleId
                                }
                                className={
                                  styles.emptyCell
                                }
                              >
                                —
                              </td>
                            );
                          }

                          return (
                            <td
                              key={
                                moduleId
                              }
                            >
                              <AdherenceCell
                                completed={
                                  moduleSummary.completed
                                }
                                expected={
                                  moduleSummary.expected
                                }
                                completion={percentage(
                                  moduleSummary.completed,
                                  moduleSummary.expected,
                                )}
                              />
                            </td>
                          );
                        },
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function AdherenceCell({
  completed,
  expected,
  completion,
}: {
  completed: number;
  expected: number;
  completion: number;
}) {
  return (
    <div
      className={
        styles.adherenceCell
      }
    >
      <div
        className={
          styles.cellTop
        }
      >
        <strong
          className={
            styles.cellPercentage
          }
        >
          {completion}%
        </strong>

        <span
          className={
            styles.cellCount
          }
        >
          {completed}/{expected}
        </span>
      </div>

      <div
        className={
          styles.cellProgress
        }
      >
        <span
          className={`${styles.cellProgressFill} ${adherenceClass(
            completion,
          )}`}
          style={{
            width:
              `${Math.min(
                100,
                Math.max(
                  0,
                  completion,
                ),
              )}%`,
          }}
        />
      </div>
    </div>
  );
}