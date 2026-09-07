export type RoleKey =
  | "trySleepTime"
  | "outOfBedTime"
  | "sleepLatencyMin"
  | "finalAwakeningTime"
  | "awakeningsCount"
  | "awakeningsDurationMin"
  | "napMinutes"
  | "napCount";

export type SleepRow = {
  user_id: string;
  date: string;

  trySleepTime: Date | null;
  outOfBedTime: Date | null;

  sleepLatencyMin: number | null;
  finalAwakeningTime: Date | null;

  awakeningsCount: number | null;
  awakeningsDurationMin: number | null;

  napMinutes: number | null;
  napCount: number | null;

  sleepOnsetTime: Date | null;
  sleepDurationMin: number | null;
  sleepDurationInclNapsMin: number | null;
};

export type InferredStudyQuestion = {
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
};
