from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from legacy.models import Activity
from legacy.services import log

from .models import Asset, Document, VaultKey
from .serializers import AssetSerializer, DocumentSerializer, VaultKeySerializer


class VaultKeyView(APIView):
    """The owner's wrapped master key. Created once; re-wrapped on passphrase change."""

    def get(self, request):
        key = getattr(request.user, "vault_key", None)
        if not key:
            return Response({"detail": "Vault not set up."}, status=status.HTTP_404_NOT_FOUND)
        return Response(VaultKeySerializer(key).data)

    def post(self, request):
        if hasattr(request.user, "vault_key"):
            return Response({"detail": "Vault already exists."}, status=status.HTTP_409_CONFLICT)
        serializer = VaultKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        log(request.user, Activity.Kind.VAULT_CREATED)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def put(self, request):
        key = getattr(request.user, "vault_key", None)
        if not key:
            return Response({"detail": "Vault not set up."}, status=status.HTTP_404_NOT_FOUND)
        serializer = VaultKeySerializer(key, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log(request.user, Activity.Kind.PASSPHRASE_CHANGED)
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request):
        """Forgotten passphrase: wipe everything that depends on the master key."""
        if not request.user.check_password(request.data.get("password", "")):
            return Response({"password": ["Password is incorrect."]}, status=status.HTTP_400_BAD_REQUEST)
        for doc in Document.objects.filter(asset__owner=request.user):
            doc.delete()
        request.user.assets.all().delete()
        request.user.nominees.all().delete()
        VaultKey.objects.filter(user=request.user).delete()
        log(request.user, Activity.Kind.VAULT_RESET)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetViewSet(viewsets.ModelViewSet):
    serializer_class = AssetSerializer

    def get_queryset(self):
        return (
            Asset.objects.filter(owner=self.request.user)
            .prefetch_related("documents", "assignments")
        )

    def perform_create(self, serializer):
        if not hasattr(self.request.user, "vault_key"):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Set up your vault first."})
        asset = serializer.save(owner=self.request.user)
        log(self.request.user, Activity.Kind.ASSET_ADDED, category=asset.category)

    def perform_destroy(self, instance):
        for doc in instance.documents.all():
            doc.delete()
        log(self.request.user, Activity.Kind.ASSET_REMOVED, category=instance.category)
        instance.delete()

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def documents(self, request, pk=None):
        asset = self.get_object()
        serializer = DocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(asset=asset)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentViewSet(mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    def get_queryset(self):
        return Document.objects.filter(asset__owner=self.request.user)

    def retrieve(self, request, pk=None):
        doc = get_object_or_404(self.get_queryset(), pk=pk)
        return FileResponse(doc.blob.open("rb"), content_type="application/octet-stream")
