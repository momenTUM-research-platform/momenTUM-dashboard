"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import ResponseValue from "@/app/components/ResponseValue/ResponseValue";

import styles from "./EventDetail.module.css";

export interface ExtendedEventProps {
  extractedStudyId: string;
  moduleName: string;
  sectionName?: string;
  responseTime?: string;
  details?: Record<string, unknown>;
  type: "raw" | "structured";
}

interface EventDetailProps {
  isOpen: boolean;
  onClose: () => void;
  eventData: ExtendedEventProps | null;
}

type AggregatedValue = {
  answers: unknown[];
  responseTimes: string[];
  alertTimes?: Array<string | null>;
};

type SubmissionAnswer = {
  question: string;
  answer: unknown;
};

type Submission = {
  responseTime: string | null;
  alertTime: string | null;
  answers: SubmissionAnswer[];
};

function isAnswerEmpty(
  answer: unknown,
): boolean {
  return (
    answer === "" ||
    answer === null ||
    answer === undefined ||
    (
      Array.isArray(answer) &&
      answer.length === 0
    )
  );
}

function isAggregatedValue(
  value: unknown,
): value is AggregatedValue {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as Partial<AggregatedValue>;

  return Array.isArray(
    candidate.answers,
  );
}

function parseTimestamp(
  value: string | null,
): number {
  if (!value) {
    return Number.NaN;
  }

  return new Date(
    value,
  ).getTime();
}

function localDateKey(
  value: string,
): string {
  const date =
    new Date(value);

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function isEarlierPrompt(
  submission: Submission,
): boolean {
  if (
    !submission.responseTime ||
    !submission.alertTime
  ) {
    return false;
  }

  return (
    localDateKey(
      submission.alertTime,
    ) <
    localDateKey(
      submission.responseTime,
    )
  );
}

function formatDate(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
}

function formatDateTime(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function formatTime(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleTimeString(
    undefined,
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function buildSubmissions(
  eventData: ExtendedEventProps,
): Submission[] {
  if (!eventData.details) {
    return [];
  }

  const submissionsByTime =
    new Map<
      string,
      Submission
    >();

  const answersWithoutTime:
    SubmissionAnswer[] = [];

  for (const [
    question,
    value,
  ] of Object.entries(
    eventData.details,
  )) {
    if (
      isAggregatedValue(
        value,
      )
    ) {
      const responseTimes =
        Array.isArray(
          value.responseTimes,
        )
          ? value.responseTimes
          : [];

      const alertTimes =
        Array.isArray(
          value.alertTimes,
        )
          ? value.alertTimes
          : [];

      value.answers.forEach(
        (
          answer,
          index,
        ) => {
          const responseTime =
            responseTimes[
              index
            ];

          const alertTime =
            alertTimes[
              index
            ] ?? null;

          if (!responseTime) {
            answersWithoutTime.push({
              question,
              answer,
            });

            return;
          }

          let submission =
            submissionsByTime.get(
              responseTime,
            );

          if (!submission) {
            submission = {
              responseTime,
              alertTime,
              answers: [],
            };

            submissionsByTime.set(
              responseTime,
              submission,
            );
          } else if (
            !submission.alertTime &&
            alertTime
          ) {
            submission.alertTime =
              alertTime;
          }

          submission.answers.push({
            question,
            answer,
          });
        },
      );

      continue;
    }

    answersWithoutTime.push({
      question,
      answer: value,
    });
  }

  const submissions =
    Array.from(
      submissionsByTime.values(),
    ).sort(
      (a, b) =>
        parseTimestamp(
          a.responseTime,
        ) -
        parseTimestamp(
          b.responseTime,
        ),
    );

  if (
    answersWithoutTime.length >
    0
  ) {
    if (
      submissions.length ===
      0
    ) {
      submissions.push({
        responseTime:
          eventData.responseTime ??
          null,

        alertTime:
          null,

        answers:
          answersWithoutTime,
      });
    } else {
      submissions[
        submissions.length - 1
      ].answers.push(
        ...answersWithoutTime,
      );
    }
  }

  return submissions;
}

const EventDetail: React.FC<
  EventDetailProps
> = ({
  isOpen,
  onClose,
  eventData,
}) => {
  const submissions =
    useMemo(
      () =>
        eventData
          ? buildSubmissions(
              eventData,
            )
          : [],
      [eventData],
    );

  const [
    selectedIndex,
    setSelectedIndex,
  ] =
    useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedIndex(
      0,
    );
  }, [
    isOpen,
    eventData,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    isOpen,
    onClose,
  ]);

  if (
    !isOpen ||
    !eventData
  ) {
    return null;
  }

  const selectedSubmission =
    submissions[
      selectedIndex
    ] ?? null;

  const hasMultipleResponses =
    submissions.length >
    1;

  const responseDate =
    submissions.find(
      (submission) =>
        submission.responseTime,
    )?.responseTime ??
    eventData.responseTime;

  const selectedIsEarlierPrompt =
    selectedSubmission
      ? isEarlierPrompt(
          selectedSubmission,
        )
      : false;

  const goPrevious =
    () => {
      setSelectedIndex(
        (current) =>
          Math.max(
            0,
            current - 1,
          ),
      );
    };

  const goNext =
    () => {
      setSelectedIndex(
        (current) =>
          Math.min(
            submissions.length -
              1,
            current + 1,
          ),
      );
    };

  return (
    <div
      className={
        styles.modalOverlay
      }
      onMouseDown={
        onClose
      }
    >
      <section
        className={
          styles.modalContent
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-detail-title"
        onMouseDown={(
          event,
        ) =>
          event.stopPropagation()
        }
      >
        <header
          className={
            styles.modalHeader
          }
        >
          <div
            className={
              styles.headerCopy
            }
          >
            <div
              className={
                styles.eyebrow
              }
            >
              Response details
            </div>

            <h2
              id="response-detail-title"
              className={
                styles.title
              }
            >
              {
                eventData.moduleName
              }
            </h2>

            <div
              className={
                styles.headerMeta
              }
            >
              <span
                className={
                  styles.participant
                }
              >
                {
                  eventData.extractedStudyId
                }
              </span>

              {eventData.sectionName && (
                <>
                  <span
                    className={
                      styles.metaDivider
                    }
                    aria-hidden="true"
                  >
                    ·
                  </span>

                  <span>
                    {
                      eventData.sectionName
                    }
                  </span>
                </>
              )}

              {responseDate && (
                <>
                  <span
                    className={
                      styles.metaDivider
                    }
                    aria-hidden="true"
                  >
                    ·
                  </span>

                  <span>
                    {formatDate(
                      responseDate,
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className={
              styles.closeButton
            }
            onClick={
              onClose
            }
            aria-label="Close response details"
          >
            ×
          </button>
        </header>

        {hasMultipleResponses && (
          <div
            className={
              styles.responseNavigator
            }
          >
            <div
              className={
                styles.navigatorHeader
              }
            >
              <div>
                <span
                  className={
                    styles.responseCount
                  }
                >
                  {
                    submissions.length
                  }{" "}
                  responses
                </span>

                <span
                  className={
                    styles.navigatorHint
                  }
                >
                  Select a response
                  to inspect it
                  individually.
                </span>
              </div>
            </div>

            <div
              className={
                styles.responseTabs
              }
            >
              {submissions.map(
                (
                  submission,
                  index,
                ) => {
                  const active =
                    index ===
                    selectedIndex;

                  const earlierPrompt =
                    isEarlierPrompt(
                      submission,
                    );

                  return (
                    <button
                      type="button"
                      key={
                        submission.responseTime ??
                        `response-${index}`
                      }
                      className={
                        active
                          ? `${styles.responseTab} ${styles.responseTabActive}`
                          : styles.responseTab
                      }
                      onClick={() =>
                        setSelectedIndex(
                          index,
                        )
                      }
                      aria-pressed={
                        active
                      }
                    >
                      <span
                        className={
                          styles.responseTabNumber
                        }
                      >
                        Response{" "}
                        {index +
                          1}
                      </span>

                      <span
                        className={
                          styles.responseTabTime
                        }
                      >
                        {submission.responseTime
                          ? formatTime(
                              submission.responseTime,
                            )
                          : "Time unavailable"}
                      </span>

                      {earlierPrompt && (
                        <span
                          className={
                            styles.responseTabPrompt
                          }
                        >
                          Earlier prompt
                        </span>
                      )}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}

        {selectedSubmission ? (
          <div
            className={
              styles.responseBody
            }
          >
            <div
              className={
                styles.responseHeader
              }
            >
              <div>
                <div
                  className={
                    styles.responseHeading
                  }
                >
                  {hasMultipleResponses
                    ? `Response ${
                        selectedIndex +
                        1
                      } of ${
                        submissions.length
                      }`
                    : "Response"}
                </div>

                {selectedIsEarlierPrompt && (
                  <div
                    className={
                      styles.promptBadge
                    }
                  >
                    Earlier prompt
                  </div>
                )}
              </div>

              {hasMultipleResponses && (
                <div
                  className={
                    styles.stepControls
                  }
                >
                  <button
                    type="button"
                    className={
                      styles.stepButton
                    }
                    onClick={
                      goPrevious
                    }
                    disabled={
                      selectedIndex ===
                      0
                    }
                  >
                    ← Previous
                  </button>

                  <button
                    type="button"
                    className={
                      styles.stepButton
                    }
                    onClick={
                      goNext
                    }
                    disabled={
                      selectedIndex ===
                      submissions.length -
                        1
                    }
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>

            <div
              className={
                styles.timingSection
              }
            >
              <div
                className={
                  styles.timingItem
                }
              >
                <span
                  className={
                    styles.timingLabel
                  }
                >
                  Submitted
                </span>

                <span
                  className={
                    styles.timingValue
                  }
                >
                  {selectedSubmission.responseTime
                    ? formatDateTime(
                        selectedSubmission.responseTime,
                      )
                    : "Unavailable"}
                </span>
              </div>

              <div
                className={
                  styles.timingItem
                }
              >
                <span
                  className={
                    styles.timingLabel
                  }
                >
                  Scheduled for
                </span>

                <span
                  className={
                    styles.timingValue
                  }
                >
                  {selectedSubmission.alertTime
                    ? formatDateTime(
                        selectedSubmission.alertTime,
                      )
                    : "Unavailable"}
                </span>
              </div>
            </div>

            <div
              className={
                styles.answers
              }
            >
              {selectedSubmission
                .answers.length >
              0 ? (
                selectedSubmission.answers.map(
                  (
                    item,
                    index,
                  ) => {
                    const missing =
                      isAnswerEmpty(
                        item.answer,
                      );

                    return (
                      <div
                        className={
                          styles.answerRow
                        }
                        key={`${item.question}-${index}`}
                      >
                        <div
                          className={
                            styles.question
                          }
                        >
                          {
                            item.question
                          }
                        </div>

                        <div
                          className={
                            missing
                              ? `${styles.answer} ${styles.answerMissing}`
                              : `${styles.answer} ${styles.answerFilled}`
                          }
                        >
                          {missing ? (
                            <span
                              className={
                                styles.missingLabel
                              }
                            >
                              Missing
                            </span>
                          ) : (
                            <ResponseValue
                              value={
                                item.answer
                              }
                            />
                          )}
                        </div>
                      </div>
                    );
                  },
                )
              ) : (
                <div
                  className={
                    styles.emptyState
                  }
                >
                  No detailed
                  responses are
                  available for
                  this submission.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={
              styles.emptyState
            }
          >
            No detailed responses
            available.
          </div>
        )}
      </section>
    </div>
  );
};

export default EventDetail;