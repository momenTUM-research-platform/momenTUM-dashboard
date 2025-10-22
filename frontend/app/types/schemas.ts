export type AnswerValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;

export interface QuestionAnswer {
  question_id: string;
  question_text?: string | null;
  answer: AnswerValue;
}

export interface LabeledSurveyResponseOut {
  data_type: 'survey_response';
  user_id: string;
  study_id: string;
  module_index?: number | null;
  platform?: string | null;
  module_id: string;
  module_name: string;
  response_time: string;      // ISO string from backend
  alert_time?: string | null; // ISO string from backend
  responses: Record<string, AnswerValue>;
  answers: QuestionAnswer[];
}

export type FacetsOut = {
    users: string[];
    modules: { id: string; name: string }[];
  };