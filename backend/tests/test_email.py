import pytest

from services import email


def test_setup_url_uses_configured_origin_and_fragment(monkeypatch):
    monkeypatch.setenv("DASHBOARD_PUBLIC_URL", "https://dashboard.example.org")
    assert email.invitation_url("test-token") == "https://dashboard.example.org/set-password#token=test-token"
    monkeypatch.setenv("DASHBOARD_PUBLIC_URL", "http://dashboard.example.org")
    with pytest.raises(email.MailDeliveryError):
        email.invitation_url("test-token")


def test_smtp_requires_tls_and_has_no_password_in_message(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.org")
    monkeypatch.setenv("SMTP_FROM", "dashboard@example.org")
    monkeypatch.setenv("SMTP_USERNAME", "sender")
    monkeypatch.setenv("SMTP_PASSWORD", "mail-secret")
    monkeypatch.setenv("SMTP_TLS_MODE", "starttls")
    events = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self, **kwargs):
            events.append("tls")

        def login(self, username, password):
            assert events == ["tls"]
            events.append("login")

        def send_message(self, message):
            assert "mail-secret" not in message.as_string()
            assert "Username: researcher" in message.get_content()
            events.append("send")

    monkeypatch.setattr(email.smtplib, "SMTP", SMTP)
    email._send("user@example.org", "researcher", "https://dashboard.example.org/set-password#token=test", "invite")
    assert events == ["tls", "login", "send"]
