import asyncio
import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlsplit


class MailDeliveryError(Exception):
    pass


def invitation_url(token: str) -> str:
    origin = os.getenv("DASHBOARD_PUBLIC_URL", "").rstrip("/")
    parsed = urlsplit(origin)
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query
            or parsed.fragment or parsed.path not in {"", "/"}
            or (parsed.scheme != "https" and not (local and parsed.scheme == "http"))):
        raise MailDeliveryError("DASHBOARD_PUBLIC_URL must be an HTTPS origin.")
    return f"{origin}/set-password#token={token}"


def _send(recipient: str, username: str, url: str, purpose: str) -> None:
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM")
    if not host or not sender:
        raise MailDeliveryError("Email delivery is not configured.")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = "Set up your dashboard account" if purpose == "invite" else "Dashboard password reset"
    message.set_content(
        f"Username: {username}\n\n"
        f"Your administrator has authorized you to set a dashboard password.\n"
        f"Open this link within 24 hours:\n{url}\n\n"
        "The link can be used once. Contact your administrator if it has expired.\n"
        "If you were not expecting this email, contact your administrator.\n"
    )
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        implicit_tls = os.getenv("SMTP_TLS_MODE", "starttls") == "tls"
        context = ssl.create_default_context()
        connection = (smtplib.SMTP_SSL(host, port, timeout=15, context=context)
                      if implicit_tls else smtplib.SMTP(host, port, timeout=15))
        with connection as smtp:
            if not implicit_tls:
                smtp.starttls(context=context)
            username = os.getenv("SMTP_USERNAME")
            if username:
                smtp.login(username, os.getenv("SMTP_PASSWORD", ""))
            smtp.send_message(message)
    except (OSError, ValueError, smtplib.SMTPException) as exc:
        raise MailDeliveryError("Email delivery failed. Check the mail configuration and resend.") from exc


async def send_invitation(recipient: str, username: str, token: str, purpose: str) -> None:
    url = invitation_url(token)
    await asyncio.to_thread(_send, recipient, username, url, purpose)
