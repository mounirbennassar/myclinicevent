"""Registration field cleaners. Each returns (clean_value, None) or (None, error_code).

Error codes are translated by the frontend, so keep them stable.
"""

from __future__ import annotations

import re

from email_validator import EmailNotValidError, validate_email

# Arabic-Indic and Persian digits → ASCII. Phones on Arabic keyboards type these by default.
_DIGIT_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "0123456789" * 2)
# Titles people prefix to their name; they don't count toward the "three names" rule.
_HONORIFICS = {
    "dr", "dr.", "prof", "prof.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.",
    "د", "د.", "أ", "أ.", "أ.د", "أ.د.", "ا.د", "ص", "ص.", "م", "م.",
}
_NAME_FORBIDDEN = re.compile(r"[\d<>{}\[\]@#$%^&*=+|\\/~`\"!?;:_()]")

PROFESSIONS = (
    "consultant", "specialist", "resident", "gp", "nurse",
    "pharmacist", "dentist", "allied_health", "student", "other",
)


def normalize_digits(value: str) -> str:
    return value.translate(_DIGIT_MAP)


def clean_name(value: str | None) -> tuple[str | None, str | None]:
    name = " ".join((value or "").split())
    if len(name) < 5 or len(name) > 150:
        return None, "name_length"
    if _NAME_FORBIDDEN.search(normalize_digits(name)):
        return None, "name_chars"
    parts = [p for p in name.split(" ") if p.lower() not in _HONORIFICS]
    if len(parts) < 3:
        return None, "name_three_parts"
    return name, None


def clean_email(value: str | None) -> tuple[str | None, str | None]:
    raw = (value or "").strip()
    if not raw or len(raw) > 255:
        return None, "email_invalid"
    try:
        return validate_email(raw, check_deliverability=False).normalized.lower(), None
    except EmailNotValidError:
        return None, "email_invalid"


def clean_mobile(value: str | None) -> tuple[str | None, str | None]:
    """Normalise to E.164. Saudi numbers accept 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665…, 009665…."""
    s = re.sub(r"[\s\-().]", "", normalize_digits(value or ""))
    if s.startswith("00"):
        s = "+" + s[2:]
    if re.fullmatch(r"05\d{8}", s):
        return "+966" + s[1:], None
    if re.fullmatch(r"5\d{8}", s):
        return "+966" + s, None
    if re.fullmatch(r"\+?9665\d{8}", s):
        return "+" + s.lstrip("+"), None
    if re.fullmatch(r"\+\d{8,15}", s) and not s.startswith("+966"):
        return s, None
    return None, "mobile_invalid"


def clean_scfhs(value: str | None) -> tuple[str | None, str | None]:
    s = re.sub(r"\s", "", normalize_digits(value or "")).upper()
    if not re.fullmatch(r"[A-Z0-9\-/]{4,24}", s) or len(re.findall(r"\d", s)) < 4:
        return None, "scfhs_invalid"
    return s, None


def saudi_id_checksum_ok(digits: str) -> bool:
    """Luhn check used by Saudi National IDs (start with 1) and Iqamas (start with 2)."""
    total = 0
    for i, ch in enumerate(digits):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            total += d // 10 + d % 10
        else:
            total += d
    return total % 10 == 0


def national_id_check_digit(first_nine: str) -> str:
    for d in "0123456789":
        if saudi_id_checksum_ok(first_nine + d):
            return d
    raise ValueError("no check digit")


def clean_national_id(value: str | None, strict: bool = True) -> tuple[str | None, str | None]:
    s = re.sub(r"\s", "", normalize_digits(value or ""))
    if not re.fullmatch(r"[12]\d{9}", s):
        return None, "national_id_format"
    if strict and not saudi_id_checksum_ok(s):
        return None, "national_id_checksum"
    return s, None


def clean_profession(value: str | None) -> tuple[str | None, str | None]:
    if value in (None, ""):
        return None, None
    if value not in PROFESSIONS:
        return None, "profession_invalid"
    return value, None


def mask_tail(value: str | None, keep: int = 4) -> str | None:
    if not value:
        return value
    return "•" * max(0, len(value) - keep) + value[-keep:]
