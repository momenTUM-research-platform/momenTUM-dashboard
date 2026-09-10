"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/context/AuthContext";

import {
  fetchParticipantEvents,
  ParticipantEventsOut,
  TrackingEvent,
} from "@/app/lib/events";

import { fetchLabeledResponses } from "@/app/lib/responses";

import { LabeledSurveyResponseOut } from "@/app/types/schemas";

import EventDetail, {
  ExtendedEventProps,
} from "../EventDetail/EventDetail";

import styles from "./EventTimeline.module.css";

type Props = {
  studyId: string;
  rows: LabeledSurveyResponseOut[];
  userIds?: string[];
  moduleIds?: string[];
  from?: string;
  to?: string;
  mapping?: Record<string, string>;
  mappingName?: string;
};

type NotificationEntry = {
  notification_id?: number | string;
  task_id?: string | null;
  module_id?: string | null;
  module_name?: string | null;
  task_type?: string | null;
  scheduled_at?: string | null;
};

type SectionDuration = {
  section_index?: number;
  section_id?: string;
  section_name?: string;
  duration_ms?: number;
};

type NotificationCollectionKey =
  | "added_notifications"
  | "removed_notifications"
  | "rescheduled_notifications";

function metadata(
  event: TrackingEvent,
): Record<string, unknown> {
  return event.metadata ?? {};
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function numberValue(
  value: unknown,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function formatTimestamp(
  value: string,
  timezone?: string | null,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };

  if (timezone) {
    try {
      return new Intl.DateTimeFormat(
        undefined,
        {
          ...options,
          timeZone: timezone,
        },
      ).format(date);
    } catch {
      // Fall back to the dashboard/browser timezone if the event timezone is invalid.
    }
  }

  return new Intl.DateTimeFormat(
    undefined,
    options,
  ).format(date);
}

function formatDuration(
  milliseconds: number | null,
): string {
  if (
    milliseconds === null ||
    milliseconds < 0
  ) {
    return "—";
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }

  const totalSeconds =
    Math.round(milliseconds / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  if (minutes < 60) {
    return seconds
      ? `${minutes}m ${seconds}s`
      : `${minutes}m`;
  }

  const hours =
    Math.floor(minutes / 60);

  const remainingMinutes =
    minutes % 60;

  return remainingMinutes
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

function humanizeEventType(
  eventType: TrackingEvent["event_type"],
): string {
  switch (eventType) {
    case "enrolled":
      return "Enrolled";

    case "notification_scheduled":
      return "Notification queue updated";

    case "notification_delivered":
      return "Delivery event recorded";

    case "notification_tapped":
      return "Notification tapped";

    case "module_visible":
      return "Module became visible";

    case "module_opened":
      return "Module opened";

    case "module_submitted":
      return "Module submitted";

    case "unenrolled":
      return "Unenrolled";

    case "study_progress_recovered":
      return "Study progress recovered";

    default:
      return eventType;
  }
}

function humanizeReason(
  value: string,
): string {
  switch (value) {
    case "enrollment":
      return "Study enrollment";

    case "app_start":
      return "App started";

    case "app_resume":
      return "App resumed";

    case "home_enter":
      return "Home screen opened";

    case "module_submitted":
      return "Module submitted";

    case "task_state_changed":
      return "Task state changed";

    case "settings_changed":
      return "Notification settings changed";

    case "manual_refresh":
      return "Manual refresh";

    case "unknown":
      return "Unknown";

    default:
      return value
        .replaceAll("_", " ")
        .replace(
          /^./,
          (character) =>
            character.toUpperCase(),
        );
  }
}

function humanizeQueueStatus(
  value: string,
): string {
  switch (value) {
    case "scheduled":
      return "Scheduled";

    case "disabled":
      return "Notifications disabled";

    case "permission_denied":
      return "OS permission denied";

    default:
      return value
        .replaceAll("_", " ")
        .replace(
          /^./,
          (character) =>
            character.toUpperCase(),
        );
  }
}

function eventSymbol(
  eventType: TrackingEvent["event_type"],
): string {
  switch (eventType) {
    case "enrolled":
      return "✓";

    case "notification_scheduled":
      return "N";

    case "notification_delivered":
      return "↓";

    case "notification_tapped":
      return "↗";

    case "module_visible":
      return "◉";

    case "module_opened":
      return "→";

    case "module_submitted":
      return "✓";

    case "unenrolled":
      return "×";

    case "study_progress_recovered":
      return "↻";

    default:
      return "•";
  }
}

function moduleName(
  event: TrackingEvent,
): string | null {
  const meta =
    metadata(event);

  return (
    stringValue(meta.module_name) ??
    event.module_id ??
    null
  );
}

function isNotificationEntry(
  value: unknown,
): value is NotificationEntry {
  return Boolean(
    value &&
      typeof value === "object",
  );
}

function getNotifications(
  event: TrackingEvent,
): NotificationEntry[] {
  const value =
    metadata(event).notifications;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    isNotificationEntry,
  );
}

function getNotificationEntries(
  event: TrackingEvent,
  key: NotificationCollectionKey,
): NotificationEntry[] {
  const value =
    metadata(event)[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    isNotificationEntry,
  );
}

function getSections(
  event: TrackingEvent,
): SectionDuration[] {
  const value =
    metadata(event)
      .section_durations;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      entry,
    ): entry is SectionDuration =>
      Boolean(
        entry &&
          typeof entry === "object",
      ),
  );
}

function notificationMatchesModules(
  notification: NotificationEntry,
  moduleSet: Set<string>,
): boolean {
  return Boolean(
    notification.module_id &&
      moduleSet.has(
        notification.module_id,
      ),
  );
}

function queueEventMatchesModules(
  event: TrackingEvent,
  moduleSet: Set<string>,
): boolean {
  const collections = [
    getNotifications(event),
    getNotificationEntries(
      event,
      "added_notifications",
    ),
    getNotificationEntries(
      event,
      "removed_notifications",
    ),
    getNotificationEntries(
      event,
      "rescheduled_notifications",
    ),
  ];

  return collections.some(
    (collection) =>
      collection.some(
        (notification) =>
          notificationMatchesModules(
            notification,
            moduleSet,
          ),
      ),
  );
}

function NotificationList({
  event,
  notifications,
  emptyText,
}: {
  event: TrackingEvent;
  notifications: NotificationEntry[];
  emptyText?: string;
}) {
  if (!notifications.length) {
    return emptyText ? (
      <div
        className={
          styles.emptySnapshot
        }
      >
        {emptyText}
      </div>
    ) : null;
  }

  return (
    <div
      className={
        styles.notificationList
      }
    >
      {notifications.map(
        (
          notification,
          index,
        ) => (
          <div
            className={
              styles.notificationCard
            }
            key={`${event._id ?? event.timestamp}-${notification.notification_id ?? "notification"}-${index}`}
          >
            <div
              className={
                styles.notificationName
              }
            >
              {notification.module_name ??
                notification.module_id ??
                "Notification"}
            </div>

            {notification.scheduled_at && (
              <div
                className={
                  styles.secondary
                }
              >
                Scheduled{" "}
                {formatTimestamp(
                  notification.scheduled_at,
                  event.timezone,
                )}
              </div>
            )}

            <div
              className={
                styles.notificationMeta
              }
            >
              {notification.task_id && (
                <span>
                  Task{" "}
                  <code>
                    {
                      notification.task_id
                    }
                  </code>
                </span>
              )}

              {notification.task_type && (
                <span>
                  Type{" "}
                  <code>
                    {
                      notification.task_type
                    }
                  </code>
                </span>
              )}

              {notification.notification_id !==
                undefined &&
                notification.notification_id !==
                  null && (
                  <span>
                    Notification{" "}
                    <code>
                      {String(
                        notification.notification_id,
                      )}
                    </code>
                  </span>
                )}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function NotificationChangeBlock({
  event,
  title,
  notifications,
}: {
  event: TrackingEvent;
  title: string;
  notifications: NotificationEntry[];
}) {
  if (!notifications.length) {
    return null;
  }

  return (
    <div
      className={
        styles.sectionBlock
      }
    >
      <div
        className={
          styles.sectionTitle
        }
      >
        {title}
      </div>

      <NotificationList
        event={event}
        notifications={
          notifications
        }
      />
    </div>
  );
}

function EventDetails({
  event,
}: {
  event: TrackingEvent;
}) {
  const meta =
    metadata(event);

  const duration =
    numberValue(
      meta.duration_ms,
    );

  const scheduledAt =
    stringValue(
      meta.scheduled_at,
    );

  const platform =
    stringValue(
      meta.platform,
    );

  const notificationId =
    meta.notification_id;

  const taskType =
    stringValue(
      meta.task_type,
    );

  const reason =
    stringValue(
      meta.reason,
    );

  const status =
    stringValue(
      meta.status,
    );

  const readableModuleName =
    stringValue(
      meta.module_name,
    );

  const sections =
    getSections(event);

  const notifications =
    getNotifications(event);

  const pendingCount =
    numberValue(
      meta.pending_count,
    );

  const previousPendingCount =
    numberValue(
      meta.previous_pending_count,
    );

  const addedNotifications =
    getNotificationEntries(
      event,
      "added_notifications",
    );

  const removedNotifications =
    getNotificationEntries(
      event,
      "removed_notifications",
    );

  const rescheduledNotifications =
    getNotificationEntries(
      event,
      "rescheduled_notifications",
    );

  return (
    <div
      className={
        styles.details
      }
    >
      {event.task_id && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Task</span>
          <code>
            {event.task_id}
          </code>
        </div>
      )}

      {readableModuleName && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Module</span>
          <span>
            {readableModuleName}
          </span>
        </div>
      )}

      {event.module_id && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Module ID</span>
          <code>
            {event.module_id}
          </code>
        </div>
      )}

      {taskType && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Type</span>
          <span>
            {taskType}
          </span>
        </div>
      )}

      {scheduledAt && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Scheduled</span>
          <span>
            {formatTimestamp(
              scheduledAt,
              event.timezone,
            )}
          </span>
        </div>
      )}

      {duration !== null && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Duration</span>
          <strong>
            {formatDuration(
              duration,
            )}
          </strong>
        </div>
      )}

      {platform && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>Platform</span>
          <span>
            {platform}
          </span>
        </div>
      )}

      {notificationId !==
        undefined &&
        notificationId !==
          null && (
          <div
            className={
              styles.detailRow
            }
          >
            <span>
              Notification ID
            </span>
            <code>
              {String(
                notificationId,
              )}
            </code>
          </div>
        )}

      {reason && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>
            Queue refresh reason
          </span>
          <span>
            {humanizeReason(
              reason,
            )}
          </span>
        </div>
      )}

      {status && (
        <div
          className={
            styles.detailRow
          }
        >
          <span>
            Queue status
          </span>
          <span>
            {humanizeQueueStatus(
              status,
            )}
          </span>
        </div>
      )}

      {sections.length > 0 && (
        <div
          className={
            styles.sectionBlock
          }
        >
          <div
            className={
              styles.sectionTitle
            }
          >
            Section timing
          </div>

          <div
            className={
              styles.sectionList
            }
          >
            {sections.map(
              (
                section,
                index,
              ) => (
                <div
                  className={
                    styles.sectionRow
                  }
                  key={
                    section.section_id ??
                    `${event._id ?? event.timestamp}-section-${index}`
                  }
                >
                  <div>
                    <div
                      className={
                        styles.sectionName
                      }
                    >
                      {section.section_name ??
                        section.section_id ??
                        `Section ${
                          (section.section_index ??
                            index) + 1
                        }`}
                    </div>

                    {section.section_id && (
                      <div
                        className={
                          styles.secondary
                        }
                      >
                        {
                          section.section_id
                        }
                      </div>
                    )}
                  </div>

                  <strong>
                    {formatDuration(
                      typeof section.duration_ms ===
                        "number"
                        ? section.duration_ms
                        : null,
                    )}
                  </strong>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {event.event_type ===
        "notification_scheduled" && (
        <div
          className={
            styles.notificationBlock
          }
        >
          <div
            className={
              styles.notificationSummary
            }
          >
            <span>
              Pending with OS
            </span>

            <strong>
              {previousPendingCount !==
              null
                ? `${previousPendingCount} → ${
                    pendingCount ??
                    notifications.length
                  }`
                : pendingCount ??
                  notifications.length}
            </strong>
          </div>

          <NotificationChangeBlock
            event={event}
            title="Added"
            notifications={
              addedNotifications
            }
          />

          <NotificationChangeBlock
            event={event}
            title="Removed"
            notifications={
              removedNotifications
            }
          />

          <NotificationChangeBlock
            event={event}
            title="Rescheduled"
            notifications={
              rescheduledNotifications
            }
          />

          <div
            className={
              styles.sectionBlock
            }
          >
            <div
              className={
                styles.sectionTitle
              }
            >
              Current OS queue
            </div>

            <NotificationList
              event={event}
              notifications={
                notifications
              }
              emptyText="No pending notifications in this snapshot."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineEvent({
  event,
  onViewResponse,
  responseLoading,
}: {
  event: TrackingEvent;
  onViewResponse: (
    event: TrackingEvent,
  ) => void;
  responseLoading: boolean;
}) {
  const [expanded, setExpanded] =
    useState(
      event.event_type ===
        "module_submitted",
    );

  const name =
    moduleName(event);

  const meta =
    metadata(event);

  const duration =
    numberValue(
      meta.duration_ms,
    );

  const notifications =
    getNotifications(event);

  const pendingCount =
    numberValue(
      meta.pending_count,
    );

  const previousPendingCount =
    numberValue(
      meta.previous_pending_count,
    );

  const queueReason =
    stringValue(
      meta.reason,
    );

  const currentPendingCount =
    pendingCount ??
    notifications.length;

  return (
    <div
      className={
        styles.timelineItem
      }
    >
      <div
        className={
          styles.rail
        }
      >
        <div
          className={`${styles.dot} ${
            styles[
              `dot_${event.event_type}`
            ] ?? ""
          }`}
        >
          {eventSymbol(
            event.event_type,
          )}
        </div>
      </div>

      <div
        className={
          styles.eventContent
        }
      >
        <button
          type="button"
          className={
            styles.eventHeader
          }
          onClick={() =>
            setExpanded(
              (current) =>
                !current,
            )
          }
          aria-expanded={
            expanded
          }
        >
          <div
            className={
              styles.eventMain
            }
          >
            <div
              className={
                styles.eventTitleRow
              }
            >
              <span
                className={
                  styles.eventTitle
                }
              >
                {humanizeEventType(
                  event.event_type,
                )}
              </span>

              {duration !==
                null && (
                <span
                  className={
                    styles.durationBadge
                  }
                >
                  {formatDuration(
                    duration,
                  )}
                </span>
              )}

              {event.event_type ===
                "notification_scheduled" && (
                <span
                  className={
                    styles.snapshotBadge
                  }
                >
                  {previousPendingCount !==
                  null
                    ? `${previousPendingCount} → ${currentPendingCount} pending`
                    : currentPendingCount ===
                      0
                    ? "none pending"
                    : `${currentPendingCount} pending`}
                </span>
              )}
            </div>

            {name && (
              <div
                className={
                  styles.moduleName
                }
              >
                {name}
              </div>
            )}

            {event.event_type ===
              "notification_scheduled" &&
              queueReason && (
                <div
                  className={
                    styles.secondary
                  }
                >
                  {humanizeReason(
                    queueReason,
                  )}
                </div>
              )}

            <div
              className={
                styles.timestamp
              }
            >
              {formatTimestamp(
                event.timestamp,
                event.timezone,
              )}
            </div>
          </div>

          <span
            className={`${styles.chevron} ${
              expanded
                ? styles.chevronOpen
                : ""
            }`}
            aria-hidden="true"
          >
            ›
          </span>
        </button>

        {expanded && (
          <EventDetails
            event={event}
          />
        )}

        {expanded &&
          event.event_type ===
            "module_submitted" && (
            <div
              className={
                styles.responseAction
              }
            >
              <button
                type="button"
                className={
                  styles.viewResponseButton
                }
                disabled={
                  responseLoading
                }
                onClick={() =>
                  onViewResponse(
                    event,
                  )
                }
              >
                {responseLoading
                  ? "Loading response…"
                  : "View submitted response"}
              </button>
            </div>
          )}
      </div>
    </div>
  );
}

function DayGroup({
  group,
  onViewResponse,
  responseLoading,
  defaultOpen,
}: {
  group: {
    key: string;
    label: string;
    events: TrackingEvent[];
  };
  onViewResponse: (
    event: TrackingEvent,
  ) => void;
  responseLoading: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] =
    useState(defaultOpen);

  return (
    <section
      className={
        styles.dayGroup
      }
    >
      <button
        type="button"
        className={
          styles.dayHeader
        }
        onClick={() =>
          setOpen(
            (current) =>
              !current,
          )
        }
        aria-expanded={open}
      >
        <span>
          {open ? "▼" : "▶"}{" "}
          {group.label}
        </span>

        <span
          className={
            styles.dayCount
          }
        >
          {group.events.length}
        </span>
      </button>

      {open && (
        <div
          className={
            styles.timeline
          }
        >
          {group.events.map(
            (event) => (
              <TimelineEvent
                key={
                  event._id ??
                  `${event.timestamp}-${event.event_type}-${event.task_id ?? ""}`
                }
                event={event}
                responseLoading={
                  responseLoading
                }
                onViewResponse={
                  onViewResponse
                }
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function getLocalDateKeyAndLabel(
  event: TrackingEvent,
): {
  key: string;
  label: string;
} {
  const date =
    new Date(
      event.timestamp,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return {
      key: "unknown",
      label: "Unknown date",
    };
  }

  try {
    const dateParts =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone:
            event.timezone ||
            undefined,
        },
      ).formatToParts(date);

    const part = (
      type: string,
    ): string =>
      dateParts.find(
        (item) =>
          item.type ===
          type,
      )?.value ?? "";

    const key =
      `${part("year")}-${part(
        "month",
      )}-${part("day")}`;

    const label =
      new Intl.DateTimeFormat(
        undefined,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone:
            event.timezone ||
            undefined,
        },
      ).format(date);

    return {
      key,
      label,
    };
  } catch {
    const key = [
      date.getFullYear(),
      String(
        date.getMonth() + 1,
      ).padStart(
        2,
        "0",
      ),
      String(
        date.getDate(),
      ).padStart(
        2,
        "0",
      ),
    ].join("-");

    const label =
      new Intl.DateTimeFormat(
        undefined,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        },
      ).format(date);

    return {
      key,
      label,
    };
  }
}

function groupByDate(
  events: TrackingEvent[],
): Array<{
  key: string;
  label: string;
  events: TrackingEvent[];
}> {
  const groups =
    new Map<
      string,
      {
        label: string;
        events: TrackingEvent[];
      }
    >();

  for (
    const event of events
  ) {
    const {
      key,
      label,
    } =
      getLocalDateKeyAndLabel(
        event,
      );

    const existing =
      groups.get(key);

    if (existing) {
      existing.events.push(
        event,
      );
    } else {
      groups.set(
        key,
        {
          label,
          events: [event],
        },
      );
    }
  }

  return Array.from(
    groups.entries(),
  ).map(
    ([key, value]) => ({
      key,
      label:
        value.label,
      events:
        value.events,
    }),
  );
}

function responseTimestamp(
  response: LabeledSurveyResponseOut,
): number | null {
  const timestamp =
    new Date(
      response.response_time,
    ).getTime();

  return Number.isNaN(
    timestamp,
  )
    ? null
    : timestamp;
}

function findClosestResponse(
  responses: LabeledSurveyResponseOut[],
  eventTime: number,
): LabeledSurveyResponseOut | null {
  const valid =
    responses
      .map(
        (response) => ({
          response,
          timestamp:
            responseTimestamp(
              response,
            ),
        }),
      )
      .filter(
        (
          item,
        ): item is {
          response: LabeledSurveyResponseOut;
          timestamp: number;
        } =>
          item.timestamp !==
          null,
      );

  if (!valid.length) {
    return null;
  }

  return valid.reduce(
    (
      closest,
      candidate,
    ) => {
      const closestDistance =
        Math.abs(
          closest.timestamp -
            eventTime,
        );

      const candidateDistance =
        Math.abs(
          candidate.timestamp -
            eventTime,
        );

      return candidateDistance <
        closestDistance
        ? candidate
        : closest;
    },
  ).response;
}

export default function EventTimeline({
  studyId,
  rows,
  userIds,
  moduleIds,
  from,
  to,
  mapping,
  mappingName,
}: Props) {
  const { user } =
    useAuth();

  const canViewDiagnostics =
    user?.role === "admin";

  const [
    showDiagnostics,
    setShowDiagnostics,
  ] =
    useState(false);

  /*
   * The backend independently enforces admin access. This flag only controls
   * whether the admin UI asks the API to include diagnostic telemetry.
   */
  const diagnosticsEnabled =
    canViewDiagnostics &&
    showDiagnostics;

  const [data, setData] =
    useState<
      ParticipantEventsOut | null
    >(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<
      string | null
    >(null);

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
    detailLoading,
    setDetailLoading,
  ] =
    useState(false);

  const [
    detailError,
    setDetailError,
  ] =
    useState<
      string | null
    >(null);

  const selectedUser =
    userIds?.length === 1
      ? userIds[0]
      : null;

  async function openSubmittedResponse(
    event: TrackingEvent,
  ): Promise<void> {
    if (!event.module_id) {
      setDetailError(
        "This submission does not contain a module ID.",
      );
      return;
    }

    const eventTime =
      new Date(
        event.timestamp,
      ).getTime();

    if (
      Number.isNaN(
        eventTime,
      )
    ) {
      setDetailError(
        "This submission has an invalid timestamp.",
      );
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    try {
      let candidates =
        rows.filter(
          (response) =>
            response.user_id ===
              event.user_id &&
            response.module_id ===
              event.module_id,
        );

      let response =
        findClosestResponse(
          candidates,
          eventTime,
        );

      /*
       * The parent view may only contain a limited response batch.
       * Fetch participant/module responses directly when the matching
       * submission is not present locally.
       */
      if (!response) {
        candidates =
          await fetchLabeledResponses(
            studyId,
            {
              user_id: [
                event.user_id,
              ],
              module_id: [
                event.module_id,
              ],
              sort: "desc",
              skip: 0,
              limit: 500,
            },
          );

        response =
          findClosestResponse(
            candidates,
            eventTime,
          );
      }

      if (!response) {
        throw new Error(
          "No response was found for this submission.",
        );
      }

      const details: Record<
        string,
        unknown
      > = {};

      for (
        const answer of
        response.answers
      ) {
        const question =
          answer.question_text ??
          answer.question_id;

        details[question] =
          answer.answer;
      }

      setDetailData({
        extractedStudyId:
          mapping?.[
            event.user_id
          ] ??
          event.user_id,

        moduleName:
          response.module_name ??
          moduleName(event) ??
          event.module_id,

        responseTime:
          String(
            response.response_time,
          ),

        details,

        type: "structured",
      });

      setDetailOpen(true);
    } catch (
      responseError: unknown
    ) {
      console.error(
        "[EventTimeline] Failed to load submitted response",
        responseError,
      );

      setDetailError(
        responseError instanceof
          Error
          ? responseError.message
          : "Failed to load submitted response.",
      );
    } finally {
      setDetailLoading(
        false,
      );
    }
  }

  useEffect(() => {
    if (!selectedUser) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled =
      false;

    async function loadEvents() {
      setLoading(true);
      setError(null);

      try {
        const result =
          await fetchParticipantEvents(
            {
              studyId,
              userId:
                selectedUser,
              includeDiagnostics:
                diagnosticsEnabled,
              limit: 2000,
            },
          );

        if (!cancelled) {
          setData(
            result,
          );
        }
      } catch (
        loadError: unknown
      ) {
        if (!cancelled) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Failed to load events",
          );

          setData(
            null,
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(
            false,
          );
        }
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [
    studyId,
    selectedUser,
    diagnosticsEnabled,
  ]);

  const filteredEvents =
    useMemo(() => {
      if (!data) {
        return [];
      }

      const fromMs =
        from
          ? new Date(
              from,
            ).getTime()
          : null;

      const toMs =
        to
          ? new Date(
              to,
            ).getTime()
          : null;

      const moduleSet =
        moduleIds?.length
          ? new Set(
              moduleIds,
            )
          : null;

      return data.events.filter(
        (event) => {
          const eventMs =
            new Date(
              event.timestamp,
            ).getTime();

          if (
            fromMs !== null &&
            !Number.isNaN(
              fromMs,
            ) &&
            !Number.isNaN(
              eventMs,
            ) &&
            eventMs <
              fromMs
          ) {
            return false;
          }

          if (
            toMs !== null &&
            !Number.isNaN(
              toMs,
            ) &&
            !Number.isNaN(
              eventMs,
            ) &&
            eventMs >
              toMs
          ) {
            return false;
          }

          if (!moduleSet) {
            return true;
          }

          if (
            event.module_id &&
            moduleSet.has(
              event.module_id,
            )
          ) {
            return true;
          }

          if (
            event.event_type ===
            "notification_scheduled"
          ) {
            return queueEventMatchesModules(
              event,
              moduleSet,
            );
          }

          return false;
        },
      );
    }, [
      data,
      moduleIds,
      from,
      to,
    ]);

  const groups =
    useMemo(
      () =>
        groupByDate(
          filteredEvents,
        ),
      [filteredEvents],
    );

  if (!userIds?.length) {
    return (
      <div
        className={
          styles.messageCard
        }
      >
        Select one participant to
        view their activity
        timeline.
      </div>
    );
  }

  if (
    userIds.length > 1
  ) {
    return (
      <div
        className={
          styles.messageCard
        }
      >
        Select a single participant
        to view the event timeline.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={
          styles.messageCard
        }
      >
        Loading activity…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`${styles.messageCard} ${styles.error}`}
      >
        {error}
      </div>
    );
  }

  const participantLabel =
    selectedUser
      ? mapping?.[
          selectedUser
        ] ??
        selectedUser
      : "";

  return (
    <section
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
            Participant activity
          </h3>

          <div
            className={
              styles.participant
            }
          >
            {mappingName &&
            selectedUser &&
            mapping?.[
              selectedUser
            ]
              ? `${mappingName}: ${participantLabel}`
              : participantLabel}
          </div>
        </div>

        <div
          className={
            styles.headerActions
          }
        >
          <div
            className={
              styles.eventCount
            }
          >
            {
              filteredEvents.length
            }{" "}
            event
            {filteredEvents.length ===
            1
              ? ""
              : "s"}
          </div>

          {canViewDiagnostics && (
            <label
              className={
                styles.diagnosticsToggle
              }
            >
              <input
                type="checkbox"
                checked={
                  showDiagnostics
                }
                onChange={(
                  event,
                ) =>
                  setShowDiagnostics(
                    event.target
                      .checked,
                  )
                }
              />

              <span>
                Show diagnostics
              </span>
            </label>
          )}
        </div>
      </div>

      {diagnosticsEnabled && (
        <div
          className={
            styles.diagnosticsNotice
          }
        >
          <strong>
            Diagnostic view
          </strong>

          <span>
            Diagnostic events include
            best-effort mobile and
            operating-system telemetry.
            Missing notification delivery
            events do not mean that a
            notification was not
            delivered.
          </span>
        </div>
      )}

      {!filteredEvents.length ? (
        <div
          className={
            styles.messageCard
          }
        >
          No tracked events match
          the selected filters.
        </div>
      ) : (
        <div
          className={
            styles.days
          }
        >
          {groups.map(
            (
              group,
              index,
            ) => (
              <DayGroup
                key={
                  group.key
                }
                group={
                  group
                }
                defaultOpen={
                  index === 0
                }
                responseLoading={
                  detailLoading
                }
                onViewResponse={(
                  event,
                ) => {
                  void openSubmittedResponse(
                    event,
                  );
                }}
              />
            ),
          )}
        </div>
      )}

      {detailError && (
        <div
          className={
            styles.responseError
          }
        >
          {detailError}
        </div>
      )}

      <EventDetail
        isOpen={
          detailOpen
        }
        onClose={() => {
          setDetailOpen(
            false,
          );

          setDetailData(
            null,
          );

          setDetailError(
            null,
          );
        }}
        eventData={
          detailData
        }
      />
    </section>
  );
}