from django.contrib import admin, messages

from . import services
from .models import Activity, Assignment, Nominee, Switch


@admin.register(Switch)
class SwitchAdmin(admin.ModelAdmin):
    list_display = ["user", "state", "interval_days", "grace_days", "last_check_in", "due", "reminders_sent"]
    list_filter = ["state", "interval_days", "grace_days"]
    search_fields = ["user__email", "user__full_name"]
    readonly_fields = [
        "user", "state", "last_check_in", "heads_up_sent_at", "last_reminder_at",
        "reminders_sent", "nominees_alerted_at", "released_at",
    ]
    exclude = ["checkin_token"]
    actions = ["evaluate_now"]

    @admin.display(description="Due")
    def due(self, obj):
        return obj.due_at

    @admin.action(description="Evaluate selected switches now")
    def evaluate_now(self, request, queryset):
        results = [services.evaluate(s) for s in queryset]
        done = sum(1 for r in results if r)
        self.message_user(request, f"Evaluated {len(results)} switches; {done} changed.", messages.SUCCESS)


class AssignmentInline(admin.TabularInline):
    model = Assignment
    extra = 0
    fields = ["asset", "created_at"]
    readonly_fields = fields
    can_delete = False


@admin.register(Nominee)
class NomineeAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "owner", "relation", "status", "notified_at", "opened_at"]
    list_filter = ["status", "language"]
    search_fields = ["name", "email", "owner__email"]
    fields = [
        "owner", "name", "email", "phone", "relation", "language", "status",
        "invited_at", "verified_at", "card_hint", "card_issued_at", "notified_at", "opened_at",
    ]
    readonly_fields = ["owner", "invited_at", "verified_at", "card_hint", "card_issued_at", "notified_at", "opened_at"]
    inlines = [AssignmentInline]

    def has_add_permission(self, request):
        return False  # nominees carry browser-generated key material


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ["created_at", "user", "kind"]
    list_filter = ["kind"]
    search_fields = ["user__email"]
    readonly_fields = ["user", "kind", "detail", "created_at"]

    def has_add_permission(self, request):
        return False
