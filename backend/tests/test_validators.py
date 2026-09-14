from app.validators import (
    clean_email,
    clean_mobile,
    clean_name,
    clean_national_id,
    clean_scfhs,
    national_id_check_digit,
)


def test_name_needs_three_parts():
    assert clean_name("Ahmed Ali") == (None, "name_three_parts")
    assert clean_name("Dr. Ahmed Ali") == (None, "name_three_parts")  # title doesn't count
    assert clean_name("  Ahmed   Mohammed  Ali ") == ("Ahmed Mohammed Ali", None)
    assert clean_name("د. نورة سعد القحطاني")[1] is None
    assert clean_name("Ahmed Ali 2nd")[1] == "name_chars"


def test_email():
    assert clean_email(" Noura@Example.COM ") == ("noura@example.com", None)
    assert clean_email("not-an-email")[1] == "email_invalid"


def test_mobile_normalises_to_e164():
    expected = ("+966551234567", None)
    for raw in ("0551234567", "551234567", "+966 55 123 4567", "00966551234567", "٠٥٥١٢٣٤٥٦٧", "966-55-123-4567"):
        assert clean_mobile(raw) == expected, raw
    assert clean_mobile("+447700900123") == ("+447700900123", None)
    assert clean_mobile("12345")[1] == "mobile_invalid"
    assert clean_mobile("0451234567")[1] == "mobile_invalid"  # Saudi mobiles start with 05


def test_national_id():
    valid = "123456789" + national_id_check_digit("123456789")
    assert clean_national_id(valid) == (valid, None)
    wrong = valid[:-1] + str((int(valid[-1]) + 1) % 10)
    assert clean_national_id(wrong) == (None, "national_id_checksum")
    assert clean_national_id(wrong, strict=False) == (wrong, None)
    assert clean_national_id("3123456789")[1] == "national_id_format"  # must start with 1 or 2
    assert clean_national_id("١٢٣٤٥٦٧٨٩" + national_id_check_digit("123456789"))[0] == valid


def test_scfhs():
    assert clean_scfhs(" 12-r-45678 ") == ("12-R-45678", None)
    assert clean_scfhs("ABC")[1] == "scfhs_invalid"
