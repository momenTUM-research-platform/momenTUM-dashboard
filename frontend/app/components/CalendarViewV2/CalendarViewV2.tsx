"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import FullCalendar, {
  EventClickArg,
} from "@fullcalendar/react";

import type {
  CalendarApi,
  DateClickArg,
  DatesSetArg,
  EventContentArg,
} from "@fullcalendar/core";

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import {
  CalendarNote,
  createCalendarNote,
  deleteCalendarNote,
  fetchCalendarNotes,
  updateCalendarNote,
} from "@/app/lib/calendarNotes";

import { LabeledSurveyResponseOut } from "@/app/types/schemas";

import EventDetail, {
  ExtendedEventProps,
} from "../EventDetail/EventDetail";

import NoteModal, {
  NoteParticipant,
} from "../NoteModal/NoteModal";

import NoteViewerModal from "../NoteModal/NoteViewerModal";

import styles from "./CalendarViewV2.module.css";

type Mapping = Record<
  string,
  string
>;

export type CalendarVisibleRange = {
  from: string;
  to: string;
  focusDate: string;
};

type Props = {
  studyId: string;

  rows: LabeledSurveyResponseOut[];

  mapping?: Mapping;

  mappingName?: string;

  loading?: boolean;

  initialDate?: string;

  onRangeChange?: (
    range: CalendarVisibleRange,
  ) => void;
};

type AggregatedAnswer = {
  answers: unknown[];
  responseTimes: string[];
  alertTimes: Array<
    string | null
  >;
};

type Bucket = {
  user_id: string;

  mapped_label:
    | string
    | null;

  module_id: string;

  module_name: string;

  date: string;

  aggregated: Record<
    string,
    AggregatedAnswer
  >;

  response_times: string[];

  alert_times: Array<
    string | null
  >;
};

type NoteRange = {
  from: string;
  to: string;
};

type ResponseTimeBounds = {
  start: string;
  end: string;
};

type ParticipantColor = {
  background: string;
  border: string;
};

const MIN_RESPONSE_EVENT_DURATION_MS =
  20 * 60 * 1000;

const PARTICIPANT_COLORS: ParticipantColor[] = [
  {
    background: "#eef1fa",
    border: "#c9d0e8",
  },
  {
    background: "#edf5f1",
    border: "#c3d9cd",
  },
  {
    background: "#f6f0e9",
    border: "#ddcdbb",
  },
  {
    background: "#f3eef6",
    border: "#d6c7df",
  },
  {
    background: "#edf4f6",
    border: "#c4d8dd",
  },
  {
    background: "#f7eeee",
    border: "#dfc6c6",
  },
  {
    background: "#f4f3e9",
    border: "#d9d5b7",
  },
  {
    background: "#eef4ec",
    border: "#c8d8c2",
  },
  {
    background: "#f1eff8",
    border: "#cec9e4",
  },
  {
    background: "#f6f1ed",
    border: "#ddcec4",
  },
];

function getParticipantColor(
  userId: string,
): ParticipantColor {
  let hash = 0;

  for (
    let index = 0;
    index < userId.length;
    index += 1
  ) {
    hash =
      (
        hash * 31 +
        userId.charCodeAt(
          index,
        )
      ) >>> 0;
  }

  return PARTICIPANT_COLORS[
    hash %
      PARTICIPANT_COLORS.length
  ];
}

function localDateKey(
  value: string | Date,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

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

function getResponseTimeBounds(
  times: string[],
): ResponseTimeBounds | null {
  const validTimes =
    times
      .map(
        (value) => ({
          value,

          date:
            new Date(
              value,
            ),

          timestamp:
            new Date(
              value,
            ).getTime(),
        }),
      )
      .filter(
        (
          entry,
        ): entry is {
          value: string;
          date: Date;
          timestamp: number;
        } =>
          Number.isFinite(
            entry.timestamp,
          ),
      )
      .sort(
        (a, b) =>
          a.timestamp -
          b.timestamp,
      );

  if (
    validTimes.length ===
    0
  ) {
    return null;
  }

  const first =
    validTimes[0];

  const last =
    validTimes[
      validTimes.length - 1
    ];

  /*
   * Very short response groups receive a minimum visual duration
   * in week/day views. Keep that synthetic duration inside the
   * actual submission day so late-night responses never spill
   * visually into the following date.
   */
  const nextLocalMidnight =
    new Date(
      first.date.getFullYear(),
      first.date.getMonth(),
      first.date.getDate() + 1,
      0,
      0,
      0,
      0,
    ).getTime();

  const desiredEnd =
    Math.max(
      last.timestamp,
      first.timestamp +
        MIN_RESPONSE_EVENT_DURATION_MS,
    );

  const visualEnd =
    Math.min(
      desiredEnd,
      nextLocalMidnight,
    );

  return {
    start:
      new Date(
        first.timestamp,
      ).toISOString(),

    end:
      new Date(
        visualEnd,
      ).toISOString(),
  };
}

function getEarlierPromptCount(
  bucket: Bucket,
): number {
  let count = 0;

  for (
    let index = 0;
    index <
    bucket.response_times.length;
    index += 1
  ) {
    const responseTime =
      bucket.response_times[
        index
      ];

    const alertTime =
      bucket.alert_times[
        index
      ];

    if (
      !responseTime ||
      !alertTime
    ) {
      continue;
    }

    const responseDate =
      localDateKey(
        responseTime,
      );

    const scheduledDate =
      localDateKey(
        alertTime,
      );

    if (
      scheduledDate <
      responseDate
    ) {
      count += 1;
    }
  }

  return count;
}

function bucketToExtended(
  bucket: Bucket,
): ExtendedEventProps {
  const details: Record<
    string,
    unknown
  > = {};

  for (const [
    question,
    aggregate,
  ] of Object.entries(
    bucket.aggregated,
  )) {
    details[question] = {
      answers:
        aggregate.answers,

      responseTimes:
        aggregate.responseTimes,

      alertTimes:
        aggregate.alertTimes,
    };
  }

  const validTimes =
    bucket.response_times
      .map(
        (value) =>
          new Date(
            value,
          ).getTime(),
      )
      .filter(
        Number.isFinite,
      );

  const responseTime =
    validTimes.length >
    0
      ? new Date(
          Math.max(
            ...validTimes,
          ),
        ).toISOString()
      : undefined;

  return {
    extractedStudyId:
      bucket.mapped_label ??
      bucket.user_id,

    moduleName:
      bucket.module_name,

    responseTime,

    details,

    type: "structured",
  };
}

function formatTime(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function getTimeRange(
  times: string[],
): string {
  const sorted =
    times
      .map(
        (value) => ({
          value,

          timestamp:
            new Date(
              value,
            ).getTime(),
        }),
      )
      .filter(
        (entry) =>
          Number.isFinite(
            entry.timestamp,
          ),
      )
      .sort(
        (a, b) =>
          a.timestamp -
          b.timestamp,
      );

  if (
    sorted.length ===
    0
  ) {
    return "";
  }

  const first =
    formatTime(
      sorted[0].value,
    );

  if (
    sorted.length ===
    1
  ) {
    return first;
  }

  const last =
    formatTime(
      sorted[
        sorted.length - 1
      ].value,
    );

  return first === last
    ? first
    : `${first}–${last}`;
}

function formatRangeLabel(
  start: Date,
  endExclusive: Date,
): string {
  const end =
    new Date(
      endExclusive.getTime() -
        1,
    );

  const formatter =
    new Intl.DateTimeFormat(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    );

  return `${formatter.format(
    start,
  )} – ${formatter.format(
    end,
  )}`;
}

export default function CalendarViewV2({
  studyId,
  rows,
  mapping,
  mappingName = "Participant ID",
  loading = false,
  initialDate,
  onRangeChange,
}: Props) {
  const calendarRef =
    useRef<FullCalendar | null>(
      null,
    );

  const appliedInitialDate =
    useRef(false);

  const noteRequestId =
    useRef(0);

  const [
    detailOpen,
    setDetailOpen,
  ] =
    useState(false);

  const [
    detailData,
    setDetailData,
  ] =
    useState<
      ExtendedEventProps | null
    >(null);

  const [
    rangeLabel,
    setRangeLabel,
  ] =
    useState("");

  const [
    noteRange,
    setNoteRange,
  ] =
    useState<NoteRange | null>(
      null,
    );

  const [
    notes,
    setNotes,
  ] =
    useState<CalendarNote[]>(
      [],
    );

  const [
    notesLoading,
    setNotesLoading,
  ] =
    useState(false);

  const [
    noteError,
    setNoteError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    addNoteOpen,
    setAddNoteOpen,
  ] =
    useState(false);

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState("");

  const [
    savingNote,
    setSavingNote,
  ] =
    useState(false);

  const [
    selectedNote,
    setSelectedNote,
  ] =
    useState<
      CalendarNote | null
    >(null);

  const [
    viewerOpen,
    setViewerOpen,
  ] =
    useState(false);

  const [
    updatingNote,
    setUpdatingNote,
  ] =
    useState(false);

  const [
    deletingNote,
    setDeletingNote,
  ] =
    useState(false);

  const participants =
    useMemo<
      NoteParticipant[]
    >(() => {
      const userIds =
        new Set<string>();

      for (const row of rows) {
        userIds.add(
          row.user_id,
        );
      }

      if (mapping) {
        for (const userId of
          Object.keys(mapping)) {
          userIds.add(
            userId,
          );
        }
      }

      return Array.from(
        userIds,
      )
        .map(
          (userId) => {
            const mapped =
              mapping?.[
                userId
              ];

            return {
              userId,

              label:
                mapped &&
                mapped !==
                  userId
                  ? `${mapped} · ${userId}`
                  : userId,
            };
          },
        )
        .sort(
          (a, b) =>
            a.label.localeCompare(
              b.label,
            ),
        );
    }, [
      rows,
      mapping,
    ]);

  const participantLabelById =
    useMemo(() => {
      const labels =
        new Map<
          string,
          string
        >();

      for (const participant of
        participants) {
        labels.set(
          participant.userId,
          mapping?.[
            participant.userId
          ] ??
            participant.userId,
        );
      }

      return labels;
    }, [
      participants,
      mapping,
    ]);

  const buckets =
    useMemo(() => {
      const result =
        new Map<
          string,
          Bucket
        >();

      for (const row of rows) {
        const date =
          localDateKey(
            row.response_time,
          );

        const key = [
          row.user_id,
          row.module_id,
          date,
        ].join("|");

        const mappedLabel =
          mapping?.[
            row.user_id
          ] ?? null;

        let bucket =
          result.get(key);

        if (!bucket) {
          bucket = {
            user_id:
              row.user_id,

            mapped_label:
              mappedLabel,

            module_id:
              row.module_id,

            module_name:
              row.module_name,

            date,

            aggregated: {},

            response_times:
              [],

            alert_times:
              [],
          };

          result.set(
            key,
            bucket,
          );
        }

        if (
          !bucket.mapped_label &&
          mappedLabel
        ) {
          bucket.mapped_label =
            mappedLabel;
        }

        const responseTime =
          String(
            row.response_time,
          );

        const alertTime =
          row.alert_time
            ? String(
                row.alert_time,
              )
            : null;

        bucket.response_times.push(
          responseTime,
        );

        bucket.alert_times.push(
          alertTime,
        );

        for (const answer of
          row.answers) {
          const question =
            answer.question_text ??
            answer.question_id;

          if (
            !bucket.aggregated[
              question
            ]
          ) {
            bucket.aggregated[
              question
            ] = {
              answers: [],

              responseTimes:
                [],

              alertTimes:
                [],
            };
          }

          bucket.aggregated[
            question
          ].answers.push(
            answer.answer,
          );

          bucket.aggregated[
            question
          ].responseTimes.push(
            responseTime,
          );

          bucket.aggregated[
            question
          ].alertTimes.push(
            alertTime,
          );
        }
      }

      return Array.from(
        result.values(),
      );
    }, [
      rows,
      mapping,
    ]);

  const responseEvents =
    useMemo(
      () =>
        buckets.flatMap(
          (bucket) => {
            const timeBounds =
              getResponseTimeBounds(
                bucket.response_times,
              );

            if (!timeBounds) {
              return [];
            }

            const participant =
              bucket.mapped_label ??
              bucket.user_id;

            const participantColor =
              getParticipantColor(
                bucket.user_id,
              );

            const submissionCount =
              bucket
                .response_times
                .length;

            const earlierPromptCount =
              getEarlierPromptCount(
                bucket,
              );

            return [
              {
                id: `response:${[
                  bucket.user_id,
                  bucket.module_id,
                  bucket.date,
                ].join("|")}`,

                title:
                  bucket.module_name,

                start:
                  timeBounds.start,

                end:
                  timeBounds.end,

                allDay: false,

                backgroundColor:
                  participantColor.background,

                borderColor:
                  participantColor.border,

                textColor:
                  "var(--text-primary)",

                extendedProps: {
                  kind:
                    "response",

                  bucket,

                  participant,

                  submissionCount,

                  earlierPromptCount,

                  timeRange:
                    getTimeRange(
                      bucket.response_times,
                    ),
                },
              },
            ];
          },
        ),
      [buckets],
    );

  const noteEvents =
    useMemo(
      () =>
        notes.map(
          (note) => {
            const participant =
              note.user_id
                ? participantLabelById.get(
                    note.user_id,
                  ) ??
                  note.user_id
                : null;

            return {
              id:
                `note:${note.id}`,

              title:
                note.text,

              start:
                note.date,

              allDay: true,

              backgroundColor:
                "var(--warning-subtle)",

              borderColor:
                "var(--warning-border)",

              textColor:
                "var(--text-primary)",

              extendedProps: {
                kind:
                  "note",

                note,

                participant,
              },
            };
          },
        ),
      [
        notes,
        participantLabelById,
      ],
    );

  const events =
    useMemo(
      () => [
        ...responseEvents,
        ...noteEvents,
      ],
      [
        responseEvents,
        noteEvents,
      ],
    );

  async function loadNotes(
    range:
      | NoteRange
      | null = noteRange,
  ) {
    if (!range) {
      return;
    }

    const requestId =
      ++noteRequestId.current;

    setNotesLoading(
      true,
    );

    setNoteError(
      null,
    );

    try {
      const response =
        await fetchCalendarNotes(
          studyId,
          {
            from_date:
              range.from,

            to_date:
              range.to,
          },
        );

      if (
        requestId !==
        noteRequestId.current
      ) {
        return;
      }

      setNotes(
        response,
      );
    } catch (
      caughtError: any
    ) {
      if (
        requestId !==
        noteRequestId.current
      ) {
        return;
      }

      setNoteError(
        caughtError?.message ??
          "Failed to load calendar notes.",
      );

      setNotes(
        [],
      );
    } finally {
      if (
        requestId ===
        noteRequestId.current
      ) {
        setNotesLoading(
          false,
        );
      }
    }
  }

  useEffect(() => {
    if (!noteRange) {
      return;
    }

    void loadNotes(
      noteRange,
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    studyId,
    noteRange?.from,
    noteRange?.to,
  ]);

  useEffect(() => {
    if (
      !initialDate ||
      appliedInitialDate.current
    ) {
      return;
    }

    const applyDate =
      () => {
        const api:
          | CalendarApi
          | undefined =
          calendarRef.current?.getApi();

        if (!api) {
          return false;
        }

        api.gotoDate(
          initialDate,
        );

        appliedInitialDate.current =
          true;

        return true;
      };

    if (applyDate()) {
      return;
    }

    const frame =
      requestAnimationFrame(
        applyDate,
      );

    return () =>
      cancelAnimationFrame(
        frame,
      );
  }, [
    initialDate,
  ]);

  const handleDatesSet = (
    arg: DatesSetArg,
  ) => {
    setRangeLabel(
      formatRangeLabel(
        arg.start,
        arg.end,
      ),
    );

    const inclusiveEnd =
      new Date(
        arg.end.getTime() -
          1,
      );

    setNoteRange({
      from:
        localDateKey(
          arg.start,
        ),

      to:
        localDateKey(
          inclusiveEnd,
        ),
    });

    onRangeChange?.({
      from:
        arg.start.toISOString(),

      to:
        inclusiveEnd.toISOString(),

      focusDate:
        arg.view.currentStart.toISOString(),
    });
  };

  const handleDateClick = (
    arg: DateClickArg,
  ) => {
    setSelectedDate(
      arg.dateStr.slice(
        0,
        10,
      ),
    );

    setNoteError(
      null,
    );

    setAddNoteOpen(
      true,
    );
  };

  const handleEventClick = (
    arg: EventClickArg,
  ) => {
    const kind =
      arg.event
        .extendedProps
        .kind;

    if (
      kind === "note"
    ) {
      const note =
        arg.event
          .extendedProps
          .note as CalendarNote;

      setSelectedNote(
        note,
      );

      setNoteError(
        null,
      );

      setViewerOpen(
        true,
      );

      return;
    }

    const bucket =
      arg.event
        .extendedProps
        .bucket as Bucket;

    setDetailData(
      bucketToExtended(
        bucket,
      ),
    );

    setDetailOpen(
      true,
    );
  };

  const saveNewNote =
    async (input: {
      userId:
        | string
        | null;

      text: string;
    }) => {
      if (
        !selectedDate
      ) {
        return;
      }

      setSavingNote(
        true,
      );

      setNoteError(
        null,
      );

      try {
        const created =
          await createCalendarNote(
            studyId,
            {
              date:
                selectedDate,

              user_id:
                input.userId,

              text:
                input.text,
            },
          );

        setNotes(
          (previous) => [
            ...previous,
            created,
          ],
        );

        setAddNoteOpen(
          false,
        );
      } catch (
        caughtError: any
      ) {
        setNoteError(
          caughtError?.message ??
            "Failed to save note.",
        );
      } finally {
        setSavingNote(
          false,
        );
      }
    };

  const saveExistingNote =
    async (
      text: string,
    ) => {
      if (
        !selectedNote
      ) {
        return;
      }

      setUpdatingNote(
        true,
      );

      setNoteError(
        null,
      );

      try {
        const updated =
          await updateCalendarNote(
            studyId,
            selectedNote.id,
            text,
          );

        setNotes(
          (previous) =>
            previous.map(
              (note) =>
                note.id ===
                updated.id
                  ? updated
                  : note,
            ),
        );

        setSelectedNote(
          updated,
        );
      } catch (
        caughtError: any
      ) {
        setNoteError(
          caughtError?.message ??
            "Failed to update note.",
        );
      } finally {
        setUpdatingNote(
          false,
        );
      }
    };

  const removeNote =
    async () => {
      if (
        !selectedNote
      ) {
        return;
      }

      setDeletingNote(
        true,
      );

      setNoteError(
        null,
      );

      try {
        await deleteCalendarNote(
          studyId,
          selectedNote.id,
        );

        setNotes(
          (previous) =>
            previous.filter(
              (note) =>
                note.id !==
                selectedNote.id,
            ),
        );

        setViewerOpen(
          false,
        );

        setSelectedNote(
          null,
        );
      } catch (
        caughtError: any
      ) {
        setNoteError(
          caughtError?.message ??
            "Failed to delete note.",
        );
      } finally {
        setDeletingNote(
          false,
        );
      }
    };

  const renderEventContent = (
    arg: EventContentArg,
  ) => {
    const kind =
      arg.event
        .extendedProps
        .kind;

    if (
      kind === "note"
    ) {
      const {
        note,
        participant,
      } =
        arg.event
          .extendedProps as {
          note: CalendarNote;

          participant:
            | string
            | null;
        };

      return (
        <div
          className={
            styles.noteEventContent
          }
          title={
            note.text
          }
        >
          <div
            className={
              styles.noteEventHeader
            }
          >
            <span
              className={
                styles.noteMarker
              }
              aria-hidden="true"
            >
              N
            </span>

            <span>
              {participant ??
                "Study note"}
            </span>
          </div>

          <div
            className={
              styles.notePreview
            }
          >
            {note.text}
          </div>
        </div>
      );
    }

    const {
      participant,
      submissionCount,
      earlierPromptCount,
      timeRange,
    } =
      arg.event
        .extendedProps as {
        participant: string;

        submissionCount: number;

        earlierPromptCount: number;

        timeRange: string;
      };

    return (
      <div
        className={
          styles.eventContent
        }
      >
        <div
          className={
            styles.eventModule
          }
          title={
            arg.event.title
          }
        >
          {arg.event.title}
        </div>

        <div
          className={
            styles.eventParticipant
          }
          title={
            participant
          }
        >
          {participant}
        </div>

        <div
          className={
            styles.eventMeta
          }
        >
          <span>
            {submissionCount}{" "}
            {submissionCount ===
            1
              ? "response"
              : "responses"}
          </span>

          {timeRange && (
            <>
              <span
                className={
                  styles.metaSeparator
                }
                aria-hidden="true"
              >
                ·
              </span>

              <span>
                {timeRange}
              </span>
            </>
          )}
        </div>

        {earlierPromptCount >
          0 && (
          <div
            className={
              styles.eventScheduleMeta
            }
          >
            {earlierPromptCount}{" "}
            {earlierPromptCount ===
            1
              ? "earlier prompt"
              : "earlier prompts"}
          </div>
        )}
      </div>
    );
  };

  const selectedNoteParticipantLabel =
    selectedNote
      ?.user_id
      ? participantLabelById.get(
          selectedNote.user_id,
        ) ??
        selectedNote.user_id
      : undefined;

  return (
    <div
      className={
        styles.root
      }
    >
      <div
        className={
          styles.calendarHeader
        }
      >
        <div>
          <h3
            className={
              styles.heading
            }
          >
            Response calendar
          </h3>

          <p
            className={
              styles.description
            }
          >
            Responses are grouped
            by participant,
            module, and actual
            submission day.
            Click an empty area
            of a date to add a
            researcher note.
          </p>
        </div>

        {rangeLabel && (
          <span
            className={
              styles.rangeLabel
            }
          >
            {rangeLabel}
          </span>
        )}
      </div>

      <div
        className={
          styles.calendarStatus
        }
      >
        {loading ? (
          <span>
            Loading responses
            for this period…
          </span>
        ) : (
          <span>
            {rows.length}{" "}
            {rows.length ===
            1
              ? "response record"
              : "response records"}{" "}
            in the visible period
          </span>
        )}

        <span
          className={
            styles.statusSeparator
          }
          aria-hidden="true"
        >
          ·
        </span>

        {notesLoading ? (
          <span>
            Loading notes…
          </span>
        ) : (
          <span>
            {notes.length}{" "}
            {notes.length ===
            1
              ? "note"
              : "notes"}
          </span>
        )}
      </div>

      {noteError &&
        !addNoteOpen &&
        !viewerOpen && (
          <div
            className={
              styles.noteError
            }
            role="alert"
          >
            {noteError}
          </div>
        )}

      <div
        className={
          styles.calendar
        }
      >
        <FullCalendar
          ref={
            calendarRef
          }
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          headerToolbar={{
            left:
              "prev,next today",

            center:
              "title",

            right:
              "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          datesSet={
            handleDatesSet
          }
          dateClick={
            handleDateClick
          }
          events={
            events
          }
          eventClick={
            handleEventClick
          }
          eventContent={
            renderEventContent
          }
          dayMaxEvents={
            4
          }
          moreLinkClick="popover"
          fixedWeekCount={
            false
          }
          height="auto"
          eventDisplay="block"
        />
      </div>

      <div
        className={
          styles.calendarFooter
        }
      >
        <p
          className={
            styles.calendarHint
          }
        >
          Responses are placed
          according to when they
          were submitted. If a
          participant completes a
          prompt scheduled for an
          earlier day, the calendar
          marks it as an earlier
          prompt. Week and day
          views use recorded
          submission times.
          Researcher notes remain
          date-level annotations
          in the all-day area.
        </p>

        {mapping && (
          <p
            className={
              styles.mappingHint
            }
          >
            Participant labels
            use{" "}
            <strong>
              {mappingName}
            </strong>{" "}
            where available,
            with the internal
            user ID as fallback.
          </p>
        )}
      </div>

      <EventDetail
        isOpen={
          detailOpen
        }
        onClose={() =>
          setDetailOpen(
            false,
          )
        }
        eventData={
          detailData
        }
      />

      <NoteModal
        isOpen={
          addNoteOpen
        }
        selectedDate={
          selectedDate
        }
        participants={
          participants
        }
        saving={
          savingNote
        }
        error={
          addNoteOpen
            ? noteError
            : null
        }
        onClose={() => {
          if (
            savingNote
          ) {
            return;
          }

          setAddNoteOpen(
            false,
          );

          setNoteError(
            null,
          );
        }}
        onSave={
          saveNewNote
        }
      />

      <NoteViewerModal
        isOpen={
          viewerOpen
        }
        note={
          selectedNote
        }
        participantLabel={
          selectedNoteParticipantLabel
        }
        saving={
          updatingNote
        }
        deleting={
          deletingNote
        }
        error={
          viewerOpen
            ? noteError
            : null
        }
        onClose={() => {
          if (
            updatingNote ||
            deletingNote
          ) {
            return;
          }

          setViewerOpen(
            false,
          );

          setSelectedNote(
            null,
          );

          setNoteError(
            null,
          );
        }}
        onSave={
          saveExistingNote
        }
        onDelete={
          removeNote
        }
      />
    </div>
  );
}