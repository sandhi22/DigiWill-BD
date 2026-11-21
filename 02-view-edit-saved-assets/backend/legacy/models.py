"""
Nominees, the Dead Man's Switch, and the activity trail.

Nominee keys use a 2-of-2 split. The browser derives each nominee key as

    K_n = HKDF-SHA256(server_share ‖ card_code)

`server_share` (32 random bytes) lives here and is only handed out once the
owner's switch has released. `card_code` (16 random bytes) is printed on the
owner's Legacy Card and never reaches the server. Neither half alone can
unwrap anything.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def new_token():
    return secrets.token_urlsafe(32)


class Nominee(models.Model):
    class Status(models.TextChoices):
        INVITED = "invited", "Invited"
        VERIFIED = "verified", "Verified"
        DECLINED = "declined", "Declined"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="nominees")
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    relation = models.CharField(max_length=60, blank=True)
    language = models.CharField(max_length=2, default="bn")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.INVITED)
    invite_token = models.CharField(max_length=64, unique=True, default=new_token)
    invited_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)

    # Key material (see module docstring).
    server_share = models.CharField(max_length=64)
    wrapped_key = models.CharField(max_length=128)  # K_n wrapped by owner's MK
    key_iv = models.CharField(max_length=32)
    card_hint = models.CharField(max_length=4)  # last 4 chars of the card code, for matching cards
    card_issued_at = models.DateTimeField(default=timezone.now)

    # Release.
    release_token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "email"], name="unique_nominee_email_per_owner"),
        ]

    def __str__(self):
        return f"{self.name} ({self.email}) for {self.owner.email}"


class Assignment(models.Model):
    """Grants one nominee one asset: the asset key re-wrapped under K_n."""

    nominee = models.ForeignKey(Nominee, on_delete=models.CASCADE, related_name="assignments")
    asset = models.ForeignKey("vault.Asset", on_delete=models.CASCADE, related_name="assignments")
    wrapped_key = models.CharField(max_length=128)
    iv = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["nominee", "asset"], name="unique_assignment"),
        ]


class Switch(models.Model):
    """The owner's Dead Man's Switch."""

    class State(models.TextChoices):
        ACTIVE = "active", "Active"
        OVERDUE = "overdue", "Overdue"
        RELEASED = "released", "Released"

    INTERVAL_CHOICES = [30, 60, 90, 180]
    GRACE_CHOICES = [7, 14, 30]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="switch")
    interval_days = models.PositiveSmallIntegerField(default=60)
    grace_days = models.PositiveSmallIntegerField(default=14)
    state = models.CharField(max_length=10, choices=State.choices, default=State.ACTIVE)
    last_check_in = models.DateTimeField(default=timezone.now)
    checkin_token = models.CharField(max_length=64, unique=True, default=new_token)

    heads_up_sent_at = models.DateTimeField(null=True, blank=True)
    last_reminder_at = models.DateTimeField(null=True, blank=True)
    reminders_sent = models.PositiveSmallIntegerField(default=0)
    nominees_alerted_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "switches"

    def __str__(self):
        return f"Switch for {self.user.email}: {self.state}"

    @property
    def due_at(self):
        return self.last_check_in + timedelta(days=self.interval_days)

    @property
    def release_at(self):
        return self.due_at + timedelta(days=self.grace_days)


class Activity(models.Model):
    class Kind(models.TextChoices):
        CHECK_IN = "check_in", "Checked in"
        VAULT_CREATED = "vault_created", "Vault created"
        VAULT_RESET = "vault_reset", "Vault reset"
        PASSPHRASE_CHANGED = "passphrase_changed", "Vault passphrase changed"
        ASSET_ADDED = "asset_added", "Asset added"
        ASSET_REMOVED = "asset_removed", "Asset removed"
        NOMINEE_ADDED = "nominee_added", "Nominee added"
        NOMINEE_REMOVED = "nominee_removed", "Nominee removed"
        NOMINEE_VERIFIED = "nominee_verified", "Nominee accepted"
        NOMINEE_DECLINED = "nominee_declined", "Nominee declined"
        CARD_REISSUED = "card_reissued", "Legacy Card reissued"
        SCHEDULE_CHANGED = "schedule_changed", "Check-in schedule changed"
        HEADS_UP_SENT = "heads_up_sent", "Heads-up reminder sent"
        REMINDER_SENT = "reminder_sent", "Overdue reminder sent"
        NOMINEES_ALERTED = "nominees_alerted", "Nominees asked to check on you"
        RELEASED = "released", "Vault released to nominees"
        RELEASE_REVOKED = "release_revoked", "Release cancelled by check-in"
        RELEASE_OPENED = "release_opened", "Nominee opened released assets"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(max_length=24, choices=Kind.choices)
    detail = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "activity"
