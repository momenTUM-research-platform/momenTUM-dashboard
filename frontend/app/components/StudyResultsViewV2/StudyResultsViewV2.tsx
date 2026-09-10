"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AdherencePanel from "../AdherencePanel/AdherencePanel";
import EventTimeline from "../EventTimeline/EventTimeline";

import CalendarViewV2, {
  CalendarVisibleRange,
} from "@/app/components/CalendarViewV2/CalendarViewV2";

import SleepVizPanel from "@/app/components/SleepViz/SleepVizPanel";
import TableViewV2 from "@/app/components/TableViewV2/TableViewV2";

import {
  downloadResponsesCsv,
  Facets,
  fetchFacets,
  fetchLabeledResponses,
  fetchStudyQuestions,
  fetchUserMapping,
  ResponsePlatform,
  StudyQuestion,
} from "@/app/lib/responses";

import {
  LabeledSurveyResponseOut,
} from "@/app/types/schemas";

import styles from "./StudyResultsViewV2.module.css";

type Props = {
  studyId: string;
};

type ActiveView =
  | "table"
  | "calendar"
  | "visualize"
  | "adherence"
  | "events";

type ExportScope =
  | "current"
  | "all";

const TABLE_PAGE_SIZE = 100;
const EVENTS_ROW_LIMIT = 5000;

function ViewIcon({
  view,
}: {
  view: ActiveView;
}) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const,
    "aria-hidden":
      true as const,
  };

  switch (view) {
    case "calendar":
      return (
        <svg {...commonProps}>
          <rect
            x="3"
            y="5"
            width="18"
            height="16"
            rx="2"
          />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );

    case "table":
      return (
        <svg {...commonProps}>
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="1"
          />
          <path d="M3 9h18M8 4v16" />
        </svg>
      );

    case "events":
      return (
        <svg {...commonProps}>
          <path d="M7 5h14M7 12h14M7 19h14" />

          <circle
            cx="3"
            cy="5"
            r="1"
            fill="currentColor"
            stroke="none"
          />

          <circle
            cx="3"
            cy="12"
            r="1"
            fill="currentColor"
            stroke="none"
          />

          <circle
            cx="3"
            cy="19"
            r="1"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );

    case "adherence":
      return (
        <svg {...commonProps}>
          <circle
            cx="12"
            cy="12"
            r="9"
          />
          <path d="m8 12 2.5 2.5L16 9" />
        </svg>
      );

    case "visualize":
      return (
        <svg {...commonProps}>
          <path d="M4 19V10M10 19V5M16 19v-7M22 19H2" />
        </svg>
      );
  }
}

function questionKey(
  question: StudyQuestion,
): string {
  return `${question.module_id}:${question.question_id}`;
}

function looksLikeIdentifierQuestion(
  question: StudyQuestion,
): boolean {
  const searchableText = [
    question.question_text,
    question.question_id,
    question.module_name,
    question.module_id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const idWord =
    /\b(id|ids)\b/;

  const commonIdentifier =
    /(participant|study|subject|user|app|record)\s*id\b/;

  return (
    commonIdentifier.test(
      searchableText,
    ) ||
    idWord.test(
      searchableText,
    ) ||
    searchableText.includes(
      "_id",
    )
  );
}

function parseDateBoundary(
  value?: string | null,
): number | null {
  if (!value) {
    return null;
  }

  const timestamp =
    new Date(value).getTime();

  return Number.isFinite(
    timestamp,
  )
    ? timestamp
    : null;
}

function laterBoundary(
  first?: string,
  second?: string,
): string | undefined {
  const firstTime =
    parseDateBoundary(
      first,
    );

  const secondTime =
    parseDateBoundary(
      second,
    );

  if (
    firstTime === null &&
    secondTime === null
  ) {
    return undefined;
  }

  if (firstTime === null) {
    return second;
  }

  if (secondTime === null) {
    return first;
  }

  return new Date(
    Math.max(
      firstTime,
      secondTime,
    ),
  ).toISOString();
}

function earlierBoundary(
  first?: string,
  second?: string,
): string | undefined {
  const firstTime =
    parseDateBoundary(
      first,
    );

  const secondTime =
    parseDateBoundary(
      second,
    );

  if (
    firstTime === null &&
    secondTime === null
  ) {
    return undefined;
  }

  if (firstTime === null) {
    return second;
  }

  if (secondTime === null) {
    return first;
  }

  return new Date(
    Math.min(
      firstTime,
      secondTime,
    ),
  ).toISOString();
}

function isInvalidRange(
  rangeFrom?: string,
  rangeTo?: string,
): boolean {
  const fromTime =
    parseDateBoundary(
      rangeFrom,
    );

  const toTime =
    parseDateBoundary(
      rangeTo,
    );

  return (
    fromTime !== null &&
    toTime !== null &&
    fromTime > toTime
  );
}

function formatCollapsedDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  ).format(date);
}

function formatPlatform(
  value: ResponsePlatform,
): string {
  if (
    value ===
    "android"
  ) {
    return "Android";
  }

  if (
    value ===
    "iphone"
  ) {
    return "iPhone";
  }

  return "Unknown / other";
}

export default function StudyResultsViewV2({
  studyId,
}: Props) {
  const [
    rows,
    setRows,
  ] =
    useState<
      LabeledSurveyResponseOut[] | null
    >(null);

  const [
    facets,
    setFacets,
  ] =
    useState<Facets | null>(
      null,
    );

  const [
    questions,
    setQuestions,
  ] =
    useState<
      StudyQuestion[] | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    facetsLoading,
    setFacetsLoading,
  ] =
    useState(false);

  const [
    questionsLoading,
    setQuestionsLoading,
  ] =
    useState(false);

  const [
    mappingLoading,
    setMappingLoading,
  ] =
    useState(false);

  const [
    exporting,
    setExporting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    exportError,
    setExportError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    userIds,
    setUserIds,
  ] =
    useState<string[]>([]);

  const [
    moduleIds,
    setModuleIds,
  ] =
    useState<string[]>([]);

  const [
    platform,
    setPlatform,
  ] =
    useState<
      ResponsePlatform | ""
    >("");

  const [
    from,
    setFrom,
  ] =
    useState("");

  const [
    to,
    setTo,
  ] =
    useState("");

  const [
    mappedIds,
    setMappedIds,
  ] =
    useState<string[]>([]);

  const [
    mapKey,
    setMapKey,
  ] =
    useState("");

  const [
    userMap,
    setUserMap,
  ] =
    useState<Record<
      string,
      string
    > | null>(null);

  const [
    activeView,
    setActiveView,
  ] =
    useState<ActiveView>(
      "calendar",
    );

  const [
    page,
    setPage,
  ] =
    useState(1);

  const [
    calendarRange,
    setCalendarRange,
  ] =
    useState<CalendarVisibleRange | null>(
      null,
    );

  const [
    calendarInitialDate,
    setCalendarInitialDate,
  ] =
    useState<string | null>(
      null,
    );

  const [
    showAdditionalFilters,
    setShowAdditionalFilters,
  ] =
    useState(false);

  const [
    showExportOptions,
    setShowExportOptions,
  ] =
    useState(false);

  const [
    exportScope,
    setExportScope,
  ] =
    useState<ExportScope>(
      "current",
    );

  const [
    includeNotes,
    setIncludeNotes,
  ] =
    useState(false);

  const rowsRequestId =
    useRef(0);

  const facetsRequestId =
    useRef(0);

  const calendarAnchorRequestId =
    useRef(0);

  const exportAreaRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const distinctUsers =
    useMemo(
      () =>
        facets?.users ?? [],
      [facets],
    );

  const distinctModules =
    useMemo(
      () =>
        facets?.modules ?? [],
      [facets],
    );

  const participantIdQuestions =
    useMemo(() => {
      if (!questions) {
        return [];
      }

      return questions.filter(
        (question) =>
          question.role ===
          "participant_id",
      );
    }, [questions]);

  const hasAutomaticParticipantId =
    participantIdQuestions.length ===
    1;

  const hasAmbiguousParticipantIds =
    participantIdQuestions.length >
    1;

  const selectedQuestion:
    | StudyQuestion
    | null =
    useMemo(() => {
      if (
        !questions ||
        !mapKey
      ) {
        return null;
      }

      const [
        moduleId,
        questionId,
      ] =
        mapKey.split(":");

      return (
        questions.find(
          (question) =>
            question.module_id ===
              moduleId &&
            question.question_id ===
              questionId,
        ) ?? null
      );
    }, [
      questions,
      mapKey,
    ]);

  const distinctMappedIds =
    useMemo(() => {
      if (!userMap) {
        return [];
      }

      const values =
        Object.values(
          userMap,
        ).filter(
          (value) =>
            value &&
            value.trim() !==
              "",
        );

      return Array.from(
        new Set(values),
      ).sort(
        (a, b) =>
          a.localeCompare(b),
      );
    }, [userMap]);

  const mappedUserIds =
    useMemo(() => {
      if (
        !userMap ||
        mappedIds.length ===
          0
      ) {
        return [];
      }

      return Object.entries(
        userMap,
      )
        .filter(
          ([
            ,
            label,
          ]) =>
            mappedIds.includes(
              label,
            ),
        )
        .map(
          ([
            userId,
          ]) =>
            userId,
        );
    }, [
      userMap,
      mappedIds,
    ]);

  const effectiveUserIds =
    useMemo(() => {
      if (
        mappedIds.length ===
        0
      ) {
        return userIds;
      }

      if (!userMap) {
        return [];
      }

      if (
        userIds.length ===
        0
      ) {
        return mappedUserIds;
      }

      const mappedSet =
        new Set(
          mappedUserIds,
        );

      return userIds.filter(
        (userId) =>
          mappedSet.has(
            userId,
          ),
      );
    }, [
      userIds,
      mappedIds,
      mappedUserIds,
      userMap,
    ]);

  const hasImpossibleUserFilter =
    useMemo(() => {
      if (
        mappedIds.length >
          0 &&
        !userMap
      ) {
        return true;
      }

      if (
        mappedIds.length >
          0 &&
        mappedUserIds.length ===
          0
      ) {
        return true;
      }

      if (
        mappedIds.length >
          0 &&
        userIds.length >
          0 &&
        effectiveUserIds.length ===
          0
      ) {
        return true;
      }

      return false;
    }, [
      mappedIds,
      mappedUserIds,
      userIds,
      effectiveUserIds,
      userMap,
    ]);

  const legacyIdentifierQuestions =
    useMemo(() => {
      if (!questions) {
        return [];
      }

      return questions.filter(
        looksLikeIdentifierQuestion,
      );
    }, [questions]);

  const selectableIdentifierQuestions =
    useMemo(() => {
      if (
        hasAmbiguousParticipantIds
      ) {
        return participantIdQuestions;
      }

      if (
        participantIdQuestions.length ===
        0
      ) {
        return legacyIdentifierQuestions;
      }

      return [];
    }, [
      hasAmbiguousParticipantIds,
      participantIdQuestions,
      legacyIdentifierQuestions,
    ]);

  const questionsByModule =
    useMemo(() => {
      const grouped =
        new Map<
          string,
          {
            module_id: string;
            module_name: string;
            items: StudyQuestion[];
          }
        >();

      for (
        const question
        of selectableIdentifierQuestions
      ) {
        if (
          !grouped.has(
            question.module_id,
          )
        ) {
          grouped.set(
            question.module_id,
            {
              module_id:
                question.module_id,

              module_name:
                question.module_name,

              items: [],
            },
          );
        }

        grouped
          .get(
            question.module_id,
          )!
          .items.push(
            question,
          );
      }

      const groups =
        Array.from(
          grouped.values(),
        ).sort(
          (a, b) =>
            (
              a.module_name ||
              ""
            ).localeCompare(
              b.module_name ||
                "",
            ),
        );

      for (
        const group
        of groups
      ) {
        group.items.sort(
          (a, b) =>
            (
              a.question_text ||
              ""
            ).localeCompare(
              b.question_text ||
                "",
            ),
        );
      }

      return groups;
    }, [
      selectableIdentifierQuestions,
    ]);

  const mappingLabel =
    selectedQuestion
      ?.question_text ||
    (
      participantIdQuestions.length >
      0
        ? "Participant ID"
        : "Mapped ID"
    );

  const responsePlatformView =
    activeView ===
      "calendar" ||
    activeView ===
      "table";

  const activeFilterCount =
    userIds.length +
    mappedIds.length +
    moduleIds.length +
    (
      platform &&
      responsePlatformView
        ? 1
        : 0
    ) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const additionalFilterCount =
    moduleIds.length +
    (
      platform &&
      responsePlatformView
        ? 1
        : 0
    ) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  const hasActiveFilters =
    activeFilterCount > 0;

  const exportCurrentUnavailable =
    exportScope ===
      "current" &&
    hasImpossibleUserFilter;

  const effectivePlatform =
    responsePlatformView &&
    platform
      ? platform
      : undefined;

  async function loadStandardRows(
    pageArg = page,
  ) {
    const requestId =
      ++rowsRequestId.current;

    if (
      hasImpossibleUserFilter
    ) {
      setRows([]);
      setLoading(false);
      setError(null);

      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isEventsView =
        activeView ===
        "events";

      const response =
        await fetchLabeledResponses(
          studyId,
          {
            user_id:
              effectiveUserIds.length >
              0
                ? effectiveUserIds
                : undefined,

            module_id:
              moduleIds.length >
              0
                ? moduleIds
                : undefined,

            platform:
              isEventsView
                ? undefined
                : effectivePlatform,

            from:
              from ||
              undefined,

            to:
              to ||
              undefined,

            sort:
              "desc",

            skip:
              isEventsView
                ? 0
                : (
                    pageArg -
                    1
                  ) *
                  TABLE_PAGE_SIZE,

            limit:
              isEventsView
                ? EVENTS_ROW_LIMIT
                : TABLE_PAGE_SIZE,
          },
        );

      if (
        requestId !==
        rowsRequestId.current
      ) {
        return;
      }

      setRows(
        response,
      );
    } catch (
      caughtError: any
    ) {
      if (
        requestId !==
        rowsRequestId.current
      ) {
        return;
      }

      setError(
        caughtError?.message ??
          "Failed to load data.",
      );

      setRows([]);
    } finally {
      if (
        requestId ===
        rowsRequestId.current
      ) {
        setLoading(
          false,
        );
      }
    }
  }

  async function loadCalendarRows(
    range:
      | CalendarVisibleRange
      | null =
      calendarRange,
  ) {
    const requestId =
      ++rowsRequestId.current;

    if (!range) {
      return;
    }

    if (
      hasImpossibleUserFilter
    ) {
      setRows([]);
      setLoading(false);
      setError(null);

      return;
    }

    const effectiveFrom =
      laterBoundary(
        from ||
          undefined,
        range.from,
      );

    const effectiveTo =
      earlierBoundary(
        to ||
          undefined,
        range.to,
      );

    if (
      isInvalidRange(
        effectiveFrom,
        effectiveTo,
      )
    ) {
      setRows([]);
      setLoading(false);
      setError(null);

      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response =
        await fetchLabeledResponses(
          studyId,
          {
            user_id:
              effectiveUserIds.length >
              0
                ? effectiveUserIds
                : undefined,

            module_id:
              moduleIds.length >
              0
                ? moduleIds
                : undefined,

            platform:
              effectivePlatform,

            from:
              effectiveFrom,

            to:
              effectiveTo,

            sort:
              "asc",

            skip: 0,

            limit: 50000,
          },
        );

      if (
        requestId !==
        rowsRequestId.current
      ) {
        return;
      }

      setRows(
        response,
      );
    } catch (
      caughtError: any
    ) {
      if (
        requestId !==
        rowsRequestId.current
      ) {
        return;
      }

      setError(
        caughtError?.message ??
          "Failed to load calendar data.",
      );

      setRows([]);
    } finally {
      if (
        requestId ===
        rowsRequestId.current
      ) {
        setLoading(
          false,
        );
      }
    }
  }

  async function loadFacets() {
    const requestId =
      ++facetsRequestId.current;

    setFacetsLoading(
      true,
    );

    try {
      const response =
        await fetchFacets(
          studyId,
          {
            user_id:
              !hasImpossibleUserFilter &&
              effectiveUserIds.length >
                0
                ? effectiveUserIds
                : undefined,

            module_id:
              moduleIds.length >
              0
                ? moduleIds
                : undefined,

            from:
              from ||
              undefined,

            to:
              to ||
              undefined,
          },
        );

      if (
        requestId !==
        facetsRequestId.current
      ) {
        return;
      }

      setFacets(
        response,
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );
    } finally {
      if (
        requestId ===
        facetsRequestId.current
      ) {
        setFacetsLoading(
          false,
        );
      }
    }
  }

  async function loadQuestions() {
    setQuestionsLoading(
      true,
    );

    try {
      const response =
        await fetchStudyQuestions(
          studyId,
        );

      setQuestions(
        response,
      );

      const semanticQuestions =
        response.filter(
          (question) =>
            question.role ===
            "participant_id",
        );

      setMapKey(
        (previous) => {
          if (
            semanticQuestions.length ===
            1
          ) {
            return questionKey(
              semanticQuestions[0],
            );
          }

          if (
            semanticQuestions.length >
            1
          ) {
            const previousStillValid =
              semanticQuestions.some(
                (question) =>
                  questionKey(
                    question,
                  ) ===
                  previous,
              );

            return previousStillValid
              ? previous
              : "";
          }

          if (!previous) {
            return "";
          }

          const [
            moduleId,
            questionId,
          ] =
            previous.split(
              ":",
            );

          return response.some(
            (question) =>
              question.module_id ===
                moduleId &&
              question.question_id ===
                questionId,
          )
            ? previous
            : "";
        },
      );
    } finally {
      setQuestionsLoading(
        false,
      );
    }
  }

  async function loadMapping() {
    if (!mapKey) {
      setUserMap(
        null,
      );

      setMappedIds(
        [],
      );

      return;
    }

    const [
      moduleId,
      questionId,
    ] =
      mapKey.split(":");

    if (
      !moduleId ||
      !questionId
    ) {
      return;
    }

    setMappingLoading(
      true,
    );

    try {
      const mapping =
        await fetchUserMapping(
          studyId,
          {
            module_id:
              moduleId,

            question_id:
              questionId,
          },
        );

      setUserMap(
        mapping,
      );

      setMappedIds(
        (previous) => {
          const labels =
            new Set(
              Object.values(
                mapping,
              ),
            );

          return previous.filter(
            (id) =>
              labels.has(
                id,
              ),
          );
        },
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );

      setUserMap(
        null,
      );

      setMappedIds(
        [],
      );
    } finally {
      setMappingLoading(
        false,
      );
    }
  }

  async function loadCalendarAnchor() {
    const requestId =
      ++calendarAnchorRequestId.current;

    if (
      hasImpossibleUserFilter
    ) {
      setCalendarInitialDate(
        new Date().toISOString(),
      );

      return;
    }

    try {
      const response =
        await fetchLabeledResponses(
          studyId,
          {
            user_id:
              effectiveUserIds.length >
              0
                ? effectiveUserIds
                : undefined,

            module_id:
              moduleIds.length >
              0
                ? moduleIds
                : undefined,

            platform:
              effectivePlatform,

            from:
              from ||
              undefined,

            to:
              to ||
              undefined,

            sort:
              "desc",

            skip: 0,

            limit: 1,
          },
        );

      if (
        requestId !==
        calendarAnchorRequestId.current
      ) {
        return;
      }

      setCalendarInitialDate(
        response[0]
          ?.response_time ??
          new Date().toISOString(),
      );
    } catch (
      caughtError
    ) {
      console.error(
        caughtError,
      );

      if (
        requestId ===
        calendarAnchorRequestId.current
      ) {
        setCalendarInitialDate(
          new Date().toISOString(),
        );
      }
    }
  }

  async function exportResponses() {
    if (
      exportScope ===
        "current" &&
      hasImpossibleUserFilter
    ) {
      setExportError(
        "The current participant filters do not match any users.",
      );

      return;
    }

    setExporting(
      true,
    );

    setExportError(
      null,
    );

    try {
      if (
        exportScope ===
        "all"
      ) {
        await downloadResponsesCsv(
          studyId,
          {
            sort:
              "asc",

            include_notes:
              includeNotes,
          },
        );
      } else {
        await downloadResponsesCsv(
          studyId,
          {
            user_id:
              effectiveUserIds.length >
              0
                ? effectiveUserIds
                : undefined,

            module_id:
              moduleIds.length >
              0
                ? moduleIds
                : undefined,

            platform:
              platform ||
              undefined,

            from:
              from ||
              undefined,

            to:
              to ||
              undefined,

            sort:
              "asc",

            include_notes:
              includeNotes,
          },
        );
      }

      setShowExportOptions(
        false,
      );
    } catch (
      caughtError: any
    ) {
      setExportError(
        caughtError?.message ??
          "Failed to export study data.",
      );
    } finally {
      setExporting(
        false,
      );
    }
  }

  useEffect(() => {
    setRows(
      null,
    );

    setPage(
      1,
    );

    setPlatform(
      "",
    );

    setCalendarRange(
      null,
    );

    setCalendarInitialDate(
      null,
    );

    setExportError(
      null,
    );

    setShowExportOptions(
      false,
    );

    setExportScope(
      "current",
    );

    setIncludeNotes(
      false,
    );

    rowsRequestId.current +=
      1;

    calendarAnchorRequestId.current +=
      1;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  useEffect(() => {
    if (
      !showExportOptions
    ) {
      return;
    }

    const handlePointerDown = (
      event: MouseEvent,
    ) => {
      const target =
        event.target;

      if (
        !(target instanceof Node)
      ) {
        return;
      }

      if (
        exportAreaRef.current &&
        !exportAreaRef.current.contains(
          target,
        )
      ) {
        setShowExportOptions(
          false,
        );
      }
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        setShowExportOptions(
          false,
        );
      }
    };

    document.addEventListener(
      "mousedown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    showExportOptions,
  ]);

  useEffect(() => {
    setPage(
      1,
    );

    void loadFacets();

    if (
      activeView ===
        "table" ||
      activeView ===
        "events"
    ) {
      void loadStandardRows(
        1,
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    studyId,
    JSON.stringify(
      effectiveUserIds,
    ),
    JSON.stringify(
      moduleIds,
    ),
    from,
    to,
    activeView,
    platform,
    hasImpossibleUserFilter,
  ]);

  useEffect(() => {
    if (
      activeView !==
      "calendar"
    ) {
      return;
    }

    if (
      calendarInitialDate
    ) {
      return;
    }

    void loadCalendarAnchor();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    studyId,
    calendarInitialDate,
  ]);

  useEffect(() => {
    if (
      activeView !==
        "calendar" ||
      !calendarRange
    ) {
      return;
    }

    void loadCalendarRows(
      calendarRange,
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeView,
    studyId,
    calendarRange?.from,
    calendarRange?.to,
    JSON.stringify(
      effectiveUserIds,
    ),
    JSON.stringify(
      moduleIds,
    ),
    platform,
    from,
    to,
    hasImpossibleUserFilter,
  ]);

  useEffect(() => {
    void loadQuestions();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  useEffect(() => {
    void loadMapping();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    studyId,
    mapKey,
  ]);

  const toggleUser = (
    userId: string,
  ) => {
    setUserIds(
      (previous) =>
        previous.includes(
          userId,
        )
          ? previous.filter(
              (value) =>
                value !==
                userId,
            )
          : [
              ...previous,
              userId,
            ],
    );
  };

  const toggleModule = (
    moduleId: string,
  ) => {
    setModuleIds(
      (previous) =>
        previous.includes(
          moduleId,
        )
          ? previous.filter(
              (value) =>
                value !==
                moduleId,
            )
          : [
              ...previous,
              moduleId,
            ],
    );
  };

  const toggleMappedId = (
    mappedId: string,
  ) => {
    setMappedIds(
      (previous) =>
        previous.includes(
          mappedId,
        )
          ? previous.filter(
              (value) =>
                value !==
                mappedId,
            )
          : [
              ...previous,
              mappedId,
            ],
    );
  };

  const resetFilters =
    () => {
      setUserIds([]);
      setMappedIds([]);
      setModuleIds([]);
      setPlatform("");
      setFrom("");
      setTo("");
      setExportError(
        null,
      );
    };

  const refreshCurrentView =
    () => {
      if (
        activeView ===
        "calendar"
      ) {
        void loadCalendarRows(
          calendarRange,
        );

        return;
      }

      if (
        activeView ===
          "table" ||
        activeView ===
          "events"
      ) {
        void loadStandardRows(
          activeView ===
            "table"
            ? page
            : 1,
        );
      }
    };

  const viewOptions: Array<{
    value: ActiveView;
    label: string;
    description: string;
  }> = [
    {
      value:
        "calendar",

      label:
        "Calendar",

      description:
        "Browse responses over time",
    },
    {
      value:
        "table",

      label:
        "Table",

      description:
        "Inspect individual responses",
    },
    {
      value:
        "events",

      label:
        "Events",

      description:
        "Inspect participant activity",
    },
    {
      value:
        "adherence",

      label:
        "Adherence",

      description:
        "Review participation",
    },
    {
      value:
        "visualize",

      label:
        "Visualize",

      description:
        "Study-specific analysis",
    },
  ];

  const rendersOwnData =
    activeView ===
      "visualize" ||
    activeView ===
      "adherence";

  return (
    <div
      className={
        styles.root
      }
    >
      <section
        className={
          styles.viewSection
        }
      >
        <div
          className={
            styles.viewHeader
          }
        >
          <div>
            <p
              className={
                styles.eyebrow
              }
            >
              Study data
            </p>

            <h2
              className={
                styles.heading
              }
            >
              Explore results
            </h2>

            <p
              className={
                styles.headingDescription
              }
            >
              Inspect responses,
              participation, and
              study activity.
            </p>
          </div>

          <div
            className={
              styles.resultStatus
            }
          >
            {loading ? (
              <span>
                Loading…
              </span>
            ) : rows &&
              !rendersOwnData ? (
              <span>
                {
                  rows.length
                }{" "}
                {rows.length ===
                1
                  ? "record"
                  : "records"}{" "}
                loaded
              </span>
            ) : null}
          </div>
        </div>

        <div
          className={
            styles.viewTabs
          }
          role="tablist"
          aria-label="Study data view"
        >
          {viewOptions.map(
            (view) => (
              <button
                key={
                  view.value
                }
                type="button"
                role="tab"
                aria-selected={
                  activeView ===
                  view.value
                }
                className={`${styles.viewTab} ${
                  activeView ===
                  view.value
                    ? styles.viewTabActive
                    : ""
                }`}
                onClick={() =>
                  setActiveView(
                    view.value,
                  )
                }
              >
                <span
                  className={
                    styles.viewTabIcon
                  }
                >
                  <ViewIcon
                    view={
                      view.value
                    }
                  />
                </span>

                <span
                  className={
                    styles.viewTabCopy
                  }
                >
                  <span
                    className={
                      styles.viewTabLabel
                    }
                  >
                    {
                      view.label
                    }
                  </span>

                  <span
                    className={
                      styles.viewTabDescription
                    }
                  >
                    {
                      view.description
                    }
                  </span>
                </span>
              </button>
            ),
          )}
        </div>
      </section>

      <section
        className={
          styles.filterSection
        }
      >
        <div
          className={
            styles.filterHeader
          }
        >
          <div>
            <h3
              className={
                styles.sectionTitle
              }
            >
              Filters
            </h3>

            <p
              className={
                styles.sectionDescription
              }
            >
              Select participants
              and optionally narrow
              the results by module,
              response platform, or
              time range.
            </p>
          </div>

          <div
            className={
              styles.filterActions
            }
          >
            {hasActiveFilters && (
              <span
                className={
                  styles.activeFilterCount
                }
              >
                {
                  activeFilterCount
                }{" "}
                active
              </span>
            )}

            <div
              className={
                styles.exportArea
              }
              ref={
                exportAreaRef
              }
            >
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.exportTrigger}`}
                onClick={() => {
                  setExportError(
                    null,
                  );

                  setShowExportOptions(
                    (current) =>
                      !current,
                  );
                }}
                aria-haspopup="dialog"
                aria-expanded={
                  showExportOptions
                }
                disabled={
                  exporting
                }
              >
                <span>
                  {exporting
                    ? "Exporting…"
                    : "Export"}
                </span>

                <span
                  className={`${styles.exportChevron} ${
                    showExportOptions
                      ? styles.exportChevronOpen
                      : ""
                  }`}
                  aria-hidden="true"
                >
                  ›
                </span>
              </button>

              {showExportOptions && (
                <div
                  className={
                    styles.exportPopover
                  }
                  role="dialog"
                  aria-label="Export study data"
                >
                  <div
                    className={
                      styles.exportPopoverHeader
                    }
                  >
                    <strong>
                      Export study
                      data
                    </strong>

                    <span>
                      Choose which
                      responses to
                      download.
                    </span>
                  </div>

                  <fieldset
                    className={
                      styles.exportFieldset
                    }
                  >
                    <legend
                      className={
                        styles.exportLegend
                      }
                    >
                      Scope
                    </legend>

                    <label
                      className={
                        styles.exportChoice
                      }
                    >
                      <input
                        type="radio"
                        name="export-scope"
                        value="current"
                        checked={
                          exportScope ===
                          "current"
                        }
                        onChange={() =>
                          setExportScope(
                            "current",
                          )
                        }
                      />

                      <span
                        className={
                          styles.exportChoiceCopy
                        }
                      >
                        <strong>
                          Current
                          filtered
                          data
                        </strong>

                        <span>
                          {hasActiveFilters ||
                          platform
                            ? "Use the participant, module, response-platform, and date filters currently applied."
                            : "No filters are currently applied, so this includes all responses."}
                        </span>
                      </span>
                    </label>

                    <label
                      className={
                        styles.exportChoice
                      }
                    >
                      <input
                        type="radio"
                        name="export-scope"
                        value="all"
                        checked={
                          exportScope ===
                          "all"
                        }
                        onChange={() =>
                          setExportScope(
                            "all",
                          )
                        }
                      />

                      <span
                        className={
                          styles.exportChoiceCopy
                        }
                      >
                        <strong>
                          All study
                          data
                        </strong>

                        <span>
                          Ignore the
                          current
                          dashboard
                          filters.
                        </span>
                      </span>
                    </label>
                  </fieldset>

                  {exportCurrentUnavailable && (
                    <div
                      className={
                        styles.exportWarning
                      }
                    >
                      The current
                      participant
                      filters do not
                      match any
                      users. Choose
                      all study data
                      or adjust the
                      filters.
                    </div>
                  )}

                  <div
                    className={
                      styles.exportDivider
                    }
                  />

                  <label
                    className={
                      styles.exportCheckbox
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        includeNotes
                      }
                      onChange={(
                        event,
                      ) =>
                        setIncludeNotes(
                          event.target
                            .checked,
                        )
                      }
                    />

                    <span
                      className={
                        styles.exportChoiceCopy
                      }
                    >
                      <strong>
                        Include
                        calendar
                        notes
                      </strong>

                      <span>
                        Downloads a
                        ZIP containing
                        responses.csv
                        and notes.csv.
                      </span>
                    </span>
                  </label>

                  <div
                    className={
                      styles.exportFormatNote
                    }
                  >
                    {includeNotes
                      ? "Format: ZIP archive"
                      : "Format: CSV"}
                  </div>

                  <div
                    className={
                      styles.exportFooter
                    }
                  >
                    <button
                      type="button"
                      className={
                        styles.exportCancelButton
                      }
                      onClick={() =>
                        setShowExportOptions(
                          false,
                        )
                      }
                      disabled={
                        exporting
                      }
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className={
                        styles.exportDownloadButton
                      }
                      onClick={() =>
                        void exportResponses()
                      }
                      disabled={
                        exporting ||
                        exportCurrentUnavailable
                      }
                    >
                      {exporting
                        ? "Preparing…"
                        : includeNotes
                          ? "Download ZIP"
                          : "Download CSV"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className={
                styles.secondaryButton
              }
              onClick={
                resetFilters
              }
              disabled={
                loading ||
                facetsLoading ||
                (
                  !hasActiveFilters &&
                  !platform
                )
              }
            >
              Clear filters
            </button>

            <button
              type="button"
              className={
                styles.refreshButton
              }
              onClick={
                refreshCurrentView
              }
              disabled={
                loading ||
                rendersOwnData
              }
            >
              {loading
                ? "Refreshing…"
                : "Refresh"}
            </button>
          </div>
        </div>

        {exportError && (
          <div
            className={
              styles.errorState
            }
            role="alert"
          >
            <strong>
              Could not export
              study data
            </strong>

            <span>
              {exportError}
            </span>
          </div>
        )}

        <div
          className={
            styles.mappingArea
          }
        >
          <div
            className={
              styles.mappingIntro
            }
          >
            <span
              className={
                styles.mappingLabel
              }
            >
              Participant identifier
            </span>

            <p
              className={
                styles.mappingDescription
              }
            >
              {hasAutomaticParticipantId
                ? "This study defines its participant identifier in the study schema."
                : hasAmbiguousParticipantIds
                  ? "More than one question is marked as the participant identifier. Select the one to use."
                  : "This study does not define a participant identifier role. You can optionally select a likely identifier question for compatibility with older studies."}
            </p>
          </div>

          <div
            className={
              styles.mappingControl
            }
          >
            {hasAutomaticParticipantId ? (
              <>
                <span
                  className={
                    styles.fieldLabel
                  }
                >
                  Participant ID
                </span>

                <div
                  className={
                    styles.fieldStatus
                  }
                >
                  {mappingLoading
                    ? "Loading participant IDs…"
                    : selectedQuestion
                      ? `Automatically using: ${selectedQuestion.question_text}`
                      : "Participant identifier detected"}
                </div>
              </>
            ) : (
              <>
                <label
                  htmlFor="mapping-question"
                  className={
                    styles.fieldLabel
                  }
                >
                  {hasAmbiguousParticipantIds
                    ? "Participant ID question"
                    : "Identifier question"}
                </label>

                <select
                  id="mapping-question"
                  className={
                    styles.input
                  }
                  value={
                    mapKey
                  }
                  onChange={(
                    event,
                  ) =>
                    setMapKey(
                      event.target
                        .value,
                    )
                  }
                  disabled={
                    questionsLoading ||
                    !questionsByModule.length
                  }
                >
                  <option value="">
                    None
                  </option>

                  {questionsByModule.map(
                    (group) => (
                      <optgroup
                        key={
                          group.module_id
                        }
                        label={
                          group.module_name ||
                          group.module_id
                        }
                      >
                        {group.items.map(
                          (
                            question,
                          ) => {
                            const value =
                              questionKey(
                                question,
                              );

                            return (
                              <option
                                key={
                                  value
                                }
                                value={
                                  value
                                }
                              >
                                {
                                  question.question_text
                                }
                              </option>
                            );
                          },
                        )}
                      </optgroup>
                    ),
                  )}
                </select>

                <div
                  className={
                    styles.fieldStatus
                  }
                >
                  {mappingLoading
                    ? "Loading participant IDs…"
                    : selectedQuestion
                      ? `Using: ${selectedQuestion.question_text}`
                      : questionsLoading
                        ? "Loading available questions…"
                        : hasAmbiguousParticipantIds
                          ? "Select which participant ID question to use"
                          : questionsByModule.length >
                              0
                            ? "No identifier selected"
                            : "No likely identifier questions found"}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className={
            styles.filtersGrid
          }
        >
          {userMap &&
            distinctMappedIds.length >
              0 && (
              <div
                className={
                  styles.field
                }
              >
                <label
                  className={
                    styles.fieldLabel
                  }
                  htmlFor="mapped-id-filter"
                >
                  {hasAutomaticParticipantId ||
                  hasAmbiguousParticipantIds
                    ? "Participant ID"
                    : mappingLabel}
                </label>

                <select
                  id="mapped-id-filter"
                  className={
                    styles.input
                  }
                  value=""
                  onChange={(
                    event,
                  ) => {
                    const value =
                      event.target
                        .value;

                    if (value) {
                      toggleMappedId(
                        value,
                      );
                    }
                  }}
                >
                  <option value="">
                    {mappedIds.length
                      ? "Add another…"
                      : "All participants"}
                  </option>

                  {distinctMappedIds.map(
                    (id) => (
                      <option
                        key={
                          id
                        }
                        value={
                          id
                        }
                      >
                        {mappedIds.includes(
                          id,
                        )
                          ? "✓ "
                          : ""}
                        {id}
                      </option>
                    ),
                  )}
                </select>

                <div
                  className={
                    styles.selectionArea
                  }
                >
                  {mappedIds.length ===
                  0 ? (
                    <span
                      className={
                        styles.help
                      }
                    >
                      All participants
                    </span>
                  ) : (
                    <>
                      <div
                        className={
                          styles.chipList
                        }
                      >
                        {mappedIds.map(
                          (id) => (
                            <span
                              key={
                                id
                              }
                              className={
                                styles.chip
                              }
                            >
                              <span>
                                {
                                  id
                                }
                              </span>

                              <button
                                type="button"
                                aria-label={`Remove ${id}`}
                                onClick={() =>
                                  toggleMappedId(
                                    id,
                                  )
                                }
                              >
                                ×
                              </button>
                            </span>
                          ),
                        )}
                      </div>

                      <button
                        type="button"
                        className={
                          styles.clearInlineButton
                        }
                        onClick={() =>
                          setMappedIds(
                            [],
                          )
                        }
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

          <div
            className={
              styles.field
            }
          >
            <label
              className={
                styles.fieldLabel
              }
              htmlFor="user-filter"
            >
              Internal user
            </label>

            <select
              id="user-filter"
              className={
                styles.input
              }
              value=""
              onChange={(
                event,
              ) => {
                const value =
                  event.target
                    .value;

                if (value) {
                  toggleUser(
                    value,
                  );
                }
              }}
            >
              <option value="">
                {userIds.length
                  ? "Add another…"
                  : "All users"}
              </option>

              {distinctUsers.map(
                (userId) => (
                  <option
                    key={
                      userId
                    }
                    value={
                      userId
                    }
                  >
                    {userIds.includes(
                      userId,
                    )
                      ? "✓ "
                      : ""}
                    {userId}
                  </option>
                ),
              )}
            </select>

            <div
              className={
                styles.selectionArea
              }
            >
              {userIds.length ===
              0 ? (
                <span
                  className={
                    styles.help
                  }
                >
                  No internal-user
                  filter applied
                </span>
              ) : (
                <>
                  <div
                    className={
                      styles.chipList
                    }
                  >
                    {userIds.map(
                      (
                        userId,
                      ) => (
                        <span
                          key={
                            userId
                          }
                          className={
                            styles.chip
                          }
                        >
                          <span>
                            {
                              userId
                            }
                          </span>

                          <button
                            type="button"
                            aria-label={`Remove ${userId}`}
                            onClick={() =>
                              toggleUser(
                                userId,
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ),
                    )}
                  </div>

                  <button
                    type="button"
                    className={
                      styles.clearInlineButton
                    }
                    onClick={() =>
                      setUserIds(
                        [],
                      )
                    }
                  >
                    Clear
                  </button>
                </>
              )}
            </div>

            {facetsLoading && (
              <div
                className={
                  styles.fieldStatus
                }
              >
                Updating available
                users…
              </div>
            )}
          </div>
        </div>

        <div
          className={
            styles.additionalFiltersHeader
          }
        >
          <button
            type="button"
            className={
              styles.additionalFiltersToggle
            }
            onClick={() =>
              setShowAdditionalFilters(
                (current) =>
                  !current,
              )
            }
            aria-expanded={
              showAdditionalFilters
            }
          >
            <span>
              More filters
            </span>

            {additionalFilterCount >
              0 && (
              <span
                className={
                  styles.additionalFilterCount
                }
              >
                {
                  additionalFilterCount
                }{" "}
                active
              </span>
            )}

            <span
              className={`${styles.filterChevron} ${
                showAdditionalFilters
                  ? styles.filterChevronOpen
                  : ""
              }`}
              aria-hidden="true"
            >
              ›
            </span>
          </button>

          {!showAdditionalFilters &&
            additionalFilterCount >
              0 && (
              <div
                className={
                  styles.collapsedFilterSummary
                }
              >
                {moduleIds.length >
                  0 && (
                  <span>
                    {moduleIds.length ===
                    1
                      ? "1 module"
                      : `${moduleIds.length} modules`}
                  </span>
                )}

                {platform &&
                  responsePlatformView && (
                  <span>
                    {formatPlatform(
                      platform,
                    )}
                  </span>
                )}

                {from && (
                  <span>
                    From{" "}
                    {formatCollapsedDate(
                      from,
                    )}
                  </span>
                )}

                {to && (
                  <span>
                    To{" "}
                    {formatCollapsedDate(
                      to,
                    )}
                  </span>
                )}
              </div>
            )}
        </div>

        {showAdditionalFilters && (
          <div
            className={
              styles.additionalFilters
            }
          >
            <div
              className={
                styles.field
              }
            >
              <label
                className={
                  styles.fieldLabel
                }
                htmlFor="module-filter"
              >
                Module
              </label>

              <select
                id="module-filter"
                className={
                  styles.input
                }
                value=""
                onChange={(
                  event,
                ) => {
                  const value =
                    event.target
                      .value;

                  if (value) {
                    toggleModule(
                      value,
                    );
                  }
                }}
              >
                <option value="">
                  {moduleIds.length
                    ? "Add another…"
                    : "All modules"}
                </option>

                {distinctModules.map(
                  (module) => (
                    <option
                      key={
                        module.id
                      }
                      value={
                        module.id
                      }
                    >
                      {moduleIds.includes(
                        module.id,
                      )
                        ? "✓ "
                        : ""}

                      {module.name ||
                        module.id}
                    </option>
                  ),
                )}
              </select>

              <div
                className={
                  styles.selectionArea
                }
              >
                {moduleIds.length ===
                0 ? (
                  <span
                    className={
                      styles.help
                    }
                  >
                    All modules
                  </span>
                ) : (
                  <>
                    <div
                      className={
                        styles.chipList
                      }
                    >
                      {moduleIds.map(
                        (
                          moduleId,
                        ) => (
                          <span
                            key={
                              moduleId
                            }
                            className={
                              styles.chip
                            }
                          >
                            <span>
                              {distinctModules.find(
                                (
                                  module,
                                ) =>
                                  module.id ===
                                  moduleId,
                              )
                                ?.name ||
                                moduleId}
                            </span>

                            <button
                              type="button"
                              aria-label={`Remove ${moduleId}`}
                              onClick={() =>
                                toggleModule(
                                  moduleId,
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      className={
                        styles.clearInlineButton
                      }
                      onClick={() =>
                        setModuleIds(
                          [],
                        )
                      }
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {responsePlatformView && (
              <div
                className={
                  styles.field
                }
              >
                <label
                  className={
                    styles.fieldLabel
                  }
                  htmlFor="platform-filter"
                >
                  Response platform
                </label>

                <select
                  id="platform-filter"
                  className={
                    styles.input
                  }
                  value={
                    platform
                  }
                  onChange={(
                    event,
                  ) =>
                    setPlatform(
                      event.target
                        .value as
                        | ResponsePlatform
                        | "",
                    )
                  }
                >
                  <option value="">
                    All platforms
                    {facets?.platforms
                      ? ` (${facets.platforms.all})`
                      : ""}
                  </option>

                  <option value="android">
                    Android
                    {facets?.platforms
                      ? ` (${facets.platforms.android})`
                      : ""}
                  </option>

                  <option value="iphone">
                    iPhone
                    {facets?.platforms
                      ? ` (${facets.platforms.iphone})`
                      : ""}
                  </option>

                  <option value="unknown">
                    Unknown / other
                    {facets?.platforms
                      ? ` (${facets.platforms.unknown})`
                      : ""}
                  </option>
                </select>

                <div
                  className={
                    styles.fieldStatus
                  }
                >
                  Platform is recorded
                  on each submitted
                  response. Older
                  responses without a
                  known platform are
                  grouped under
                  Unknown / other.
                </div>
              </div>
            )}

            <div
              className={
                styles.dateField
              }
            >
              <label
                className={
                  styles.fieldLabel
                }
                htmlFor="from-filter"
              >
                From
              </label>

              <input
                id="from-filter"
                type="datetime-local"
                className={
                  styles.input
                }
                value={
                  from
                }
                onChange={(
                  event,
                ) =>
                  setFrom(
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div
              className={
                styles.dateField
              }
            >
              <label
                className={
                  styles.fieldLabel
                }
                htmlFor="to-filter"
              >
                To
              </label>

              <input
                id="to-filter"
                type="datetime-local"
                className={
                  styles.input
                }
                value={
                  to
                }
                onChange={(
                  event,
                ) =>
                  setTo(
                    event.target
                      .value,
                  )
                }
              />
            </div>
          </div>
        )}
      </section>

      <section
        className={
          styles.resultsSection
        }
      >
        {error && (
          <div
            className={
              styles.errorState
            }
            role="alert"
          >
            <strong>
              Could not load
              study data
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        {activeView ===
        "calendar" ? (
          <CalendarViewV2
            studyId={
              studyId
            }
            rows={
              rows ?? []
            }
            questions={
              questions ??
              []
            }
            loading={
              loading
            }
            initialDate={
              calendarRange
                ?.focusDate ??
              calendarInitialDate ??
              undefined
            }
            onRangeChange={(
              range,
            ) =>
              setCalendarRange(
                range,
              )
            }
            mapping={
              userMap ??
              undefined
            }
            mappingName={
              hasAutomaticParticipantId ||
              hasAmbiguousParticipantIds
                ? "Participant ID"
                : mappingLabel
            }
          />
        ) : activeView ===
          "visualize" ? (
          <SleepVizPanel
            studyId={
              studyId
            }
            userIds={
              hasImpossibleUserFilter
                ? []
                : effectiveUserIds.length
                  ? effectiveUserIds
                  : undefined
            }
            moduleIds={
              moduleIds.length
                ? moduleIds
                : undefined
            }
            from={
              from ||
              undefined
            }
            to={
              to ||
              undefined
            }
            mapping={
              userMap ??
              undefined
            }
            mappingName={
              hasAutomaticParticipantId ||
              hasAmbiguousParticipantIds
                ? "Participant ID"
                : mappingLabel
            }
          />
        ) : activeView ===
          "adherence" ? (
          <AdherencePanel
            studyId={
              studyId
            }
            userIds={
              hasImpossibleUserFilter
                ? []
                : effectiveUserIds.length
                  ? effectiveUserIds
                  : undefined
            }
            moduleIds={
              moduleIds.length
                ? moduleIds
                : undefined
            }
            from={
              from
                ? from.slice(
                    0,
                    10,
                  )
                : undefined
            }
            to={
              to
                ? to.slice(
                    0,
                    10,
                  )
                : undefined
            }
            mapping={
              userMap ??
              undefined
            }
            mappingName={
              hasAutomaticParticipantId ||
              hasAmbiguousParticipantIds
                ? "Participant ID"
                : mappingLabel
            }
          />
        ) : loading &&
          rows ===
            null ? (
          <div
            className={
              styles.loadingState
            }
          >
            <div
              className={
                styles.loadingIndicator
              }
              aria-hidden="true"
            />

            <span>
              Loading study
              data…
            </span>
          </div>
        ) : !loading &&
          rows &&
          rows.length ===
            0 ? (
          <div
            className={
              styles.emptyState
            }
          >
            <div
              className={
                styles.emptyMarker
              }
              aria-hidden="true"
            />

            <div>
              <p
                className={
                  styles.emptyTitle
                }
              >
                No results found
              </p>

              <p
                className={
                  styles.emptyDescription
                }
              >
                There are no
                records matching
                the current
                filters.
              </p>
            </div>
          </div>
        ) : rows &&
          rows.length >
            0 ? (
          <>
            {activeView ===
            "table" ? (
              <TableViewV2
                rows={
                  rows
                }
                questions={
                  questions ??
                  []
                }
                mapping={
                  userMap ??
                  undefined
                }
                mappingName={
                  hasAutomaticParticipantId ||
                  hasAmbiguousParticipantIds
                    ? "Participant ID"
                    : mappingLabel
                }
              />
            ) : (
              <EventTimeline
                studyId={
                  studyId
                }
                rows={
                  rows
                }
                questions={
                  questions ??
                  []
                }
                userIds={
                  hasImpossibleUserFilter
                    ? []
                    : effectiveUserIds.length
                      ? effectiveUserIds
                      : undefined
                }
                moduleIds={
                  moduleIds.length
                    ? moduleIds
                    : undefined
                }
                from={
                  from ||
                  undefined
                }
                to={
                  to ||
                  undefined
                }
                mapping={
                  userMap ??
                  undefined
                }
                mappingName={
                  hasAutomaticParticipantId ||
                  hasAmbiguousParticipantIds
                    ? "Participant ID"
                    : mappingLabel
                }
              />
            )}

            {activeView ===
              "table" && (
              <div
                className={
                  styles.pager
                }
              >
                <button
                  type="button"
                  className={
                    styles.pagerButton
                  }
                  onClick={() => {
                    if (
                      page >
                      1
                    ) {
                      const nextPage =
                        page -
                        1;

                      setPage(
                        nextPage,
                      );

                      void loadStandardRows(
                        nextPage,
                      );
                    }
                  }}
                  disabled={
                    page ===
                      1 ||
                    loading
                  }
                >
                  ← Previous
                </button>

                <span
                  className={
                    styles.pageNumber
                  }
                >
                  Page{" "}
                  {
                    page
                  }
                </span>

                <button
                  type="button"
                  className={
                    styles.pagerButton
                  }
                  onClick={() => {
                    const nextPage =
                      page +
                      1;

                    setPage(
                      nextPage,
                    );

                    void loadStandardRows(
                      nextPage,
                    );
                  }}
                  disabled={
                    loading ||
                    rows.length <
                      TABLE_PAGE_SIZE
                  }
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}