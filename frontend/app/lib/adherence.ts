export type OccurrenceOut = {
  module_id: string;
  module_name: string;
  date: string;
  start: string;
  end: string;
};

export type ModuleMeta = {
  module_id: string;
  module_name: string;
  repeat: string;
  sticky: boolean;
};

export type StructureCountOut = {
  study_days: number;

  per_module: Record<
    string,
    number
  >;

  per_module_meta: Record<
    string,
    ModuleMeta
  >;

  total: number;

  max_offset_days: number;

  schedule_span_days: number;
};

export function safeTZ(): string {
  try {
    return (
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone ||
      "UTC"
    );
  } catch {
    return "UTC";
  }
}

export function toYMD(
  date: Date,
): string {
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

const BASE =
  "/api/v2/adherence";

function getTokenFromStorage():
  | string
  | undefined {
  if (
    typeof window ===
    "undefined"
  ) {
    return undefined;
  }

  const token =
    window.localStorage.getItem(
      "token",
    ) ?? undefined;

  if (
    !token ||
    token.trim().length ===
      0
  ) {
    return undefined;
  }

  return token;
}

function authHeader(
  token?: string,
): Record<
  string,
  string
> {
  const resolvedToken =
    token ??
    getTokenFromStorage();

  if (!resolvedToken) {
    return {};
  }

  return {
    Authorization:
      `Bearer ${resolvedToken}`,
  };
}

async function readErrorBody(
  response: Response,
): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function fetchAdherenceExpected(
  params: {
    studyId: string;
    from: string;
    to: string;
    tz: string;
    userId?: string;
    token?: string;
  },
): Promise<
  OccurrenceOut[]
> {
  const query =
    new URLSearchParams({
      study_id:
        params.studyId,

      from:
        params.from,

      to:
        params.to,

      tz:
        params.tz,
    });

  if (
    params.userId
  ) {
    query.set(
      "user_id",
      params.userId,
    );
  }

  const response =
    await fetch(
      `${BASE}/expected?${query.toString()}`,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            params.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await readErrorBody(
        response,
      );

    throw new Error(
      [
        "Failed to load expected adherence schedule",
        `(${response.status} ${response.statusText})`,
        body,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return response.json();
}

export async function fetchAdherenceStructureCount(
  studyId: string,
  options?: {
    token?: string;
  },
): Promise<
  StructureCountOut
> {
  const query =
    new URLSearchParams({
      study_id:
        studyId,
    });

  const response =
    await fetch(
      `${BASE}/structure-count?${query.toString()}`,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            options?.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await readErrorBody(
        response,
      );

    throw new Error(
      [
        "Failed to load adherence structure",
        `(${response.status} ${response.statusText})`,
        body,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return response.json();
}