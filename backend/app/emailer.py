"""Transactional email via Resend (preferred) or SMTP.

With neither configured, messages go to the log so local development works unchanged. Sending always
happens in a background task, so a slow or failing provider never blocks a registration or a scan.
"""

import base64
import html
import io
import logging
import smtplib
import ssl
from email.message import EmailMessage

import resend
import segno
from fastapi import BackgroundTasks

from . import services as svc
from .config import settings
from .models import Event, Registration, Sponsor, SponsorMember, User

log = logging.getLogger("mce.email")


def email_provider() -> str | None:
    if settings.resend_api_key:
        return "resend"
    if settings.smtp_host:
        return "smtp"
    return None


def email_enabled() -> bool:
    return email_provider() is not None


def qr_png(data: str, scale: int = 8) -> bytes:
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="png", scale=scale, border=2, dark="#003868")
    return buf.getvalue()


def _send_resend(to: str, subject: str, text: str, html_body: str, inline_png: bytes | None) -> None:
    resend.api_key = settings.resend_api_key
    params: resend.Emails.SendParams = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "html": html_body,
        "text": text,
    }
    if settings.email_reply_to:
        params["reply_to"] = settings.email_reply_to
    if inline_png:
        # Referenced from the HTML as <img src="cid:qrcode">.
        params["attachments"] = [{
            "filename": "attendance-qr.png",
            "content": base64.b64encode(inline_png).decode(),
            "content_id": "qrcode",
        }]
    resend.Emails.send(params)


def _send_smtp(to: str, subject: str, text: str, html_body: str, inline_png: bytes | None) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    if settings.email_reply_to:
        msg["Reply-To"] = settings.email_reply_to
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    if inline_png:
        msg.get_payload()[1].add_related(inline_png, "image", "png", cid="<qrcode>")
    context = ssl.create_default_context()
    if settings.smtp_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20, context=context)
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
    with server:
        if settings.smtp_starttls and not settings.smtp_ssl:
            server.starttls(context=context)
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password or "")
        server.send_message(msg)


def send_email(to: str, subject: str, text: str, html_body: str, inline_png: bytes | None = None) -> None:
    provider = email_provider()
    if provider is None:
        log.info("Email not sent (no provider configured). To: %s | Subject: %s\n%s", to, subject, text)
        return
    try:
        if provider == "resend":
            _send_resend(to, subject, text, html_body, inline_png)
        else:
            _send_smtp(to, subject, text, html_body, inline_png)
        log.info("Email sent via %s to %s: %s", provider, to, subject)
    except Exception:
        log.exception("Failed to send email via %s to %s", provider, to)


# ---------- templates


def _site(path: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}{path}"


def _layout(body_html: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#F6F7F8;font-family:Arial,Helvetica,sans-serif;color:#3D434D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="595" cellpadding="0" cellspacing="0" style="max-width:595px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#003868;color:#ffffff;padding:22px 28px">
<div style="font-size:19px;font-weight:bold">My Clinic Educational</div>
<div style="font-size:14px;opacity:.8">عيادتي التعليمية</div></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">{body_html}</td></tr>
<tr><td style="padding:16px 28px;background:#F2F6FA;font-size:12px;color:#797C82">My Clinic · Where your health matters · حيث صحتك تهمنا</td></tr>
</table></td></tr></table></body></html>"""


def _button(href: str, label: str) -> str:
    return (
        f'<a href="{html.escape(href)}" style="display:inline-block;background:#004d99;color:#ffffff;'
        f'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">{label}</a>'
    )


def queue_registration_email(background: BackgroundTasks, reg: Registration, event: Event) -> bool:
    e = html.escape
    link = svc.pass_url(reg)
    when = svc.event_when_text(event)
    subject = f"You're registered: {event.title}"
    text = (
        f"Hello {reg.full_name},\n\n"
        f"You're registered for {event.title}.\n"
        f"Ticket: {reg.ticket_code}\nWhen: {when}\nWhere: {event.venue}\n\n"
        f"Your personal attendance pass (keep it private):\n{link}\n\n"
        "Show the QR code at the entrance when you arrive, and again when you leave.\n"
        f"You need to attend at least {event.attendance_threshold}% of the programme to be eligible for CME hours.\n\n"
        "My Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(reg.full_name)},</p>
<p style="margin:0 0 18px">You're registered for <strong>{e(event.title)}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Ticket</td><td><strong>{e(reg.ticket_code)}</strong></td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">When</td><td>{e(when)}</td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Where</td><td>{e(event.venue)}</td></tr>
</table>
<p style="text-align:center;margin:0 0 8px"><img src="cid:qrcode" width="200" height="200" alt="Your attendance QR code"></p>
<p style="text-align:center;font-size:13px;color:#797C82;margin:0 0 22px">Show this code when you arrive and again when you leave.</p>
<p style="text-align:center;margin:0 0 22px">{_button(link, "Open my attendance pass")}</p>
<p style="margin:0;font-size:13px;color:#797C82">You need to attend at least {event.attendance_threshold}% of the programme to be eligible for CME hours.
Your pass shows your attendance time as the day goes on.</p>"""
    background.add_task(send_email, reg.email, subject, text, _layout(body), qr_png(svc.QR_PREFIX + reg.qr_token))
    return email_enabled()


def queue_certificate_email(background: BackgroundTasks, reg: Registration, event: Event) -> bool:
    e = html.escape
    link = svc.certificate_url(reg)
    subject = f"Your CME certificate: {event.title}"
    text = (
        f"Hello {reg.full_name},\n\nThank you for attending {event.title}. Your CME certificate is ready:\n{link}\n\n"
        f"Certificate code: {reg.certificate_code}\n\nMy Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(reg.full_name)},</p>
<p style="margin:0 0 20px">Thank you for attending <strong>{e(event.title)}</strong>. Your CME attendance certificate is ready.</p>
<p style="text-align:center;margin:0 0 22px">{_button(link, "View and download certificate")}</p>
<p style="margin:0;font-size:13px;color:#797C82">Certificate code: {e(reg.certificate_code or "")}</p>"""
    background.add_task(send_email, reg.email, subject, text, _layout(body))
    return email_enabled()


def queue_account_email(background: BackgroundTasks, user: User, temporary_password: str, *, reset: bool) -> bool:
    """Welcome (or password-reset) email for a team member, with a one-time temporary password."""
    e = html.escape
    login = _site("/login")
    if reset:
        subject = "Your My Clinic Educational password was reset"
        intro = "A super admin has reset the password for your team account."
    else:
        subject = "Your My Clinic Educational team account"
        intro = "A super admin has created a team account for you on the My Clinic Educational events platform."
    text = (
        f"Hello {user.full_name},\n\n{intro}\n\nSign in: {login}\nEmail: {user.email}\n"
        f"Temporary password: {temporary_password}\n\nYou'll be asked to choose your own password when you sign in.\n\n"
        "My Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(user.full_name)},</p>
<p style="margin:0 0 18px">{intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Email</td><td>{e(user.email)}</td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Temporary password</td>
<td><code style="background:#F2F6FA;padding:3px 8px;border-radius:6px;font-size:15px">{e(temporary_password)}</code></td></tr>
</table>
<p style="text-align:center;margin:0 0 22px">{_button(login, "Sign in")}</p>
<p style="margin:0;font-size:13px;color:#797C82">You'll be asked to choose your own password when you sign in.</p>"""
    background.add_task(send_email, user.email, subject, text, _layout(body))
    return email_enabled()


def queue_sponsor_application_email(background: BackgroundTasks, sponsor: Sponsor, event: Event) -> bool:
    e = html.escape
    subject = f"Sponsorship application received: {event.title}"
    text = (
        f"Hello {sponsor.contact_name},\n\nThank you for applying to sponsor {event.title} as {sponsor.company_name}.\n"
        "The My Clinic events team will review your application and email you once it's approved, with your "
        "sponsor portal login, booth QR code and team badges.\n\nMy Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(sponsor.contact_name)},</p>
<p style="margin:0 0 14px">Thank you for applying to sponsor <strong>{e(event.title)}</strong> as <strong>{e(sponsor.company_name)}</strong>.</p>
<p style="margin:0;font-size:14px;color:#3D434D">The My Clinic events team will review your application and email you once it's approved,
with your sponsor portal login, booth QR code and team badges.</p>"""
    background.add_task(send_email, sponsor.contact_email, subject, text, _layout(body))
    return email_enabled()


def queue_sponsor_approved_email(
    background: BackgroundTasks, sponsor: Sponsor, event: Event, member: SponsorMember,
    login_email: str, temporary_password: str | None,
) -> bool:
    e = html.escape
    portal = svc.portal_url()
    booth = svc.booth_url(sponsor)
    badge = svc.badge_url(member)
    credentials = (
        f"Temporary password: {temporary_password}\n(You'll choose your own password at first sign-in.)"
        if temporary_password else "Sign in with your existing password."
    )
    subject = f"You're confirmed as a sponsor: {event.title}"
    text = (
        f"Hello {sponsor.contact_name},\n\n{sponsor.company_name} is confirmed as a {sponsor.tier} sponsor of {event.title}.\n"
        f"{'Booth: ' + sponsor.booth_number + chr(10) if sponsor.booth_number else ''}"
        f"\nSponsor portal: {portal}\nLogin email: {login_email}\n{credentials}\n\n"
        f"Your booth QR code (attendees scan it to share their contact details with you): {booth}\n"
        f"Your gate badge: {badge}\n\nFrom the portal you can add team members, capture leads, and export them.\n\nMy Clinic Educational"
    )
    cred_html = (
        f'<tr><td style="color:#797C82;padding:3px 16px 3px 0">Temporary password</td>'
        f'<td><code style="background:#F2F6FA;padding:3px 8px;border-radius:6px;font-size:15px">{e(temporary_password)}</code></td></tr>'
        if temporary_password else
        '<tr><td style="color:#797C82;padding:3px 16px 3px 0">Password</td><td>Your existing password</td></tr>'
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(sponsor.contact_name)},</p>
<p style="margin:0 0 18px"><strong>{e(sponsor.company_name)}</strong> is confirmed as a <strong>{e(sponsor.tier)}</strong> sponsor of <strong>{e(event.title)}</strong>{' · Booth ' + e(sponsor.booth_number) if sponsor.booth_number else ''}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Portal</td><td><a href="{e(portal)}">{e(portal)}</a></td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Login email</td><td>{e(login_email)}</td></tr>
{cred_html}
</table>
<p style="text-align:center;margin:0 0 22px">{_button(portal, "Open the sponsor portal")}</p>
<p style="margin:0 0 6px;font-weight:bold">Your booth QR code</p>
<p style="margin:0 0 10px;font-size:14px;color:#3D434D">Print it at your booth. Attendees scan it with their phone to share their contact details with you; they appear in your portal instantly.</p>
<p style="text-align:center;margin:0 0 8px"><img src="cid:qrcode" width="200" height="200" alt="Booth QR code"></p>
<p style="text-align:center;font-size:12px;color:#797C82;margin:0 0 22px">{e(booth)}</p>
<p style="margin:0;font-size:13px;color:#797C82">Your gate badge: <a href="{e(badge)}">{e(badge)}</a>. Add your booth team in the portal so each of them gets their own badge.</p>"""
    background.add_task(send_email, login_email, subject, text, _layout(body), qr_png(booth))
    return email_enabled()


def queue_sponsor_member_email(
    background: BackgroundTasks, member: SponsorMember, sponsor: Sponsor, event: Event, temporary_password: str | None,
) -> bool:
    e = html.escape
    badge = svc.badge_url(member)
    subject = f"Your sponsor badge: {event.title}"
    login_text = (
        f"\nSponsor portal: {svc.portal_url()}\nLogin email: {member.email}\nTemporary password: {temporary_password}\n"
        if temporary_password else ""
    )
    text = (
        f"Hello {member.full_name},\n\nYou're on the {sponsor.company_name} team for {event.title}"
        f"{' (booth ' + sponsor.booth_number + ')' if sponsor.booth_number else ''}.\n"
        f"Show this badge at the entrance: {badge}\n{login_text}\nMy Clinic Educational"
    )
    login_html = (
        f"""<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px">
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Portal</td><td><a href="{e(svc.portal_url())}">{e(svc.portal_url())}</a></td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Login email</td><td>{e(member.email)}</td></tr>
<tr><td style="color:#797C82;padding:3px 16px 3px 0">Temporary password</td><td><code style="background:#F2F6FA;padding:3px 8px;border-radius:6px;font-size:15px">{e(temporary_password)}</code></td></tr>
</table>""" if temporary_password else ""
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(member.full_name)},</p>
<p style="margin:0 0 18px">You're on the <strong>{e(sponsor.company_name)}</strong> team for <strong>{e(event.title)}</strong>{' · Booth ' + e(sponsor.booth_number) if sponsor.booth_number else ''}.</p>
<p style="text-align:center;margin:0 0 8px"><img src="cid:qrcode" width="200" height="200" alt="Your badge QR code"></p>
<p style="text-align:center;font-size:13px;color:#797C82;margin:0 0 22px">Show this code at the entrance.</p>
<p style="text-align:center;margin:0 0 22px">{_button(badge, "Open my badge")}</p>
{login_html}"""
    background.add_task(send_email, member.email, subject, text, _layout(body), qr_png(svc.BADGE_PREFIX + member.qr_token))
    return email_enabled()


def queue_sponsor_rejected_email(background: BackgroundTasks, sponsor: Sponsor, event: Event, message: str | None) -> bool:
    e = html.escape
    subject = f"Sponsorship application: {event.title}"
    note = message or "Unfortunately we can't offer a sponsorship place for this event."
    text = f"Hello {sponsor.contact_name},\n\nThank you for your interest in sponsoring {event.title}.\n{note}\n\nMy Clinic Educational"
    body = f"""
<p style="margin:0 0 14px">Hello {e(sponsor.contact_name)},</p>
<p style="margin:0 0 14px">Thank you for your interest in sponsoring <strong>{e(event.title)}</strong>.</p>
<p style="margin:0;font-size:14px;color:#3D434D">{e(note)}</p>"""
    background.add_task(send_email, sponsor.contact_email, subject, text, _layout(body))
    return email_enabled()


def queue_password_reset_email(background: BackgroundTasks, user: User, link: str) -> bool:
    e = html.escape
    subject = "Reset your My Clinic Educational password"
    text = (
        f"Hello {user.full_name},\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n"
        f"{link}\n\nIf you didn't ask for this, you can ignore this email.\n\nMy Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(user.full_name)},</p>
<p style="margin:0 0 20px">Use the button below to choose a new password. The link works once and expires in 1 hour.</p>
<p style="text-align:center;margin:0 0 22px">{_button(link, "Choose a new password")}</p>
<p style="margin:0;font-size:13px;color:#797C82">If you didn't ask for this, you can ignore this email. Your password won't change.</p>"""
    background.add_task(send_email, user.email, subject, text, _layout(body))
    return email_enabled()


def queue_member_welcome_email(background: BackgroundTasks, user: User) -> bool:
    """Welcome email after a member signs up. No password inside: they chose it themselves."""
    e = html.escape
    portal = _site("/member")
    subject = "Welcome to My Clinic Educational"
    text = (
        f"Hello {user.full_name},\n\nYour My Clinic Educational membership is ready. It is free of charge.\n\n"
        f"Browse the events and apply in one click, using the details you gave us when you signed up:\n{portal}\n\n"
        f"You sign in with {user.email}.\n\nMy Clinic Educational"
    )
    body = f"""
<p style="margin:0 0 14px">Hello {e(user.full_name)},</p>
<p style="margin:0 0 14px">Your My Clinic Educational membership is ready. It is free of charge.</p>
<p style="margin:0 0 20px">Browse the events and apply in one click, using the details you gave us when you signed up.
You won't need to fill in a form for each event.</p>
<p style="text-align:center;margin:0 0 22px">{_button(portal, "Open my portal")}</p>
<p style="margin:0;font-size:13px;color:#797C82">You sign in with {e(user.email)}.</p>"""
    background.add_task(send_email, user.email, subject, text, _layout(body))
    return email_enabled()
