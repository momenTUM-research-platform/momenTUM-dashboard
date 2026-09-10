from __future__ import annotations

import csv
import html
import io
import json
import os
import re
import zipfile

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import (
    APIRouter,
    Depends,
    Query,
    Response,
)
from pymongo import (
    ASCENDING,
    DESCENDING,
    MongoClient,
)

from auth import require_study_access
from models import User
from schemas import (
    LabeledSurveyResponseOut,
    QuestionAnswer,
)

router = APIRouter()


# MongoDB

MONGO_URL = os.getenv(
    "MONGO_URL"
)

MONGO_DB = os.getenv(
    "MONGO_DB"
)

if (
    not MONGO_URL
    or not MONGO_DB
):
    raise RuntimeError(
        "Missing MONGO_URL/MONGO_DB"
    )

client = MongoClient(
    MONGO_URL
)

db = client[
    MONGO_DB
]

responses_col = db[
    "responses"
]

studies_col = db[
    "studies"
]

notes_col = db[
    "calendar_notes"
]


# Parsing helpers

_TAG_RE = re.compile(
    r"<[^>]+>"
)

_STRONG_RE = re.compile(
    r"<strong\b[^>]*>(.*?)</strong>",
    re.IGNORECASE
    | re.DOTALL,
)

_MULTI_CODE_PREFIX_RE = re.compile(
    r"^\s*(-?\d+)\s+[—–-]\s+"
)

_DATE_PREFIX_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})"
)


def _dt(
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


def _iso_datetime(
    value: Any,
) -> str:
    parsed = _dt(
        value
    )

    if parsed:
        return parsed.isoformat()

    if value is None:
        return ""

    return str(
        value
    )


def _calendar_date(
    value: Optional[str],
) -> Optional[str]:
    if not value:
        return None

    match = _DATE_PREFIX_RE.match(
        value.strip()
    )

    if match:
        return match.group(
            1
        )

    parsed = _dt(
        value
    )

    if parsed:
        return parsed.date().isoformat()

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


def _explode(
    values: Optional[
        List[str]
    ],
) -> Optional[
    List[str]
]:
    if not values:
        return None

    out: List[
        str
    ] = []

    for value in values:
        out.extend(
            [
                item.strip()
                for item in value.split(
                    ","
                )
                if item.strip()
            ]
        )

    return (
        out
        or None
    )


def _parse_pairs(
    pairs: List[str],
) -> List[
    Tuple[str, str]
]:
    out: List[
        Tuple[
            str,
            str,
        ]
    ] = []

    for pair in pairs:
        if ":" not in pair:
            continue

        key, value = pair.split(
            ":",
            1,
        )

        key = key.strip()
        value = value.strip()

        if (
            key
            and value
        ):
            out.append(
                (
                    key,
                    value,
                )
            )

    return out


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
        return (
            coded_prefix.group(
                1
            )
        )

    return str(
        position
    )


def _build_option_labels(
    options: List[Any],
) -> Dict[
    str,
    str,
]:
    labels: Dict[
        str,
        str,
    ] = {}

    for (
        position,
        option,
    ) in enumerate(
        options,
        start=1,
    ):
        code = (
            _get_option_code(
                option,
                position,
            )
        )

        label = (
            _get_option_display_label(
                option
            )
        )

        labels[
            code
        ] = label

    return labels


def _serialize_answer(
    value: Any,
) -> str:
    if value is None:
        return ""

    if isinstance(
        value,
        bool,
    ):
        return (
            "true"
            if value
            else "false"
        )

    if isinstance(
        value,
        (
            dict,
            list,
        ),
    ):
        return json.dumps(
            value,
            ensure_ascii=False,
        )

    return str(
        value
    )


def _safe_study_id(
    study_id: str,
) -> str:
    return (
        re.sub(
            r"[^A-Za-z0-9._-]+",
            "_",
            study_id,
        )
        or "study"
    )


# Study question metadata

def _index_questions(
    study_doc: Optional[
        dict
    ],
) -> Dict[
    str,
    Dict[
        str,
        Dict[str, Any],
    ],
]:
    out: Dict[
        str,
        Dict[
            str,
            Dict[str, Any],
        ],
    ] = {}

    if not study_doc:
        return out

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

        if not module_id:
            continue

        question_map: Dict[
            str,
            Dict[str, Any],
        ] = {}

        params = (
            module.get(
                "params"
            )
            or {}
        )

        sections = (
            params.get(
                "sections"
            )
            or []
        )

        for section in sections:
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

                options = (
                    question.get(
                        "options"
                    )
                    or []
                )

                option_labels: Dict[
                    str,
                    str,
                ] = {}

                if (
                    question_type
                    == "multi"
                ):
                    option_labels = (
                        _build_option_labels(
                            options
                        )
                    )

                question_map[
                    question_id
                ] = {
                    "text":
                        question.get(
                            "text"
                        )
                        or question.get(
                            "label"
                        )
                        or question_id,

                    "type":
                        question_type,

                    "subtype":
                        question.get(
                            "subtype"
                        ),

                    "yes_text":
                        question.get(
                            "yes_text"
                        ),

                    "no_text":
                        question.get(
                            "no_text"
                        ),

                    "option_labels":
                        option_labels,
                }

        out[
            module_id
        ] = question_map

    return out


# Response filtering

def _build_response_query(
    study_id: str,
    user_id: Optional[
        List[str]
    ],
    module_id: Optional[
        List[str]
    ],
    platform: Optional[str],
    from_: Optional[str],
    to: Optional[str],
) -> Dict[
    str,
    Any,
]:
    users = _explode(
        user_id
    )

    modules = _explode(
        module_id
    )

    query: Dict[
        str,
        Any,
    ] = {
        "study_id":
            study_id
    }

    if users:
        query[
            "user_id"
        ] = {
            "$in":
                users
        }

    if modules:
        query[
            "module_id"
        ] = {
            "$in":
                modules
        }

    if (
        platform
        == "unknown"
    ):
        query[
            "platform"
        ] = {
            "$nin": [
                "android",
                "iphone",
            ]
        }
    elif platform:
        query[
            "platform"
        ] = platform

    if (
        from_
        or to
    ):
        date_range: Dict[
            str,
            Any,
        ] = {}

        if from_:
            parsed_from = (
                _dt(
                    from_
                )
            )

            if parsed_from:
                date_range[
                    "$gte"
                ] = (
                    parsed_from.isoformat()
                )

        if to:
            parsed_to = (
                _dt(
                    to
                )
            )

            if parsed_to:
                date_range[
                    "$lte"
                ] = (
                    parsed_to.isoformat()
                )

        if date_range:
            query[
                "response_time"
            ] = date_range

    return query


def _build_notes_query(
    study_id: str,
    user_id: Optional[
        List[str]
    ],
    from_: Optional[str],
    to: Optional[str],
) -> Dict[
    str,
    Any,
]:
    users = _explode(
        user_id
    )

    query: Dict[
        str,
        Any,
    ] = {
        "study_id":
            study_id
    }

    if users:
        query[
            "$or"
        ] = [
            {
                "user_id": {
                    "$in":
                        users
                }
            },
            {
                "user_id":
                    None
            },
        ]

    from_date = (
        _calendar_date(
            from_
        )
    )

    to_date = (
        _calendar_date(
            to
        )
    )

    if (
        from_date
        or to_date
    ):
        date_query: Dict[
            str,
            Any,
        ] = {}

        if from_date:
            date_query[
                "$gte"
            ] = from_date

        if to_date:
            date_query[
                "$lte"
            ] = to_date

        query[
            "date"
        ] = date_query

    return query


def _matches_response_filters(
    response_map: Dict[
        str,
        Any,
    ],
    exact_pairs: List[
        Tuple[
            str,
            str,
        ]
    ],
    contains_pairs: List[
        Tuple[
            str,
            str,
        ]
    ],
) -> bool:
    if (
        exact_pairs
        and any(
            str(
                response_map.get(
                    question_id,
                    "",
                )
            )
            != expected
            for (
                question_id,
                expected,
            ) in exact_pairs
        )
    ):
        return False

    if (
        contains_pairs
        and any(
            substring
            not in str(
                response_map.get(
                    question_id,
                    "",
                )
            )
            for (
                question_id,
                substring,
            ) in contains_pairs
        )
    ):
        return False

    return True


# Answer labels

def _decode_multi_answer(
    answer: Any,
    option_labels: Dict[
        str,
        str,
    ],
) -> str:
    if (
        answer is None
        or not option_labels
    ):
        return ""

    raw = str(
        answer
    ).strip()

    if not raw:
        return ""

    parts = [
        part.strip()
        for part in raw.split(
            ";"
        )
        if part.strip()
    ]

    if not parts:
        return ""

    labels = [
        option_labels.get(
            part,
            part,
        )
        for part in parts
    ]

    return "; ".join(
        labels
    )


def _human_readable_answer(
    answer: Any,
    question_meta: Optional[
        Dict[str, Any]
    ],
) -> str:
    if not question_meta:
        return ""

    question_type = (
        question_meta.get(
            "type"
        )
    )

    if (
        question_type
        == "multi"
    ):
        return (
            _decode_multi_answer(
                answer,
                question_meta.get(
                    "option_labels"
                )
                or {},
            )
        )

    return ""


# Export builders

def _build_responses_csv(
    study_id: str,
    user_id: Optional[
        List[str]
    ],
    module_id: Optional[
        List[str]
    ],
    platform: Optional[str],
    from_: Optional[str],
    to: Optional[str],
    match: List[str],
    contains: List[str],
    sort: str,
) -> str:
    query = (
        _build_response_query(
            study_id=
                study_id,

            user_id=
                user_id,

            module_id=
                module_id,

            platform=
                platform,

            from_=
                from_,

            to=
                to,
        )
    )

    exact_pairs = (
        _parse_pairs(
            match
        )
    )

    contains_pairs = (
        _parse_pairs(
            contains
        )
    )

    sort_direction = (
        DESCENDING
        if sort
        == "desc"
        else ASCENDING
    )

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

    question_index = (
        _index_questions(
            study_doc
        )
    )

    cursor = (
        responses_col.find(
            query,
            projection={
                "_id": 0,
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
        )
        .sort(
            [
                (
                    "response_time",
                    sort_direction,
                )
            ]
        )
    )

    output = io.StringIO()

    writer = csv.writer(
        output
    )

    writer.writerow(
        [
            "study_id",
            "user_id",
            "module_id",
            "module_name",
            "module_index",
            "platform",
            "scheduled_time",
            "submitted_time",
            "question_id",
            "question_text",
            "answer_raw",
            "answer_label",
        ]
    )

    for doc in cursor:
        response_map = (
            _parse_responses(
                doc.get(
                    "responses"
                )
            )
        )

        if not (
            _matches_response_filters(
                response_map,
                exact_pairs,
                contains_pairs,
            )
        ):
            continue

        module_id_value = (
            doc.get(
                "module_id"
            )
            or "unknown_module"
        )

        module_name = (
            doc.get(
                "module_name"
            )
            or "Unknown Module"
        )

        module_questions = (
            question_index.get(
                module_id_value,
                {},
            )
        )

        for (
            question_id,
            answer,
        ) in response_map.items():
            question_meta = (
                module_questions.get(
                    question_id
                )
            )

            question_text = (
                question_meta.get(
                    "text"
                )
                if question_meta
                else question_id
            )

            answer_raw = (
                _serialize_answer(
                    answer
                )
            )

            answer_label = (
                _human_readable_answer(
                    answer,
                    question_meta,
                )
            )

            writer.writerow(
                [
                    doc.get(
                        "study_id",
                        study_id,
                    ),

                    doc.get(
                        "user_id",
                        "",
                    ),

                    module_id_value,

                    module_name,

                    doc.get(
                        "module_index",
                        "",
                    ),

                    doc.get(
                        "platform",
                        "",
                    ),

                    _iso_datetime(
                        doc.get(
                            "alert_time"
                        )
                    ),

                    _iso_datetime(
                        doc.get(
                            "response_time"
                        )
                    ),

                    question_id,

                    question_text,

                    answer_raw,

                    answer_label,
                ]
            )

    csv_content = (
        "\ufeff"
        + output.getvalue()
    )

    output.close()

    return csv_content


def _build_notes_csv(
    study_id: str,
    user_id: Optional[
        List[str]
    ],
    from_: Optional[str],
    to: Optional[str],
) -> str:
    query = (
        _build_notes_query(
            study_id=
                study_id,

            user_id=
                user_id,

            from_=
                from_,

            to=
                to,
        )
    )

    cursor = (
        notes_col.find(
            query,
            projection={
                "_id": 1,
                "study_id": 1,
                "date": 1,
                "user_id": 1,
                "text": 1,
                "created_by": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        )
        .sort(
            [
                (
                    "date",
                    ASCENDING,
                ),
                (
                    "created_at",
                    ASCENDING,
                ),
            ]
        )
    )

    output = io.StringIO()

    writer = csv.writer(
        output
    )

    writer.writerow(
        [
            "study_id",
            "note_id",
            "date",
            "user_id",
            "scope",
            "text",
            "created_by",
            "created_at",
            "updated_at",
        ]
    )

    for doc in cursor:
        note_user_id = (
            doc.get(
                "user_id"
            )
        )

        writer.writerow(
            [
                doc.get(
                    "study_id",
                    study_id,
                ),

                str(
                    doc.get(
                        "_id",
                        "",
                    )
                ),

                doc.get(
                    "date",
                    "",
                ),

                note_user_id
                or "",

                (
                    "participant"
                    if note_user_id
                    else "study"
                ),

                doc.get(
                    "text",
                    "",
                ),

                doc.get(
                    "created_by",
                    "",
                ),

                _iso_datetime(
                    doc.get(
                        "created_at"
                    )
                ),

                _iso_datetime(
                    doc.get(
                        "updated_at"
                    )
                ),
            ]
        )

    csv_content = (
        "\ufeff"
        + output.getvalue()
    )

    output.close()

    return csv_content


# Facets

@router.get(
    "/studies/{study_id}/responses:facets"
)
def list_response_facets(
    study_id: str,
    user_id: Optional[
        List[str]
    ] = Query(
        default=None
    ),
    module_id: Optional[
        List[str]
    ] = Query(
        default=None
    ),
    from_: Optional[
        str
    ] = Query(
        default=None,
        alias="from",
    ),
    to: Optional[
        str
    ] = Query(
        default=None
    ),
    _user: User = Depends(
        require_study_access
    ),
):
    query = (
        _build_response_query(
            study_id=
                study_id,

            user_id=
                user_id,

            module_id=
                module_id,

            platform=
                None,

            from_=
                from_,

            to=
                to,
        )
    )

    users_out = sorted(
        set(
            responses_col.distinct(
                "user_id",
                query,
            )
        )
    )

    pipeline = [
        {
            "$match":
                query
        },
        {
            "$group": {
                "_id": {
                    "id":
                        "$module_id",
                    "name":
                        "$module_name",
                }
            }
        },
        {
            "$project": {
                "_id": 0,
                "id":
                    "$_id.id",
                "name":
                    "$_id.name",
            }
        },
    ]

    modules_out = list(
        responses_col.aggregate(
            pipeline
        )
    )

    modules_out.sort(
        key=lambda module: (
            module.get(
                "name"
            )
            or "",
            module.get(
                "id"
            )
            or "",
        )
    )

    all_count = (
        responses_col.count_documents(
            query
        )
    )

    android_query = {
        **query,
        "platform":
            "android",
    }

    iphone_query = {
        **query,
        "platform":
            "iphone",
    }

    unknown_query = {
        **query,
        "platform": {
            "$nin": [
                "android",
                "iphone",
            ]
        },
    }

    android_count = (
        responses_col.count_documents(
            android_query
        )
    )

    iphone_count = (
        responses_col.count_documents(
            iphone_query
        )
    )

    unknown_count = (
        responses_col.count_documents(
            unknown_query
        )
    )

    return {
        "users":
            users_out,

        "modules":
            modules_out,

        "platforms": {
            "all":
                all_count,

            "android":
                android_count,

            "iphone":
                iphone_count,

            "unknown":
                unknown_count,
        },
    }


# Labeled responses

@router.get(
    "/studies/{study_id}/responses:labeled",
    response_model=List[
        LabeledSurveyResponseOut
    ],
)
def list_study_responses_labeled(
    study_id: str,

    user_id: Optional[
        List[str]
    ] = Query(
        default=None,
        description=(
            "Repeatable or "
            "comma-separated"
        ),
    ),

    module_id: Optional[
        List[str]
    ] = Query(
        default=None,
        description=(
            "Repeatable or "
            "comma-separated"
        ),
    ),

    platform: Optional[
        str
    ] = Query(
        default=None,
        regex=(
            "^(android|iphone|unknown)$"
        ),
        description=(
            "Response platform"
        ),
    ),

    from_: Optional[
        str
    ] = Query(
        default=None,
        alias="from",
        description="ISO datetime",
    ),

    to: Optional[
        str
    ] = Query(
        default=None,
        description="ISO datetime",
    ),

    match: List[
        str
    ] = Query(
        default=[],
        description=(
            "Repeat qid:value "
            "for exact match"
        ),
    ),

    contains: List[
        str
    ] = Query(
        default=[],
        description=(
            "Repeat "
            "qid:substring"
        ),
    ),

    sort: str = Query(
        default="desc",
        regex="^(asc|desc)$",
    ),

    skip: int = 0,

    limit: int = 100,

    _user: User = Depends(
        require_study_access
    ),
):
    query = (
        _build_response_query(
            study_id=
                study_id,

            user_id=
                user_id,

            module_id=
                module_id,

            platform=
                platform,

            from_=
                from_,

            to=
                to,
        )
    )

    sort_direction = (
        DESCENDING
        if sort
        == "desc"
        else ASCENDING
    )

    safe_skip = max(
        0,
        skip,
    )

    safe_limit = max(
        1,
        min(
            1000,
            limit,
        ),
    )

    docs = list(
        responses_col.find(
            query,
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
        )
        .sort(
            [
                (
                    "response_time",
                    sort_direction,
                )
            ]
        )
        .skip(
            safe_skip
        )
        .limit(
            safe_limit
        )
    )

    if not docs:
        return []

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

    question_index = (
        _index_questions(
            study_doc
        )
    )

    exact_pairs = (
        _parse_pairs(
            match
        )
    )

    contains_pairs = (
        _parse_pairs(
            contains
        )
    )

    out: List[
        LabeledSurveyResponseOut
    ] = []

    for doc in docs:
        response_map = (
            _parse_responses(
                doc.get(
                    "responses"
                )
            )
        )

        if not (
            _matches_response_filters(
                response_map,
                exact_pairs,
                contains_pairs,
            )
        ):
            continue

        module_id_value = (
            doc.get(
                "module_id"
            )
            or "unknown_module"
        )

        response_time = (
            _dt(
                doc.get(
                    "response_time"
                )
            )
            or datetime.utcnow()
        )

        module_questions = (
            question_index.get(
                module_id_value,
                {},
            )
        )

        answers = [
            QuestionAnswer(
                question_id=
                    question_id,

                question_text=(
                    module_questions.get(
                        question_id,
                        {},
                    ).get(
                        "text"
                    )
                ),

                answer=
                    answer,
            )
            for (
                question_id,
                answer,
            ) in response_map.items()
        ]

        out.append(
            LabeledSurveyResponseOut(
                data_type=
                    doc.get(
                        "data_type",
                        "survey_response",
                    ),

                user_id=
                    doc[
                        "user_id"
                    ],

                study_id=
                    doc[
                        "study_id"
                    ],

                module_index=
                    doc.get(
                        "module_index"
                    ),

                platform=
                    doc.get(
                        "platform"
                    ),

                module_id=
                    module_id_value,

                module_name=(
                    doc.get(
                        "module_name"
                    )
                    or "Unknown Module"
                ),

                responses=
                    response_map,

                response_time=
                    response_time,

                alert_time=
                    _dt(
                        doc.get(
                            "alert_time"
                        )
                    ),

                answers=
                    answers,
            )
        )

    return out


# Data export

@router.get(
    "/studies/{study_id}/responses:export"
)
def export_study_responses(
    study_id: str,

    user_id: Optional[
        List[str]
    ] = Query(
        default=None,
        description=(
            "Repeatable or "
            "comma-separated"
        ),
    ),

    module_id: Optional[
        List[str]
    ] = Query(
        default=None,
        description=(
            "Repeatable or "
            "comma-separated"
        ),
    ),

    platform: Optional[
        str
    ] = Query(
        default=None,
        regex=(
            "^(android|iphone|unknown)$"
        ),
        description=(
            "Response platform"
        ),
    ),

    from_: Optional[
        str
    ] = Query(
        default=None,
        alias="from",
        description="ISO datetime",
    ),

    to: Optional[
        str
    ] = Query(
        default=None,
        description="ISO datetime",
    ),

    match: List[
        str
    ] = Query(
        default=[],
        description=(
            "Repeat qid:value "
            "for exact match"
        ),
    ),

    contains: List[
        str
    ] = Query(
        default=[],
        description=(
            "Repeat "
            "qid:substring"
        ),
    ),

    sort: str = Query(
        default="asc",
        regex="^(asc|desc)$",
    ),

    include_notes: bool = Query(
        default=False,
        description=(
            "Include calendar notes "
            "as a second CSV in a ZIP archive."
        ),
    ),

    _user: User = Depends(
        require_study_access
    ),
):
    responses_csv = (
        _build_responses_csv(
            study_id=
                study_id,

            user_id=
                user_id,

            module_id=
                module_id,

            platform=
                platform,

            from_=
                from_,

            to=
                to,

            match=
                match,

            contains=
                contains,

            sort=
                sort,
        )
    )

    safe_study_id = (
        _safe_study_id(
            study_id
        )
    )

    if not include_notes:
        filename = (
            f"{safe_study_id}"
            "_responses.csv"
        )

        return Response(
            content=
                responses_csv.encode(
                    "utf-8"
                ),

            media_type=(
                "text/csv; "
                "charset=utf-8"
            ),

            headers={
                "Content-Disposition":
                    (
                        "attachment; "
                        f'filename="{filename}"'
                    )
            },
        )

    notes_csv = (
        _build_notes_csv(
            study_id=
                study_id,

            user_id=
                user_id,

            from_=
                from_,

            to=
                to,
        )
    )

    archive_buffer = (
        io.BytesIO()
    )

    with zipfile.ZipFile(
        archive_buffer,
        mode="w",
        compression=
            zipfile.ZIP_DEFLATED,
    ) as archive:
        archive.writestr(
            "responses.csv",
            responses_csv.encode(
                "utf-8"
            ),
        )

        archive.writestr(
            "notes.csv",
            notes_csv.encode(
                "utf-8"
            ),
        )

    archive_content = (
        archive_buffer.getvalue()
    )

    archive_buffer.close()

    filename = (
        f"{safe_study_id}"
        "_export.zip"
    )

    return Response(
        content=
            archive_content,

        media_type=
            "application/zip",

        headers={
            "Content-Disposition":
                (
                    "attachment; "
                    f'filename="{filename}"'
                )
        },
    )