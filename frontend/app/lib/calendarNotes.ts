export type CalendarNote = {
    id: string;
  
    study_id: string;
    date: string;
  
    user_id: string | null;
  
    text: string;
  
    created_by: string;
  
    created_at: string;
    updated_at: string;
  };
  
  type FetchCalendarNotesOptions = {
    from_date?: string;
    to_date?: string;
  
    user_id?: string;
  };
  
  function getAuthToken(): string {
    const token =
      localStorage.getItem(
        "token",
      );
  
    if (!token) {
      throw new Error(
        "Authentication token is not available.",
      );
    }
  
    return token;
  }
  
  async function getErrorMessage(
    response: Response,
  ): Promise<string> {
    try {
      const body =
        await response.json();
  
      if (
        typeof body?.detail ===
        "string"
      ) {
        return body.detail;
      }
    } catch {
      // Fall back to the HTTP status below.
    }
  
    return `Request failed with status ${response.status}.`;
  }
  
  export async function fetchCalendarNotes(
    studyId: string,
    options: FetchCalendarNotesOptions = {},
  ): Promise<CalendarNote[]> {
    const params =
      new URLSearchParams({
        study_id: studyId,
      });
  
    if (options.from_date) {
      params.set(
        "from_date",
        options.from_date,
      );
    }
  
    if (options.to_date) {
      params.set(
        "to_date",
        options.to_date,
      );
    }
  
    if (options.user_id) {
      params.set(
        "user_id",
        options.user_id,
      );
    }
  
    const response =
      await fetch(
        `/api/v2/calendar-notes?${params.toString()}`,
        {
          headers: {
            Authorization:
              `Bearer ${getAuthToken()}`,
          },
  
          cache: "no-store",
        },
      );
  
    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
        ),
      );
    }
  
    return response.json();
  }
  
  export async function createCalendarNote(
    studyId: string,
    payload: {
      date: string;
  
      user_id:
        | string
        | null;
  
      text: string;
    },
  ): Promise<CalendarNote> {
    const params =
      new URLSearchParams({
        study_id: studyId,
      });
  
    const response =
      await fetch(
        `/api/v2/calendar-notes?${params.toString()}`,
        {
          method: "POST",
  
          headers: {
            "Content-Type":
              "application/json",
  
            Authorization:
              `Bearer ${getAuthToken()}`,
          },
  
          body: JSON.stringify(
            payload,
          ),
        },
      );
  
    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
        ),
      );
    }
  
    return response.json();
  }
  
  export async function updateCalendarNote(
    studyId: string,
    noteId: string,
    text: string,
  ): Promise<CalendarNote> {
    const params =
      new URLSearchParams({
        study_id: studyId,
      });
  
    const response =
      await fetch(
        `/api/v2/calendar-notes/${encodeURIComponent(
          noteId,
        )}?${params.toString()}`,
        {
          method: "PATCH",
  
          headers: {
            "Content-Type":
              "application/json",
  
            Authorization:
              `Bearer ${getAuthToken()}`,
          },
  
          body: JSON.stringify({
            text,
          }),
        },
      );
  
    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
        ),
      );
    }
  
    return response.json();
  }
  
  export async function deleteCalendarNote(
    studyId: string,
    noteId: string,
  ): Promise<void> {
    const params =
      new URLSearchParams({
        study_id: studyId,
      });
  
    const response =
      await fetch(
        `/api/v2/calendar-notes/${encodeURIComponent(
          noteId,
        )}?${params.toString()}`,
        {
          method: "DELETE",
  
          headers: {
            Authorization:
              `Bearer ${getAuthToken()}`,
          },
        },
      );
  
    if (!response.ok) {
      throw new Error(
        await getErrorMessage(
          response,
        ),
      );
    }
  }