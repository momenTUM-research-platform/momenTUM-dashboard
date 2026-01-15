# schemas/responses.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel

class SurveyResponseOut(BaseModel):
    data_type: Optional[str] = None
    user_id: str
    study_id: str
    module_index: Optional[int] = None
    platform: Optional[str] = None
    module_id: Optional[str] = None
    module_name: Optional[str] = None
    responses: Dict[str, Any]
    response_time: Optional[datetime] = None
    alert_time: Optional[datetime] = None

class QuestionAnswer(BaseModel):
    question_id: str
    question_text: Optional[str] = None
    answer: Any

class LabeledSurveyResponseOut(BaseModel):
    data_type: str = "survey_response"
    user_id: str
    study_id: str
    module_index: Optional[int] = None
    platform: Optional[str] = None
    module_id: str
    module_name: str
    response_time: datetime
    alert_time: Optional[datetime] = None
    responses: Dict[str, Any]
    answers: List[QuestionAnswer]