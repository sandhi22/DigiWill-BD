from django.contrib import admin

from .models import Asset, Document, VaultKey


@admin.register(VaultKey)
class VaultKeyAdmin(admin.ModelAdmin):
    list_display = ["user", "kdf", "kdf_iterations", "updated_at"]
    search_fields = ["user__email"]
    readonly_fields = [f.name for f in VaultKey._meta.fields]

    def has_add_permission(self, request):
        return False


class DocumentInline(admin.TabularInline):
    model = Document
    extra = 0
    fields = ["size", "created_at"]
    readonly_fields = fields
    can_delete = False


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    """Admins can see that assets exist and their category — never their contents."""

    list_display = ["id", "owner", "category", "document_count", "updated_at"]
    list_filter = ["category"]
    search_fields = ["owner__email"]
    fields = ["owner", "category", "created_at", "updated_at"]
    readonly_fields = fields
    inlines = [DocumentInline]

    def has_add_permission(self, request):
        return False

    @admin.display(description="Documents")
    def document_count(self, obj):
        return obj.documents.count()
