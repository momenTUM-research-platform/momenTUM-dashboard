import {
  InferredStudyQuestion
} from "./types";

export const isTime = (q: {
  type?: string | null;
  subtype?: string | null;
}) =>
  q.type === "datetime" &&
  q.subtype === "time";

export const isDate = (q: {
  type?: string | null;
  subtype?: string | null;
}) =>
  q.type === "datetime" &&
  q.subtype === "date";

export const isSchemaNumeric = (q: {
  type?: string | null;
  subtype?: string | null;
}) =>
  (q.type === "text" &&
    q.subtype === "numeric") ||
  q.type === "number";

export const isSelectableNumeric = (q: {
  is_numeric?: boolean;
  type?: string | null;
  subtype?: string | null;
  option_map?: Record<string, number>;
}) =>
  Boolean(q.is_numeric) ||
  isSchemaNumeric(q);


export function toDate(
  value: unknown,
): Date | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(
      value.getTime(),
    )
      ? new Date(value.getTime())
      : null;
  }

  const raw = String(value).trim();

  const timeOnly = raw.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    const second = Number(
      timeOnly[3] ?? "0",
    );

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return null;
    }

    return new Date(
      1970,
      0,
      1,
      hour,
      minute,
      second,
      0,
    );
  }

  const parsed = new Date(raw);

  return Number.isFinite(
    parsed.getTime(),
  )
    ? parsed
    : null;
}

export function toNumberLoose(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const raw = String(value)
    .trim()
    .replace(",", ".");

  if (!raw) {
    return null;
  }

  const number = Number(raw);

  return Number.isFinite(number)
    ? number
    : null;
}

export function toInt(
  value: unknown,
): number | null {
  const number = toNumberLoose(value);

  return number === null
    ? null
    : Math.round(number);
}

export function median(
  values: number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(
    (a, b) => a - b,
  );

  const middle = Math.floor(
    sorted.length / 2,
  );

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (
    sorted[middle - 1] +
    sorted[middle]
  ) / 2;
}

export function average(
  values: number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length
  );
}

export function timeToMinutes(
  value: Date,
): number {
  return (
    value.getHours() * 60 +
    value.getMinutes() +
    value.getSeconds() / 60
  );
}

export function normalizeNightMinutes(
  minutes: number,
  eveningStartMinutes = 20 * 60,
): number {
  return minutes < eveningStartMinutes
    ? minutes + 1440
    : minutes;
}

export function clockMinutes(
  value: Date,
  eveningStartMinutes = 20 * 60,
): number {
  return normalizeNightMinutes(
    timeToMinutes(value),
    eveningStartMinutes,
  );
}

export function formatClockMinutes(
  value: number | null,
): string {
  if (value === null) {
    return "—";
  }

  const normalized =
    ((Math.round(value) % 1440) +
      1440) %
    1440;

  const hours = Math.floor(
    normalized / 60,
  );

  const minutes =
    normalized % 60;

  return `${String(hours).padStart(
    2,
    "0",
  )}:${String(minutes).padStart(
    2,
    "0",
  )}`;
}

export function formatDuration(
  minutes: number,
): string {
  const rounded = Math.max(
    0,
    Math.round(minutes),
  );

  const hours = Math.floor(
    rounded / 60,
  );

  const remainder =
    rounded % 60;

  return `${hours}h ${String(
    remainder,
  ).padStart(2, "0")}m`;
}


export function participantColor(
  key: string,
): string {
  let hash = 0;

  for (
    let index = 0;
    index < key.length;
    index += 1
  ) {
    hash =
      (hash * 31 +
        key.charCodeAt(index)) >>>
      0;
  }

  const hue = hash % 360;

  return `hsl(${hue} 42% 46%)`;
}

export const hashColor =
  participantColor;