from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EventOut(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")

    event_type: str
    user_id: str
    study_id: str
    timestamp: datetime

    task_id: Optional[str] = None
    module_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class ParticipantEventsOut(BaseModel):
    study_id: str
    user_id: str
    events: List[EventOut]