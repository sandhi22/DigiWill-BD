"""
Transactional email, in the recipient's language (English or Bangla).

Each message is a subject, a few short paragraphs and at most one button.
Plain-text and HTML parts are generated from the same source.
"""
import logging
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import formats, timezone

logger = logging.getLogger(__name__)

MESSAGES = {
    "password_reset": {
        "en": ("Reset your DigiWill password", [
            "Hi {name},",
            "Someone asked to reset the password for your DigiWill BD account. If it was you, use the button below. The link works for 3 days.",
            "Your vault passphrase is separate and is not changed by this.",
            "If you didn't ask for this, ignore this email.",
        ], "Reset password"),
        "bn": ("আপনার DigiWill পাসওয়ার্ড রিসেট করুন", [
            "প্রিয় {name},",
            "আপনার DigiWill BD অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার অনুরোধ এসেছে। আপনি করে থাকলে নিচের বাটনে চাপুন। লিংকটি ৩ দিন কাজ করবে।",
            "আপনার ভল্ট পাসফ্রেজ আলাদা, এটি বদলাবে না।",
            "আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন।",
        ], "পাসওয়ার্ড রিসেট করুন"),
    },
    "heads_up": {
        "en": ("Check in with DigiWill by {date}", [
            "Hi {name},",
            "Your next check-in is due on {date}. One tap is all it takes, and it keeps your vault private.",
        ], "I'm here — check in"),
        "bn": ("{date} এর মধ্যে DigiWill-এ চেক-ইন করুন", [
            "প্রিয় {name},",
            "আপনার পরবর্তী চেক-ইনের তারিখ {date}। একটি ট্যাপই যথেষ্ট, এতে আপনার ভল্ট গোপন থাকবে।",
        ], "আমি আছি — চেক-ইন করুন"),
    },
    "overdue": {
        "en": ("Action needed: your DigiWill check-in is overdue", [
            "Hi {name},",
            "We haven't heard from you since your last check-in. If you don't check in within {days} days, your nominees will receive access to the assets you assigned them.",
            "If you are fine, tap the button below and nothing will happen.",
        ], "I'm here — check in"),
        "bn": ("জরুরি: আপনার DigiWill চেক-ইন বাকি", [
            "প্রিয় {name},",
            "শেষ চেক-ইনের পর আমরা আপনার কোনো সাড়া পাইনি। {days} দিনের মধ্যে চেক-ইন না করলে আপনার নমিনিরা তাদের জন্য নির্ধারিত তথ্য পেয়ে যাবেন।",
            "আপনি ভালো থাকলে নিচের বাটনে চাপুন, আর কিছুই হবে না।",
        ], "আমি আছি — চেক-ইন করুন"),
    },
    "owner_released": {
        "en": ("Your DigiWill vault was released", [
            "Hi {name},",
            "You didn't check in before the grace period ended, so {count} nominee(s) received release links today.",
            "If this is a mistake, check in now. Release links stop working immediately, and you can reissue Legacy Cards from the Nominees page.",
        ], "Check in and cancel release"),
        "bn": ("আপনার DigiWill ভল্ট উন্মুক্ত করা হয়েছে", [
            "প্রিয় {name},",
            "নির্ধারিত সময়ের মধ্যে চেক-ইন না করায় আজ {count} জন নমিনিকে অ্যাক্সেস লিংক পাঠানো হয়েছে।",
            "ভুল হয়ে থাকলে এখনই চেক-ইন করুন। লিংকগুলো সঙ্গে সঙ্গে বন্ধ হয়ে যাবে, এবং নমিনি পেজ থেকে নতুন লিগ্যাসি কার্ড ইস্যু করতে পারবেন।",
        ], "চেক-ইন করে বাতিল করুন"),
    },
    "nominee_invite": {
        "en": ("{owner} named you as a trusted nominee", [
            "Dear {nominee},",
            "{owner} uses DigiWill BD to keep important account information safe for their family. They have named you as a nominee.",
            "Nothing is shared with you now. Only if {owner} stops checking in for a long time will you receive access to the information they chose for you.",
            "{owner} will also give you a Legacy Card with a private code. Keep it somewhere safe — you will need it to open anything.",
            "Please confirm that you accept.",
        ], "Review and accept"),
        "bn": ("{owner} আপনাকে বিশ্বস্ত নমিনি করেছেন", [
            "প্রিয় {nominee},",
            "{owner} তাঁর পরিবারের জন্য গুরুত্বপূর্ণ অ্যাকাউন্টের তথ্য নিরাপদে রাখতে DigiWill BD ব্যবহার করেন। তিনি আপনাকে নমিনি করেছেন।",
            "এখন আপনার সাথে কিছুই শেয়ার হচ্ছে না। শুধুমাত্র {owner} দীর্ঘদিন চেক-ইন না করলে, তাঁর নির্বাচিত তথ্য আপনি পাবেন।",
            "{owner} আপনাকে একটি গোপন কোডসহ লিগ্যাসি কার্ড দেবেন। এটি নিরাপদে রাখুন — কিছু খুলতে এটি লাগবে।",
            "অনুগ্রহ করে নিশ্চিত করুন যে আপনি রাজি।",
        ], "দেখুন ও গ্রহণ করুন"),
    },
    "nominee_check": {
        "en": ("Please check on {owner}", [
            "Dear {nominee},",
            "{owner} has missed a scheduled check-in on DigiWill BD. This often just means they've been busy.",
            "If you can, please contact them and remind them to check in. If we still don't hear from them by {date}, you will receive access to what they left for you.",
        ], None),
        "bn": ("অনুগ্রহ করে {owner}-এর খোঁজ নিন", [
            "প্রিয় {nominee},",
            "{owner} DigiWill BD-তে নির্ধারিত চেক-ইন করেননি। অনেক সময় এর মানে শুধু তিনি ব্যস্ত ছিলেন।",
            "সম্ভব হলে তাঁর সাথে যোগাযোগ করে চেক-ইন করতে মনে করিয়ে দিন। {date} এর মধ্যেও সাড়া না পেলে, তিনি আপনার জন্য যা রেখে গেছেন তা আপনি পাবেন।",
        ], None),
    },
    "nominee_release": {
        "en": ("Information {owner} left for you", [
            "Dear {nominee},",
            "We are writing because {owner} has not checked in on DigiWill BD for an extended period. As they arranged, you can now open the information they assigned to you.",
            "You will need the private code from the Legacy Card {owner} gave you. Without it, the information cannot be opened — not even by us.",
        ], "Open what was left for me"),
        "bn": ("{owner} আপনার জন্য যা রেখে গেছেন", [
            "প্রিয় {nominee},",
            "{owner} দীর্ঘদিন DigiWill BD-তে চেক-ইন করেননি। তাঁর নির্দেশনা অনুযায়ী, তিনি আপনার জন্য যে তথ্য নির্ধারণ করেছিলেন তা এখন আপনি খুলতে পারবেন।",
            "{owner} আপনাকে যে লিগ্যাসি কার্ড দিয়েছেন, তার গোপন কোডটি লাগবে। কোড ছাড়া এই তথ্য খোলা যাবে না — আমরাও পারি না।",
        ], "আমার জন্য রাখা তথ্য খুলুন"),
    },
}

HTML_SHELL = """<!doctype html><html><body style="margin:0;background:#EEF1F6;padding:32px 12px;font-family:'Hind Siliguri',Segoe UI,Arial,sans-serif;color:#18213A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;border:1px solid #D9DEEA">
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:700;color:#2B3A8C">DigiWill BD</td></tr>
<tr><td style="padding:0 32px"><div style="border-top:2px dashed #C9CFE3;height:0"></div></td></tr>
<tr><td style="padding:20px 32px 28px;font-size:15px;line-height:1.65">{body}</td></tr>
</table>
<p style="font-size:12px;color:#6B7390;margin-top:16px">DigiWill BD · Digital legacy vault for Bangladesh</p>
</td></tr></table></body></html>"""


def _date(value, lang):
    value = timezone.localtime(value)
    return value.strftime("%d %b %Y") if lang == "en" else formats.date_format(value, "j/n/Y")


def _send(to, lang, key, url=None, **ctx):
    lang = lang if lang in ("en", "bn") else "en"
    subject_t, paragraphs_t, cta = MESSAGES[key][lang]
    subject = subject_t.format(**ctx)
    paragraphs = [p.format(**ctx) for p in paragraphs_t]

    text = "\n\n".join(paragraphs)
    if url and cta:
        text += f"\n\n{cta}: {url}"
    text += "\n\n— DigiWill BD"

    body = "".join(f'<p style="margin:0 0 14px">{escape(p)}</p>' for p in paragraphs)
    if url and cta:
        body += (
            f'<p style="margin:22px 0 4px"><a href="{escape(url)}" style="display:inline-block;background:#2B3A8C;'
            f'color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">{escape(cta)}</a></p>'
            f'<p style="font-size:12px;color:#6B7390;word-break:break-all">{escape(url)}</p>'
        )
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to])
    message.attach_alternative(HTML_SHELL.format(body=body), "text/html")
    try:
        message.send()
    except Exception:
        logger.exception("Email %s to %s failed", key, to)
        raise


def password_reset(user, uid, token):
    url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
    _send(user.email, user.language, "password_reset", url, name=user.first_name)


def owner_heads_up(user, url, due_at):
    _send(user.email, user.language, "heads_up", url, name=user.first_name, date=_date(due_at, user.language))


def owner_overdue(user, url, days_left):
    _send(user.email, user.language, "overdue", url, name=user.first_name, days=days_left)


def owner_released(user, url, count):
    _send(user.email, user.language, "owner_released", url, name=user.first_name, count=count)


def nominee_invite(nominee, url):
    _send(nominee.email, nominee.language, "nominee_invite", url,
          owner=nominee.owner.full_name, nominee=nominee.name)


def nominee_check_on_owner(nominee, release_at):
    _send(nominee.email, nominee.language, "nominee_check", None,
          owner=nominee.owner.full_name, nominee=nominee.name, date=_date(release_at, nominee.language))


def nominee_release(nominee, url):
    _send(nominee.email, nominee.language, "nominee_release", url,
          owner=nominee.owner.full_name, nominee=nominee.name)
