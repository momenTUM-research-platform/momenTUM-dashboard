"use client";

import {
  useMemo,
  useState,
} from "react";

import ResponseValue from "@/app/components/ResponseValue/ResponseValue";

import {
  findStudyQuestion,
  formatAnswerForDisplay,
} from "@/app/lib/answerDisplay";

import {
  StudyQuestion,
} from "@/app/lib/responses";

import {
  LabeledSurveyResponseOut,
} from "@/app/types/schemas";

import styles from "./TableViewV2.module.css";

type Mapping = Record<
  string,
  string
>;

type Props = {
  rows:
    LabeledSurveyResponseOut[];

  questions?:
    StudyQuestion[];

  mapping?:
    Mapping;

  mappingName?:
    string;
};

type ViewMode =
  | "response"
  | "question";

type GroupKey =
  | "none"
  | "user"
  | "module"
  | "mapped"
  | "question";

type FlatRow = {
  response_time:
    string;

  alert_time:
    | string
    | null;

  user_id:
    string;

  module_id:
    string;

  module_name:
    string;

  question_text:
    string;

  question_id:
    string;

  answer:
    unknown;
};

function isEmpty(
  value: unknown,
): boolean {
  if (
    value === null ||
    value === undefined
  ) {
    return true;
  }

  if (
    typeof value ===
      "string" &&
    value.trim() ===
      ""
  ) {
    return true;
  }

  if (
    Array.isArray(
      value,
    ) &&
    value.length ===
      0
  ) {
    return true;
  }

  return false;
}

function formatDateTime(
  value:
    | string
    | null
    | undefined,
): string {
  if (
    !value
  ) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleString(
    undefined,
    {
      year:
        "numeric",

      month:
        "short",

      day:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    },
  );
}

function groupLabelForResponseRow(
  row:
    LabeledSurveyResponseOut,
  key:
    GroupKey,
  mapping?:
    Mapping,
): string {
  if (
    key ===
    "none"
  ) {
    return "All";
  }

  if (
    key ===
    "module"
  ) {
    return (
      row.module_name ??
      row.module_id ??
      "Unknown Module"
    );
  }

  if (
    key ===
    "mapped"
  ) {
    return (
      mapping?.[
        row.user_id
      ] ??
      `[unmapped] ${row.user_id}`
    );
  }

  return row.user_id;
}

function groupLabelForFlatRow(
  row:
    FlatRow,
  key:
    GroupKey,
  mapping?:
    Mapping,
): string {
  if (
    key ===
    "none"
  ) {
    return "All";
  }

  if (
    key ===
    "question"
  ) {
    return row.question_text;
  }

  if (
    key ===
    "module"
  ) {
    return (
      row.module_name ??
      "Unknown Module"
    );
  }

  if (
    key ===
    "mapped"
  ) {
    return (
      mapping?.[
        row.user_id
      ] ??
      `[unmapped] ${row.user_id}`
    );
  }

  return row.user_id;
}

function sortGroupEntries<T>(
  map:
    Map<
      string,
      T[]
    >,
) {
  return Array.from(
    map.entries(),
  ).sort(
    (
      a,
      b,
    ) =>
      a[0].localeCompare(
        b[0],
      ),
  );
}

function prepareDisplayValue(
  value:
    unknown,
  question?:
    StudyQuestion,
): unknown {
  const formatted =
    formatAnswerForDisplay(
      value,
      question,
    );

  if (
    Array.isArray(
      formatted,
    ) &&
    question
      ?.option_labels
  ) {
    return formatted.join(
      ", ",
    );
  }

  return formatted;
}

export default function TableViewV2({
  rows,
  questions = [],
  mapping,
  mappingName =
    "Mapped ID",
}: Props) {
  const hasMapping =
    !!mapping &&
    Object.keys(
      mapping,
    ).length >
      0;

  const [
    viewMode,
    setViewMode,
  ] =
    useState<ViewMode>(
      "response",
    );

  const [
    primaryGroupBy,
    setPrimaryGroupBy,
  ] =
    useState<GroupKey>(
      "none",
    );

  const [
    secondaryGroupBy,
    setSecondaryGroupBy,
  ] =
    useState<GroupKey>(
      "none",
    );

  const flatRows =
    useMemo<
      FlatRow[]
    >(() => {
      if (
        viewMode ===
        "response"
      ) {
        return [];
      }

      return rows.flatMap(
        (
          row,
        ) =>
          row.answers.map(
            (
              answer,
            ) => ({
              response_time:
                row.response_time,

              alert_time:
                row.alert_time ??
                null,

              user_id:
                row.user_id,

              module_id:
                row.module_id,

              module_name:
                row.module_name ??
                row.module_id,

              question_text:
                answer.question_text ??
                answer.question_id,

              question_id:
                answer.question_id,

              answer:
                answer.answer,
            }),
          ),
      );
    }, [
      rows,
      viewMode,
    ]);

  const groupOptions =
    useMemo(
      () => {
        const base: Array<{
          value:
            GroupKey;

          label:
            string;

          hidden?:
            boolean;
        }> = [
          {
            value:
              "none",

            label:
              "None",
          },
          {
            value:
              "user",

            label:
              "User",
          },
          {
            value:
              "module",

            label:
              "Module",
          },
          {
            value:
              "mapped",

            label:
              mappingName,

            hidden:
              !hasMapping,
          },
          {
            value:
              "question",

            label:
              "Question",

            hidden:
              viewMode !==
              "question",
          },
        ];

        return base.filter(
          (
            option,
          ) =>
            !option.hidden,
        );
      },
      [
        hasMapping,
        mappingName,
        viewMode,
      ],
    );

  const effectiveSecondary =
    useMemo<GroupKey>(
      () => {
        if (
          primaryGroupBy ===
          "none"
        ) {
          return "none";
        }

        if (
          secondaryGroupBy ===
          primaryGroupBy
        ) {
          return "none";
        }

        if (
          viewMode !==
            "question" &&
          secondaryGroupBy ===
            "question"
        ) {
          return "none";
        }

        if (
          !hasMapping &&
          secondaryGroupBy ===
            "mapped"
        ) {
          return "none";
        }

        return secondaryGroupBy;
      },
      [
        primaryGroupBy,
        secondaryGroupBy,
        viewMode,
        hasMapping,
      ],
    );

  const grouped =
    useMemo(
      () => {
        if (
          viewMode ===
          "response"
        ) {
          const primary =
            new Map<
              string,
              LabeledSurveyResponseOut[]
            >();

          for (
            const row of
            rows
          ) {
            const label =
              groupLabelForResponseRow(
                row,
                primaryGroupBy,
                mapping,
              );

            if (
              !primary.has(
                label,
              )
            ) {
              primary.set(
                label,
                [],
              );
            }

            primary
              .get(
                label,
              )!
              .push(
                row,
              );
          }

          const output: Array<{
            label:
              string;

            items:
              | LabeledSurveyResponseOut[]
              | Map<
                  string,
                  LabeledSurveyResponseOut[]
                >;

            isNested:
              boolean;
          }> =
            [];

          for (
            const [
              primaryLabel,
              primaryItems,
            ] of
            sortGroupEntries(
              primary,
            )
          ) {
            if (
              effectiveSecondary ===
              "none"
            ) {
              output.push({
                label:
                  primaryLabel,

                items:
                  primaryItems,

                isNested:
                  false,
              });

              continue;
            }

            const secondary =
              new Map<
                string,
                LabeledSurveyResponseOut[]
              >();

            for (
              const row of
              primaryItems
            ) {
              const label =
                groupLabelForResponseRow(
                  row,
                  effectiveSecondary,
                  mapping,
                );

              if (
                !secondary.has(
                  label,
                )
              ) {
                secondary.set(
                  label,
                  [],
                );
              }

              secondary
                .get(
                  label,
                )!
                .push(
                  row,
                );
            }

            output.push({
              label:
                primaryLabel,

              items:
                secondary,

              isNested:
                true,
            });
          }

          return output;
        }

        const primary =
          new Map<
            string,
            FlatRow[]
          >();

        for (
          const row of
          flatRows
        ) {
          const label =
            groupLabelForFlatRow(
              row,
              primaryGroupBy,
              mapping,
            );

          if (
            !primary.has(
              label,
            )
          ) {
            primary.set(
              label,
              [],
            );
          }

          primary
            .get(
              label,
            )!
            .push(
              row,
            );
        }

        const output: Array<{
          label:
            string;

          items:
            | FlatRow[]
            | Map<
                string,
                FlatRow[]
              >;

          isNested:
            boolean;
        }> =
          [];

        for (
          const [
            primaryLabel,
            primaryItems,
          ] of
          sortGroupEntries(
            primary,
          )
        ) {
          if (
            effectiveSecondary ===
            "none"
          ) {
            output.push({
              label:
                primaryLabel,

              items:
                primaryItems,

              isNested:
                false,
            });

            continue;
          }

          const secondary =
            new Map<
              string,
              FlatRow[]
            >();

          for (
            const row of
            primaryItems
          ) {
            const label =
              groupLabelForFlatRow(
                row,
                effectiveSecondary,
                mapping,
              );

            if (
              !secondary.has(
                label,
              )
            ) {
              secondary.set(
                label,
                [],
              );
            }

            secondary
              .get(
                label,
              )!
              .push(
                row,
              );
          }

          output.push({
            label:
              primaryLabel,

            items:
              secondary,

            isNested:
              true,
          });
        }

        return output;
      },
      [
        rows,
        flatRows,
        viewMode,
        primaryGroupBy,
        effectiveSecondary,
        mapping,
      ],
    );

  const setMode =
    (
      mode:
        ViewMode,
    ) => {
      setViewMode(
        mode,
      );

      if (
        mode ===
        "response"
      ) {
        setPrimaryGroupBy(
          "none",
        );

        setSecondaryGroupBy(
          "none",
        );

        return;
      }

      setPrimaryGroupBy(
        "question",
      );

      setSecondaryGroupBy(
        hasMapping
          ? "mapped"
          : "user",
      );
    };

  const renderResponseTable =
    (
      items:
        LabeledSurveyResponseOut[],
    ) => (
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
                  styles.th
                }
              >
                Scheduled
              </th>

              <th
                className={
                  styles.th
                }
              >
                Submitted
              </th>

              <th
                className={
                  styles.th
                }
              >
                {hasMapping
                  ? `${mappingName} (User)`
                  : "User"}
              </th>

              <th
                className={
                  styles.th
                }
              >
                Module
              </th>

              <th
                className={
                  styles.th
                }
              >
                Answers
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map(
              (
                row,
                rowIndex,
              ) => {
                const mapped =
                  mapping?.[
                    row.user_id
                  ];

                const userCell =
                  hasMapping
                    ? mapped
                      ? `${mapped} (${row.user_id})`
                      : row.user_id
                    : row.user_id;

                return (
                  <tr
                    key={`${row.user_id}-${row.module_id}-${row.response_time}-${rowIndex}`}
                  >
                    <td
                      className={
                        styles.td
                      }
                    >
                      {formatDateTime(
                        row.alert_time,
                      )}
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {formatDateTime(
                        row.response_time,
                      )}
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {
                        userCell
                      }
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {row.module_name ??
                        row.module_id}
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      <ul
                        className={
                          styles.answerList
                        }
                      >
                        {row.answers.map(
                          (
                            answer,
                            answerIndex,
                          ) => {
                            const empty =
                              isEmpty(
                                answer.answer,
                              );

                            const question =
                              findStudyQuestion(
                                questions,
                                row.module_id,
                                answer.question_id,
                              );

                            const displayValue =
                              empty
                                ? answer.answer
                                : prepareDisplayValue(
                                    answer.answer,
                                    question,
                                  );

                            return (
                              <li
                                key={`${answer.question_id}-${answerIndex}`}
                                className={`${styles.answerItem} ${
                                  empty
                                    ? styles.answerEmpty
                                    : styles.answerFilled
                                }`}
                              >
                                <span
                                  className={
                                    styles.qLabel
                                  }
                                >
                                  {answer.question_text ??
                                    answer.question_id}
                                </span>

                                <span
                                  className={
                                    styles.qValue
                                  }
                                >
                                  {empty ? (
                                    <span
                                      className={
                                        styles.missingValue
                                      }
                                    >
                                      Missing
                                    </span>
                                  ) : (
                                    <ResponseValue
                                      value={
                                        displayValue
                                      }
                                    />
                                  )}
                                </span>
                              </li>
                            );
                          },
                        )}
                      </ul>
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    );

  const renderQuestionTable =
    (
      items:
        FlatRow[],
    ) => (
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
                  styles.th
                }
              >
                Scheduled
              </th>

              <th
                className={
                  styles.th
                }
              >
                Submitted
              </th>

              <th
                className={
                  styles.th
                }
              >
                {hasMapping
                  ? `${mappingName} (User)`
                  : "User"}
              </th>

              <th
                className={
                  styles.th
                }
              >
                Module
              </th>

              <th
                className={
                  styles.th
                }
              >
                Question
              </th>

              <th
                className={
                  styles.th
                }
              >
                Answer
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map(
              (
                row,
                rowIndex,
              ) => {
                const mapped =
                  mapping?.[
                    row.user_id
                  ];

                const userCell =
                  hasMapping
                    ? mapped
                      ? `${mapped} (${row.user_id})`
                      : row.user_id
                    : row.user_id;

                const empty =
                  isEmpty(
                    row.answer,
                  );

                const question =
                  findStudyQuestion(
                    questions,
                    row.module_id,
                    row.question_id,
                  );

                const displayValue =
                  empty
                    ? row.answer
                    : prepareDisplayValue(
                        row.answer,
                        question,
                      );

                return (
                  <tr
                    key={`${row.user_id}-${row.module_id}-${row.question_id}-${row.response_time}-${rowIndex}`}
                  >
                    <td
                      className={
                        styles.td
                      }
                    >
                      {formatDateTime(
                        row.alert_time,
                      )}
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {formatDateTime(
                        row.response_time,
                      )}
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {
                        userCell
                      }
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {
                        row.module_name
                      }
                    </td>

                    <td
                      className={
                        styles.td
                      }
                    >
                      {
                        row.question_text
                      }
                    </td>

                    <td
                      className={`${styles.td} ${
                        empty
                          ? styles.questionAnswerEmpty
                          : styles.questionAnswerFilled
                      }`}
                    >
                      {empty ? (
                        <span
                          className={
                            styles.missingValue
                          }
                        >
                          Missing
                        </span>
                      ) : (
                        <ResponseValue
                          value={
                            displayValue
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>
    );

  return (
    <div
      className={
        styles.wrapper
      }
    >
      <div
        className={
          styles.toolbar
        }
      >
        <div
          className={
            styles.controlBlock
          }
        >
          <div
            className={
              styles.controlLabel
            }
          >
            Display mode
          </div>

          <div
            className={
              styles.segment
            }
          >
            <button
              type="button"
              className={`${styles.segmentBtn} ${
                viewMode ===
                "response"
                  ? styles.active
                  : ""
              }`}
              onClick={() =>
                setMode(
                  "response",
                )
              }
            >
              Response view
            </button>

            <button
              type="button"
              className={`${styles.segmentBtn} ${
                viewMode ===
                "question"
                  ? styles.active
                  : ""
              }`}
              onClick={() =>
                setMode(
                  "question",
                )
              }
            >
              Question view
            </button>
          </div>
        </div>

        <div
          className={
            styles.controlBlock
          }
        >
          <div
            className={
              styles.controlLabel
            }
          >
            Group by
          </div>

          <div
            className={
              styles.groupRow
            }
          >
            <div
              className={
                styles.selectGroup
              }
            >
              <label
                className={
                  styles.selectLabel
                }
                htmlFor="primary-group"
              >
                Primary
              </label>

              <select
                id="primary-group"
                className={
                  styles.select
                }
                value={
                  primaryGroupBy
                }
                onChange={(
                  event,
                ) => {
                  const value =
                    event.target
                      .value as GroupKey;

                  setPrimaryGroupBy(
                    value,
                  );

                  if (
                    value ===
                    "none"
                  ) {
                    setSecondaryGroupBy(
                      "none",
                    );
                  }
                }}
              >
                {groupOptions.map(
                  (
                    option,
                  ) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {
                        option.label
                      }
                    </option>
                  ),
                )}
              </select>
            </div>

            <div
              className={
                styles.selectGroup
              }
            >
              <label
                className={
                  styles.selectLabel
                }
                htmlFor="secondary-group"
              >
                Then
              </label>

              <select
                id="secondary-group"
                className={
                  styles.select
                }
                value={
                  effectiveSecondary
                }
                onChange={(
                  event,
                ) =>
                  setSecondaryGroupBy(
                    event.target
                      .value as GroupKey,
                  )
                }
                disabled={
                  primaryGroupBy ===
                  "none"
                }
              >
                {groupOptions
                  .filter(
                    (
                      option,
                    ) =>
                      option.value !==
                      "none",
                  )
                  .map(
                    (
                      option,
                    ) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    ),
                  )}

                <option value="none">
                  None
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {grouped.map(
        (
          block,
        ) => (
          <div
            key={
              block.label
            }
            className={
              styles.block
            }
          >
            {primaryGroupBy !==
              "none" && (
              <h3
                className={
                  styles.blockTitle
                }
              >
                {
                  block.label
                }
              </h3>
            )}

            {block.isNested ? (
              <div
                className={
                  styles.nested
                }
              >
                {Array.from(
                  block.items as Map<
                    string,
                    Array<
                      | LabeledSurveyResponseOut
                      | FlatRow
                    >
                  >,
                )
                  .sort(
                    (
                      a,
                      b,
                    ) =>
                      a[0].localeCompare(
                        b[0],
                      ),
                  )
                  .map(
                    ([
                      subLabel,
                      subItems,
                    ]) => (
                      <div
                        key={
                          subLabel
                        }
                        className={
                          styles.subBlock
                        }
                      >
                        <div
                          className={
                            styles.subTitle
                          }
                        >
                          {
                            subLabel
                          }
                        </div>

                        {viewMode ===
                        "response"
                          ? renderResponseTable(
                              subItems as LabeledSurveyResponseOut[],
                            )
                          : renderQuestionTable(
                              subItems as FlatRow[],
                            )}
                      </div>
                    ),
                  )}
              </div>
            ) : viewMode ===
              "response" ? (
              renderResponseTable(
                block.items as LabeledSurveyResponseOut[],
              )
            ) : (
              renderQuestionTable(
                block.items as FlatRow[],
              )
            )}
          </div>
        ),
      )}
    </div>
  );
}