from django.utils import timezone
from rest_framework import serializers

from digiwill.fields import Base64Field, iv_field
from vault.models import Asset

from .models import Activity, Nominee, Switch


class KeyMaterialMixin(serializers.Serializer):
    server_share = Base64Field(decoded_length=32, write_only=True)
    wrapped_key = Base64Field(decoded_length=48)
    key_iv = iv_field()
    card_hint = serializers.RegexField(r"^[0-9A-Z]{4}$")


class NomineeSerializer(KeyMaterialMixin, serializers.ModelSerializer):
    asset_ids = serializers.SerializerMethodField()

    class Meta:
        model = Nominee
        fields = [
            "id", "name", "email", "phone", "relation", "language",
            "status", "invited_at", "verified_at",
            "server_share", "wrapped_key", "key_iv", "card_hint", "card_issued_at",
            "notified_at", "opened_at", "asset_ids", "created_at",
        ]
        read_only_fields = [
            "id", "status", "invited_at", "verified_at", "card_issued_at",
            "notified_at", "opened_at", "asset_ids", "created_at",
        ]

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None and not isinstance(self.instance, list):
            # Key material changes only through the reissue endpoint.
            fields.pop("server_share")
            for name in ("wrapped_key", "key_iv", "card_hint"):
                fields[name] = serializers.CharField(read_only=True)
        return fields

    def validate_email(self, value):
        value = value.lower().strip()
        owner = self.context["request"].user
        if value == owner.email:
            raise serializers.ValidationError("You can't be your own nominee.")
        qs = Nominee.objects.filter(owner=owner, email=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This person is already one of your nominees.")
        return value

    def validate_language(self, value):
        if value not in ("en", "bn"):
            raise serializers.ValidationError("Choose en or bn.")
        return value

    def get_asset_ids(self, nominee):
        return [a.asset_id for a in nominee.assignments.all()]


class GrantSerializer(serializers.Serializer):
    wrapped_key = Base64Field(decoded_length=48)
    iv = iv_field()


class AssetGrantSerializer(GrantSerializer):
    nominee = serializers.IntegerField()


class NomineeGrantSerializer(GrantSerializer):
    asset = serializers.IntegerField()


class AssetAssignmentsSerializer(serializers.Serializer):
    assignments = AssetGrantSerializer(many=True)


class NomineeAssignmentsSerializer(serializers.Serializer):
    assignments = NomineeGrantSerializer(many=True)


class ReissueSerializer(KeyMaterialMixin):
    assignments = NomineeGrantSerializer(many=True)


class SwitchSerializer(serializers.ModelSerializer):
    due_at = serializers.DateTimeField(read_only=True)
    release_at = serializers.DateTimeField(read_only=True)
    interval_days = serializers.ChoiceField(choices=Switch.INTERVAL_CHOICES)
    grace_days = serializers.ChoiceField(choices=Switch.GRACE_CHOICES)
    server_time = serializers.SerializerMethodField()

    class Meta:
        model = Switch
        fields = [
            "interval_days", "grace_days", "state", "last_check_in",
            "due_at", "release_at", "reminders_sent", "released_at", "server_time",
        ]
        read_only_fields = ["state", "last_check_in", "reminders_sent", "released_at"]

    def get_server_time(self, _):
        return timezone.now()


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = ["id", "kind", "detail", "created_at"]


class ReleasedAssetSerializer(serializers.ModelSerializer):
    """An asset as a nominee sees it: ciphertext plus the key wrapped for *them*."""

    grant_key = serializers.CharField()
    grant_iv = serializers.CharField()
    documents = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = ["id", "category", "ciphertext", "iv", "grant_key", "grant_iv", "documents", "updated_at"]

    def get_documents(self, asset):
        return [
            {"id": d.id, "file_iv": d.file_iv, "meta_ciphertext": d.meta_ciphertext,
             "meta_iv": d.meta_iv, "size": d.size}
            for d in asset.documents.all()
        ]
