"""
Dead Man's Switch engine.

Timeline for one owner (defaults: 60-day interval, 14-day grace):

  check-in ──────────── heads-up ──── due ─── reminders ─── release
     │      ~57 days       │   3 days  │  every 2 days │
     ▼                     ▼           ▼   (14 days)   ▼
   ACTIVE                ACTIVE     OVERDUE         RELEASED
                                 + nominees asked
                                   to check on owner

Any check-in (button, emailed link, or signing in) resets the clock and,
if the vault had already been released, cancels the release links.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from digiwill import mail

from .models import Activity, Nominee, Switch, new_token

logger = logging.getLogger(__name__)


def log(user, kind, **detail):
    return Activity.objects.create(user=user, kind=kind, detail=detail)


def ensure_switch(user):
    switch, _ = Switch.objects.get_or_create(user=user)
    return switch


@transaction.atomic
def check_in(user, source="button"):
    switch = Switch.objects.select_for_update().filter(user=user).first() or ensure_switch(user)
    was_released = switch.state == Switch.State.RELEASED
    switch.last_check_in = timezone.now()
    switch.state = Switch.State.ACTIVE
    switch.heads_up_sent_at = None
    switch.last_reminder_at = None
    switch.reminders_sent = 0
    switch.nominees_alerted_at = None
    switch.released_at = None
    switch.save()
    if was_released:
        # Release links stop working the moment the owner proves they're alive.
        user.nominees.update(release_token=None, notified_at=None)
        log(user, Activity.Kind.RELEASE_REVOKED, source=source)
    log(user, Activity.Kind.CHECK_IN, source=source)
    return switch


def checkin_url(switch):
    return f"{settings.FRONTEND_URL}/checkin/{switch.checkin_token}"


def release_url(nominee):
    return f"{settings.FRONTEND_URL}/release/{nominee.release_token}"


def invite_url(nominee):
    return f"{settings.FRONTEND_URL}/nominee/{nominee.invite_token}"


def send_release(nominee):
    """Issue a release link to one verified nominee and email it."""
    if not nominee.release_token:
        nominee.release_token = new_token()
    nominee.notified_at = timezone.now()
    nominee.save(update_fields=["release_token", "notified_at"])
    mail.nominee_release(nominee, release_url(nominee))


@transaction.atomic
def evaluate(switch, now=None):
    """Advance one switch. Returns the action taken (for logs/tests) or None."""
    now = now or timezone.now()
    switch = Switch.objects.select_for_update().select_related("user").get(pk=switch.pk)
    user = switch.user

    if switch.state == Switch.State.RELEASED or not user.is_active:
        return None

    if now >= switch.release_at:
        switch.state = Switch.State.RELEASED
        switch.released_at = now
        switch.save(update_fields=["state", "released_at"])
        verified = list(user.nominees.filter(status=Nominee.Status.VERIFIED))
        for nominee in verified:
            send_release(nominee)
        log(user, Activity.Kind.RELEASED, nominees=len(verified))
        mail.owner_released(user, checkin_url(switch), len(verified))
        return "released"

    if now >= switch.due_at:
        action = None
        if switch.state != Switch.State.OVERDUE:
            switch.state = Switch.State.OVERDUE
            action = "overdue"
        gap = timedelta(days=settings.SWITCH_REMINDER_EVERY_DAYS)
        if switch.last_reminder_at is None or now - switch.last_reminder_at >= gap:
            days_left = max(0, (switch.release_at - now).days)
            mail.owner_overdue(user, checkin_url(switch), days_left)
            switch.last_reminder_at = now
            switch.reminders_sent += 1
            log(user, Activity.Kind.REMINDER_SENT, days_left=days_left)
            action = action or "reminded"
        if switch.nominees_alerted_at is None:
            verified = list(user.nominees.filter(status=Nominee.Status.VERIFIED))
            for nominee in verified:
                mail.nominee_check_on_owner(nominee, switch.release_at)
            switch.nominees_alerted_at = now
            if verified:
                log(user, Activity.Kind.NOMINEES_ALERTED, nominees=len(verified))
        switch.save()
        return action

    heads_up_from = switch.due_at - timedelta(days=settings.SWITCH_HEADS_UP_DAYS)
    if now >= heads_up_from and switch.heads_up_sent_at is None:
        mail.owner_heads_up(user, checkin_url(switch), switch.due_at)
        switch.heads_up_sent_at = now
        switch.save(update_fields=["heads_up_sent_at"])
        log(user, Activity.Kind.HEADS_UP_SENT)
        return "heads_up"

    return None


def run_all(now=None):
    """Evaluate every switch that isn't released yet. Safe to run repeatedly."""
    now = now or timezone.now()
    summary = {"checked": 0, "heads_up": 0, "overdue": 0, "reminded": 0, "released": 0, "errors": 0}
    pending = Switch.objects.exclude(state=Switch.State.RELEASED).filter(user__is_active=True)
    for switch in pending.iterator():
        summary["checked"] += 1
        try:
            action = evaluate(switch, now)
        except Exception:  # one bad mailbox must not stop everyone else's switch
            logger.exception("Switch evaluation failed for %s", switch.pk)
            summary["errors"] += 1
            continue
        if action:
            summary[action] += 1
    return summary
