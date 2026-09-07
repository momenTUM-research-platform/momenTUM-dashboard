from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class CalendarNoteCreate(BaseModel):
    date: date

    user_id: Optional[str] = Field(
        default=None,
        min_length=1,
    )

    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
    )


class CalendarNoteUpdate(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
    )


class CalendarNoteOut(BaseModel):
    id: str

    study_id: str
    date: date

    user_id: Optional[str] = None

    text: str

    created_by: str

    created_at: datetime
    updated_at: datetime