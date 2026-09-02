export type TrackingEvent = {
  _id?: string;

  event_type:
    | "enrolled"
    | "notification_scheduled"
    | "notification_delivered"
    | "notification_tapped"
    | "module_visible"
    | "module_opened"
    | "module_submitted"
    | "unenrolled";

  user_id: string;
  study_id: string;
  timestamp: string;
  timezone: string;

  task_id?: string | null;
  module_id?: string | null;

  metadata?: Record<string, unknown>;
};
  
  export type ParticipantEventsOut = {
    study_id: string;
    user_id: string;
    events: TrackingEvent[];
  };
  
  const BASE = "/api/v2/events";
  
  function getTokenFromStorage(): string | undefined {
    if (typeof window === "undefined") return undefined;
  
    const token =
      window.localStorage.getItem("token") ??
      undefined;
  
    return token && token.trim().length > 0
      ? token
      : undefined;
  }
  
  function authHeader(
    token?: string,
  ): Record<string, string> {
    const resolvedToken =
      token ?? getTokenFromStorage();
  
    return resolvedToken
      ? {
          Authorization: `Bearer ${resolvedToken}`,
        }
      : {};
  }
  
  export async function fetchParticipantEvents(
    params: {
      studyId: string;
      userId: string;
      eventType?: TrackingEvent["event_type"];
      limit?: number;
      token?: string;
    },
  ): Promise<ParticipantEventsOut> {
    const query = new URLSearchParams({
      study_id: params.studyId,
      user_id: params.userId,
    });
  
    if (params.eventType) {
      query.set(
        "event_type",
        params.eventType,
      );
    }
  
    if (params.limit) {
      query.set(
        "limit",
        String(params.limit),
      );
    }
  
    const response = await fetch(
      `${BASE}/participant?${query.toString()}`,
      {
        headers: {
          Accept: "application/json",
          ...authHeader(params.token),
        },
        cache: "no-store",
      },
    );
  
    if (!response.ok) {
      const text =
        await response.text().catch(() => "");
  
      throw new Error(
        `participant-events: ${response.status} ${response.statusText} ${text}`,
      );
    }
  
    return response.json();
  }