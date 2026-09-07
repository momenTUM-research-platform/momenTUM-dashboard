from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import DESCENDING, MongoClient

from auth import require_study_access
from models import User
from schemas import SurveyResponseOut

router = APIRouter()


# MongoDB setup

MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB")

if not MONGO_URL or not MONGO_DB:
    raise RuntimeError(
        "Missing MONGO_URL/MONGO_DB"
    )

client = MongoClient(MONGO_URL)
db = client[MONGO_DB]

responses_col = db["responses"]
studies_col = db["studies"]


# Shared parsing helpers

_TAG_RE = re.compile(
    r"<[^>]+>"
)

_STRONG_RE = re.compile(
    r"<strong\b[^>]*>(.*?)</strong>",
    re.IGNORECASE | re.DOTALL,
)

_MULTI_CODE_PREFIX_RE = re.compile(
    r"^\s*(-?\d+)\s+[—–-]\s+"
)

_NUM_RE = re.compile(
    r"([-+]?\d+(\.\d+)?)"
)


def _ensure_dt(
    value: Any,
) -> Optional[datetime]:
    if isinstance(
        value,
        datetime,
    ):
        return value

    if isinstance(
        value,
        str,
    ):
        normalized = (
            value.replace(
                "Z",
                "+00:00",
            )
            if value.endswith(
                "Z"
            )
            else value
        )

        try:
            return datetime.fromisoformat(
                normalized
            )
        except Exception:
            return None

    return None


def _parse_responses(
    value: Any,
) -> Dict[str, Any]:
    if isinstance(
        value,
        dict,
    ):
        return value

    if isinstance(
        value,
        str,
    ):
        try:
            parsed = json.loads(
                value
            )

            return (
                parsed
                if isinstance(
                    parsed,
                    dict,
                )
                else {}
            )
        except Exception:
            return {}

    return {}


def _strip_html_and_collapse_whitespace(
    value: Any,
) -> str:
    if value is None:
        return ""

    text = str(
        value
    )

    text = _TAG_RE.sub(
        " ",
        text,
    )

    text = html.unescape(
        text
    )

    return " ".join(
        text.split()
    )


def _get_option_display_label(
    raw_option: Any,
) -> str:
    raw = str(
        raw_option
    )

    strong_match = (
        _STRONG_RE.search(
            raw
        )
    )

    if strong_match:
        strong_text = (
            _strip_html_and_collapse_whitespace(
                strong_match.group(
                    1
                )
            )
        )

        if strong_text:
            return strong_text

    return (
        _strip_html_and_collapse_whitespace(
            raw
        )
    )


def _get_option_code(
    raw_option: Any,
    position: int,
) -> str:
    plain = (
        _strip_html_and_collapse_whitespace(
            raw_option
        )
    )

    coded_prefix = (
        _MULTI_CODE_PREFIX_RE.match(
            plain
        )
    )

    if coded_prefix:
        return coded_prefix.group(
            1
        )

    return str(
        position
    )


def _build_option_labels(
    options: List[Any],
) -> Dict[str, str]:
    option_labels: Dict[
        str,
        str,
    ] = {}

    for (
        index,
        option,
    ) in enumerate(
        options,
        start=1,
    ):
        code = (
            _get_option_code(
                option,
                index,
            )
        )

        label = (
            _get_option_display_label(
                option
            )
        )

        option_labels[
            code
        ] = label

    return option_labels


def _infer_multi_numeric(
    options: List[Any],
) -> Optional[
    Dict[str, float]
]:
    if not options:
        return None

    parsed: List[
        Optional[float]
    ] = []

    labels: List[
        str
    ] = []

    for option in options:
        text = (
            _strip_html_and_collapse_whitespace(
                option
            )
        )

        labels.append(
            text
        )

        match = (
            _NUM_RE.search(
                text
            )
        )

        parsed.append(
            float(
                match.group(
                    1
                )
            )
            if match
            else None
        )

    if all(
        value is None
        for value in parsed
    ):
        return None

    mapping: Dict[
        str,
        float,
    ] = {}

    for (
        index,
        (
            value,
            label,
        ),
    ) in enumerate(
        zip(
            parsed,
            labels,
        )
    ):
        score = (
            float(
                index
            )
            if value is None
            else float(
                value
            )
        )

        mapping[
            str(
                index
            )
        ] = score

        mapping[
            label
        ] = score

        mapping[
            str(
                int(
                    score
                )
            )
        ] = score

        if not (
            score.is_integer()
        ):
            mapping[
                str(
                    score
                )
            ] = score

    return mapping


@router.get(
    "/studies/{study_id}/responses",
    response_model=List[
        SurveyResponseOut
    ],
)
def list_study_responses(
    study_id: str,
    _user: User = Depends(
        require_study_access
    ),
):
    docs = list(
        responses_col.find(
            {
                "study_id":
                    study_id
            },
            projection={
                "_id": 0,
                "data_type": 1,
                "user_id": 1,
                "study_id": 1,
                "module_index": 1,
                "platform": 1,
                "module_id": 1,
                "module_name": 1,
                "responses": 1,
                "response_time": 1,
                "alert_time": 1,
            },
        ).sort(
            [
                (
                    "response_time",
                    DESCENDING,
                )
            ]
        )
    )

    if not docs:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No responses for "
                f"'{study_id}'"
            ),
        )

    out: List[
        SurveyResponseOut
    ] = []

    for doc in docs:
        out.append(
            SurveyResponseOut(
                data_type=doc.get(
                    "data_type"
                ),
                user_id=doc[
                    "user_id"
                ],
                study_id=doc[
                    "study_id"
                ],
                module_index=doc.get(
                    "module_index"
                ),
                platform=doc.get(
                    "platform"
                ),
                module_id=doc.get(
                    "module_id"
                ),
                module_name=doc.get(
                    "module_name"
                ),
                responses=_parse_responses(
                    doc.get(
                        "responses"
                    )
                ),
                response_time=_ensure_dt(
                    doc.get(
                        "response_time"
                    )
                ),
                alert_time=_ensure_dt(
                    doc.get(
                        "alert_time"
                    )
                ),
            )
        )

    return out


@router.get(
    "/studies/{study_id}/questions"
)
def list_study_questions(
    study_id: str,
    _user: User = Depends(
        require_study_access
    ),
):
    study_doc = (
        studies_col.find_one(
            {
                "properties.study_id":
                    study_id
            },
            projection={
                "_id": 0,
                "modules": 1,
            },
        )
    )

    if not study_doc:
        return []

    out = []

    for module in (
        study_doc.get(
            "modules"
        )
        or []
    ):
        module_id = (
            module.get(
                "id"
            )
        )

        module_name = (
            module.get(
                "name"
            )
            or module.get(
                "title"
            )
            or "Unnamed module"
        )

        params = (
            module.get(
                "params"
            )
            or {}
        )

        for section in (
            params.get(
                "sections"
            )
            or []
        ):
            for question in (
                section.get(
                    "questions"
                )
                or []
            ):
                question_id = (
                    question.get(
                        "id"
                    )
                )

                if not question_id:
                    continue

                question_type = (
                    question.get(
                        "type"
                    )
                )

                subtype = (
                    question.get(
                        "subtype"
                    )
                )

                role = (
                    question.get(
                        "role"
                    )
                )

                question_text = (
                    question.get(
                        "text"
                    )
                    or question.get(
                        "label"
                    )
                    or question_id
                )

                options = (
                    question.get(
                        "options"
                    )
                    or []
                )

                is_schema_numeric = (
                    question_type
                    == "number"
                    or (
                        question_type
                        == "text"
                        and subtype
                        == "numeric"
                    )
                )

                option_map = None
                option_labels: Dict[
                    str,
                    str,
                ] = {}

                if (
                    question_type
                    == "multi"
                ):
                    option_map = (
                        _infer_multi_numeric(
                            options
                        )
                    )

                    option_labels = (
                        _build_option_labels(
                            options
                        )
                    )

                out.append(
                    {
                        "module_id":
                            module_id,
                        "module_name":
                            module_name,

                        "question_id":
                            question_id,
                        "question_text":
                            question_text,

                        "type":
                            question_type,
                        "subtype":
                            subtype,
                        "role":
                            role,

                        "options":
                            options,

                        "yes_text":
                            question.get(
                                "yes_text"
                            ),
                        "no_text":
                            question.get(
                                "no_text"
                            ),

                        "is_numeric":
                            bool(
                                is_schema_numeric
                                or option_map
                            ),

                        "option_map":
                            option_map
                            or {},

                        "option_labels":
                            option_labels,
                    }
                )

    out.sort(
        key=lambda item: (
            item.get(
                "module_name"
            )
            or "",
            item.get(
                "question_text"
            )
            or "",
            item.get(
                "module_id"
            )
            or "",
            item.get(
                "question_id"
            )
            or "",
        )
    )

    return out


@router.get(
    "/studies/{study_id}/user-mapping"
)
def user_mapping(
    study_id: str,
    module_id: str = Query(
        ...
    ),
    question_id: str = Query(
        ...
    ),
    mode: str = Query(
        "latest",
        regex="^(latest|earliest)$",
    ),
    _user: User = Depends(
        require_study_access
    ),
):
    cursor = (
        responses_col.find(
            {
                "study_id":
                    study_id,
                "module_id":
                    module_id,
            },
            projection={
                "_id": 0,
                "user_id": 1,
                "responses": 1,
                "response_time": 1,
            },
        )
    )

    by_user: Dict[
        str,
        Dict[str, Any],
    ] = {}

    for doc in cursor:
        response_map = (
            _parse_responses(
                doc.get(
                    "responses"
                )
            )
        )

        if (
            question_id
            not in response_map
        ):
            continue

        response_time = (
            _ensure_dt(
                doc.get(
                    "response_time"
                )
            )
        )

        if not response_time:
            continue

        user_id = doc[
            "user_id"
        ]

        current = (
            by_user.get(
                user_id
            )
        )

        if not current:
            by_user[
                user_id
            ] = {
                "rt":
                    response_time,
                "val":
                    response_map[
                        question_id
                    ],
            }

            continue

        if (
            mode == "latest"
            and response_time
            > current["rt"]
        ):
            current.update(
                rt=response_time,
                val=response_map[
                    question_id
                ],
            )

        elif (
            mode
            == "earliest"
            and response_time
            < current["rt"]
        ):
            current.update(
                rt=response_time,
                val=response_map[
                    question_id
                ],
            )

    return {
        user_id:
            data["val"]
        for (
            user_id,
            data,
        ) in by_user.items()
    }