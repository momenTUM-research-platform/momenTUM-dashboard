import {
  LabeledSurveyResponseOut,
} from "@/app/types/schemas";

/* ---------------------------------- */
/* Config                             */
/* ---------------------------------- */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "";

/* ---------------------------------- */
/* Types                              */
/* ---------------------------------- */

export type StudyQuestion = {
  module_id: string;
  module_name: string;

  question_id: string;
  question_text: string;

  type?: string | null;
  subtype?: string | null;

  role?: string | null;

  options?: string[];

  yes_text?: string | null;
  no_text?: string | null;

  is_numeric?: boolean;

  option_map?: Record<
    string,
    number
  >;

  option_labels?: Record<
    string,
    string
  >;
};

export type MappingMode =
  | "latest"
  | "earliest";

/**
 * Key: internal application user_id
 * Value: researcher-facing participant identifier
 */
export type UserMapping =
  Record<string, string>;

export type ResponseFilterOptions = {
  token?: string;

  user_id?: string[];
  module_id?: string[];

  from?: string;
  to?: string;

  match?: Array<
    [string, string]
  >;

  contains?: Array<
    [string, string]
  >;

  sort?: "asc" | "desc";
};

export type ResponseExportOptions =
  ResponseFilterOptions & {
    include_notes?: boolean;
  };

type FetchOptions =
  ResponseFilterOptions & {
    skip?: number;
    limit?: number;
  };

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

function appendResponseFilters(
  params: URLSearchParams,
  opts:
    ResponseFilterOptions = {},
) {
  opts.user_id?.forEach(
    (value) =>
      params.append(
        "user_id",
        value,
      ),
  );

  opts.module_id?.forEach(
    (value) =>
      params.append(
        "module_id",
        value,
      ),
  );

  if (opts.from) {
    params.append(
      "from",
      opts.from,
    );
  }

  if (opts.to) {
    params.append(
      "to",
      opts.to,
    );
  }

  opts.match?.forEach(
    ([key, value]) =>
      params.append(
        "match",
        `${key}:${value}`,
      ),
  );

  opts.contains?.forEach(
    ([key, value]) =>
      params.append(
        "contains",
        `${key}:${value}`,
      ),
  );

  if (opts.sort) {
    params.append(
      "sort",
      opts.sort,
    );
  }
}

function buildFetchQuery(
  opts: FetchOptions = {},
) {
  const params =
    new URLSearchParams();

  appendResponseFilters(
    params,
    opts,
  );

  if (!opts.sort) {
    params.set(
      "sort",
      "desc",
    );
  }

  params.set(
    "skip",
    String(
      opts.skip ?? 0,
    ),
  );

  params.set(
    "limit",
    String(
      opts.limit ?? 200,
    ),
  );

  return params.toString();
}

function buildExportQuery(
  opts:
    ResponseExportOptions = {},
) {
  const params =
    new URLSearchParams();

  appendResponseFilters(
    params,
    opts,
  );

  if (!opts.sort) {
    params.set(
      "sort",
      "asc",
    );
  }

  if (
    opts.include_notes
  ) {
    params.set(
      "include_notes",
      "true",
    );
  }

  return params.toString();
}

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

  return token &&
    token.trim().length > 0
    ? token
    : undefined;
}

function authHeader(
  token?: string,
): Record<string, string> {
  const resolvedToken =
    token ??
    getTokenFromStorage();

  return resolvedToken
    ? {
        Authorization:
          `Bearer ${resolvedToken}`,
      }
    : {};
}

function getDownloadFilename(
  response: Response,
  fallback: string,
): string {
  const disposition =
    response.headers.get(
      "Content-Disposition",
    );

  if (!disposition) {
    return fallback;
  }

  const utf8Match =
    disposition.match(
      /filename\*=UTF-8''([^;]+)/i,
    );

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(
        utf8Match[1],
      );
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch =
    disposition.match(
      /filename="([^"]+)"/i,
    );

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch =
    disposition.match(
      /filename=([^;]+)/i,
    );

  if (plainMatch?.[1]) {
    return plainMatch[1]
      .trim()
      .replace(
        /^["']|["']$/g,
        "",
      );
  }

  return fallback;
}

function safeFilenamePart(
  value: string,
): string {
  const cleaned =
    value.replace(
      /[^A-Za-z0-9._-]+/g,
      "_",
    );

  return (
    cleaned ||
    "study"
  );
}

/* ---------------------------------- */
/* Study questions                    */
/* ---------------------------------- */

export async function fetchStudyQuestions(
  studyId: string,
  opts?: {
    token?: string;
  },
): Promise<
  StudyQuestion[]
> {
  const url =
    `${API_BASE}/api/studies/` +
    `${encodeURIComponent(
      studyId,
    )}/questions`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            opts?.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `Fetch questions failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  return response.json();
}

/* ---------------------------------- */
/* Labeled responses                  */
/* ---------------------------------- */

export async function fetchLabeledResponses(
  studyId: string,
  opts: FetchOptions = {},
): Promise<
  LabeledSurveyResponseOut[]
> {
  const query =
    buildFetchQuery(
      opts,
    );

  const url =
    `${API_BASE}/api/studies/` +
    `${encodeURIComponent(
      studyId,
    )}/responses:labeled?${query}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            opts.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `Fetch failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  return response.json();
}

/* ---------------------------------- */
/* Data export                        */
/* ---------------------------------- */

export async function downloadResponsesCsv(
  studyId: string,
  opts:
    ResponseExportOptions = {},
): Promise<void> {
  const query =
    buildExportQuery(
      opts,
    );

  const querySuffix =
    query
      ? `?${query}`
      : "";

  const url =
    `${API_BASE}/api/studies/` +
    `${encodeURIComponent(
      studyId,
    )}/responses:export${querySuffix}`;

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          Accept:
            opts.include_notes
              ? "application/zip"
              : "text/csv",

          ...authHeader(
            opts.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `Export failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  const blob =
    await response.blob();

  const safeStudyId =
    safeFilenamePart(
      studyId,
    );

  const fallbackFilename =
    opts.include_notes
      ? `${safeStudyId}_export.zip`
      : `${safeStudyId}_responses.csv`;

  const filename =
    getDownloadFilename(
      response,
      fallbackFilename,
    );

  const objectUrl =
    window.URL.createObjectURL(
      blob,
    );

  const link =
    document.createElement(
      "a",
    );

  link.href =
    objectUrl;

  link.download =
    filename;

  document.body.appendChild(
    link,
  );

  link.click();

  link.remove();

  window.URL.revokeObjectURL(
    objectUrl,
  );
}

/* ---------------------------------- */
/* Facets                             */
/* ---------------------------------- */

export type Facets = {
  users: string[];

  modules: Array<{
    id: string;
    name: string;
  }>;
};

export async function fetchFacets(
  studyId: string,
  opts: Pick<
    FetchOptions,
    | "token"
    | "user_id"
    | "module_id"
    | "from"
    | "to"
  > = {},
): Promise<
  Facets
> {
  const params =
    new URLSearchParams();

  opts.user_id?.forEach(
    (value) =>
      params.append(
        "user_id",
        value,
      ),
  );

  opts.module_id?.forEach(
    (value) =>
      params.append(
        "module_id",
        value,
      ),
  );

  if (opts.from) {
    params.append(
      "from",
      opts.from,
    );
  }

  if (opts.to) {
    params.append(
      "to",
      opts.to,
    );
  }

  const url =
    `${API_BASE}/api/studies/` +
    `${encodeURIComponent(
      studyId,
    )}/responses:facets?${params.toString()}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            opts.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `Facets failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  return response.json();
}

/* ---------------------------------- */
/* Participant mapping                */
/* ---------------------------------- */

export async function fetchUserMapping(
  studyId: string,
  args: {
    module_id: string;
    question_id: string;

    mode?: MappingMode;
    token?: string;
  },
): Promise<
  UserMapping
> {
  const params =
    new URLSearchParams();

  params.set(
    "module_id",
    args.module_id,
  );

  params.set(
    "question_id",
    args.question_id,
  );

  params.set(
    "mode",
    args.mode ??
      "latest",
  );

  const url =
    `${API_BASE}/api/studies/` +
    `${encodeURIComponent(
      studyId,
    )}/user-mapping?${params.toString()}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",

          ...authHeader(
            args.token,
          ),
        },

        cache:
          "no-store",
      },
    );

  if (!response.ok) {
    const text =
      await response
        .text()
        .catch(
          () => "",
        );

    throw new Error(
      `Fetch mapping failed: ${response.status} ${response.statusText} ${text}`,
    );
  }

  return response.json();
}

export function withMappedLabel(
  rows:
    LabeledSurveyResponseOut[],
  mapping:
    UserMapping,
  fieldName:
    | "mapped_label"
    | string =
    "mapped_label",
): Array<
  LabeledSurveyResponseOut & {
    [key: string]:
      | string
      | undefined;
  }
> {
  return rows.map(
    (row) => ({
      ...row,

      [fieldName]:
        mapping[
          row.user_id
        ],
    }),
  );
}