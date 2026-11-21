from django.conf import settings
from rest_framework import serializers

from digiwill.fields import Base64Field, iv_field

from .models import Asset, Document, VaultKey


class VaultKeySerializer(serializers.ModelSerializer):
    kdf_salt = Base64Field(decoded_length=16)
    wrapped_master_key = Base64Field(decoded_length=48)  # 32-byte key + 16-byte GCM tag
    wrap_iv = iv_field()
    kdf_iterations = serializers.IntegerField(min_value=200_000, max_value=5_000_000)

    class Meta:
        model = VaultKey
        fields = ["kdf", "kdf_salt", "kdf_iterations", "wrapped_master_key", "wrap_iv", "updated_at"]
        read_only_fields = ["kdf", "updated_at"]


class DocumentSerializer(serializers.ModelSerializer):
    blob = serializers.FileField(write_only=True)
    file_iv = iv_field()
    meta_ciphertext = Base64Field(max_length=4096)
    meta_iv = iv_field()

    class Meta:
        model = Document
        fields = ["id", "blob", "file_iv", "meta_ciphertext", "meta_iv", "size", "created_at"]
        read_only_fields = ["id", "size", "created_at"]

    def validate_blob(self, blob):
        if blob.size > settings.MAX_DOCUMENT_BYTES + 16:
            mb = settings.MAX_DOCUMENT_BYTES // (1024 * 1024)
            raise serializers.ValidationError(f"Files can be up to {mb} MB.")
        return blob

    def create(self, validated):
        validated["size"] = validated["blob"].size
        return super().create(validated)


class AssetSerializer(serializers.ModelSerializer):
    ciphertext = Base64Field(max_length=200_000)
    iv = iv_field()
    wrapped_key = Base64Field(decoded_length=48)
    key_iv = iv_field()
    documents = DocumentSerializer(many=True, read_only=True)
    nominee_ids = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            "id", "category", "ciphertext", "iv", "wrapped_key", "key_iv",
            "documents", "nominee_ids", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "documents", "nominee_ids", "created_at", "updated_at"]

    def get_nominee_ids(self, asset):
        return [a.nominee_id for a in asset.assignments.all()]
