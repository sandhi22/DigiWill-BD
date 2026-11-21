"""
Zero-knowledge vault storage.

The server never sees plaintext. Everything below is ciphertext produced in
the browser with AES-256-GCM:

  passphrase ──PBKDF2──▶ KEK ──wraps──▶ Master Key (MK)
  MK ──wraps──▶ per-asset key (AK) ──encrypts──▶ asset payload + documents

Only `category` is stored in the clear, so the dashboard can group assets
without unlocking the vault.
"""
import secrets

from django.conf import settings
from django.db import models


class VaultKey(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vault_key")
    kdf = models.CharField(max_length=32, default="PBKDF2-SHA256")
    kdf_salt = models.CharField(max_length=64)
    kdf_iterations = models.PositiveIntegerField()
    wrapped_master_key = models.CharField(max_length=128)
    wrap_iv = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Vault key for {self.user}"


class Asset(models.Model):
    class Category(models.TextChoices):
        MOBILE_BANKING = "mobile_banking", "Mobile banking"
        BANK = "bank", "Bank account"
        EMAIL = "email", "Email"
        SOCIAL = "social", "Social media"
        CLOUD = "cloud", "Cloud & files"
        INVESTMENT = "investment", "Investments & savings"
        OTHER = "other", "Other"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assets")
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    ciphertext = models.TextField()
    iv = models.CharField(max_length=32)
    wrapped_key = models.CharField(max_length=128)
    key_iv = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "-updated_at"]

    def __str__(self):
        return f"{self.get_category_display()} asset #{self.pk} ({self.owner.email})"


def document_path(instance, filename):
    # Random name: the original filename is part of the encrypted metadata.
    return f"vault/{instance.asset.owner_id}/{secrets.token_hex(16)}.bin"


class Document(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="documents")
    blob = models.FileField(upload_to=document_path)
    file_iv = models.CharField(max_length=32)
    meta_ciphertext = models.TextField()
    meta_iv = models.CharField(max_length=32)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def delete(self, *args, **kwargs):
        storage, name = self.blob.storage, self.blob.name
        super().delete(*args, **kwargs)
        if name:
            storage.delete(name)
