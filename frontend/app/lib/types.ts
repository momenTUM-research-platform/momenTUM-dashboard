export type RoleKey = "bedtime" | "risetime" | "diaryDate" | "awakenings" | "napMinutes";

export type SleepRow = {
  user_id: string;
  date: string;               // YYYY-MM-DD
  bedtime?: Date | null;
  risetime?: Date | null;
  durationMin?: number | null;
  awakenings?: number | null;
  napMinutes?: number | null;
};

export type VarRow = {
  user_id: string;
  t: number;                  // ms epoch
  varId: string;              // module_id:question_id
  value: number;
  label: string;
};

export type InferredStudyQuestion = {
  module_id: string;
  module_name: string;
  question_id: string;
  question_text: string;
  type?: string;
  subtype?: string | null;
  is_numeric?: boolean;
  option_map?: Record<string, number>;
};