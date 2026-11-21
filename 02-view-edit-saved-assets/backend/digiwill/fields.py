import base64
import binascii

from rest_framework import serializers


class Base64Field(serializers.CharField):
    """A CharField that only accepts valid standard base64 (ciphertext, IVs, keys)."""

    def __init__(self, *, decoded_length=None, **kwargs):
        self.decoded_length = decoded_length
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            raw = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError("Must be valid base64.")
        if self.decoded_length is not None and len(raw) != self.decoded_length:
            raise serializers.ValidationError(f"Must decode to exactly {self.decoded_length} bytes.")
        return value


def iv_field(**kw):
    return Base64Field(decoded_length=12, **kw)
