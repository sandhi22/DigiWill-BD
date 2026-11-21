import hmac

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from digiwill import mail
from vault.models import Asset, Document

from . import services
from .models import Activity, Assignment, Nominee, Switch
from .serializers import (
    ActivitySerializer,
    AssetAssignmentsSerializer,
    NomineeAssignmentsSerializer,
    NomineeSerializer,
    ReissueSerializer,
    ReleasedAssetSerializer,
    SwitchSerializer,
)

# --------------------------------------------------------------------------
# Owner: nominees & assignments
# --------------------------------------------------------------------------


class NomineeViewSet(viewsets.ModelViewSet):
    serializer_class = NomineeSerializer

    def get_queryset(self):
        return Nominee.objects.filter(owner=self.request.user).prefetch_related("assignments")

    def perform_create(self, serializer):
        if not hasattr(self.request.user, "vault_key"):
            raise ValidationError({"detail": "Set up your vault first."})
        if self.request.user.nominees.count() >= 10:
            raise ValidationError({"detail": "You can have up to 10 nominees."})
        nominee = serializer.save(owner=self.request.user)
        services.log(self.request.user, Activity.Kind.NOMINEE_ADDED, name=nominee.name)
        mail.nominee_invite(nominee, services.invite_url(nominee))

    def perform_update(self, serializer):
        old_email = serializer.instance.email
        nominee = serializer.save()
        if nominee.email != old_email:
            nominee.status = Nominee.Status.INVITED
            nominee.verified_at = None
            nominee.invite_token = services.new_token()
            nominee.invited_at = timezone.now()
            nominee.save()
            mail.nominee_invite(nominee, services.invite_url(nominee))

    def perform_destroy(self, instance):
        services.log(self.request.user, Activity.Kind.NOMINEE_REMOVED, name=instance.name)
        instance.delete()

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        nominee = self.get_object()
        if nominee.status == Nominee.Status.VERIFIED:
            return Response({"detail": "Already accepted."}, status=status.HTTP_400_BAD_REQUEST)
        nominee.status = Nominee.Status.INVITED
        nominee.invited_at = timezone.now()
        nominee.save(update_fields=["status", "invited_at"])
        mail.nominee_invite(nominee, services.invite_url(nominee))
        return Response(NomineeSerializer(nominee, context={"request": request}).data)

    @action(detail=True, methods=["put"])
    @transaction.atomic
    def assignments(self, request, pk=None):
        """Replace the full set of assets this nominee receives."""
        nominee = self.get_object()
        serializer = NomineeAssignmentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grants = _checked_grants(request.user, serializer.validated_data["assignments"], "asset")
        nominee.assignments.all().delete()
        Assignment.objects.bulk_create(
            Assignment(nominee=nominee, asset_id=g["asset"], wrapped_key=g["wrapped_key"], iv=g["iv"])
            for g in grants
        )
        nominee.refresh_from_db()
        return Response(NomineeSerializer(nominee, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reissue(self, request, pk=None):
        """New Legacy Card: fresh key split, every grant re-wrapped, old card useless."""
        nominee = self.get_object()
        serializer = ReissueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        grants = _checked_grants(request.user, data["assignments"], "asset")
        nominee.server_share = data["server_share"]
        nominee.wrapped_key = data["wrapped_key"]
        nominee.key_iv = data["key_iv"]
        nominee.card_hint = data["card_hint"]
        nominee.card_issued_at = timezone.now()
        nominee.release_token = None
        nominee.opened_at = None
        nominee.save()
        nominee.assignments.all().delete()
        Assignment.objects.bulk_create(
            Assignment(nominee=nominee, asset_id=g["asset"], wrapped_key=g["wrapped_key"], iv=g["iv"])
            for g in grants
        )
        services.log(request.user, Activity.Kind.CARD_REISSUED, name=nominee.name)
        nominee.refresh_from_db()
        return Response(NomineeSerializer(nominee, context={"request": request}).data)


def _checked_grants(user, grants, key):
    """Make sure every referenced asset/nominee belongs to this owner."""
    ids = {g[key] for g in grants}
    model = Asset if key == "asset" else Nominee
    owned = set(model.objects.filter(owner=user, pk__in=ids).values_list("pk", flat=True))
    if ids - owned:
        raise ValidationError({"assignments": ["Unknown asset or nominee."]})
    return grants


class AssetAssignmentsView(APIView):
    """Replace the full set of nominees who receive one asset."""

    @transaction.atomic
    def put(self, request, asset_id):
        asset = get_object_or_404(Asset, pk=asset_id, owner=request.user)
        serializer = AssetAssignmentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grants = _checked_grants(request.user, serializer.validated_data["assignments"], "nominee")
        asset.assignments.all().delete()
        Assignment.objects.bulk_create(
            Assignment(asset=asset, nominee_id=g["nominee"], wrapped_key=g["wrapped_key"], iv=g["iv"])
            for g in grants
        )
        return Response({"nominee_ids": [g["nominee"] for g in grants]})


# --------------------------------------------------------------------------
# Owner: switch & activity
# --------------------------------------------------------------------------


class SwitchView(APIView):
    def get(self, request):
        return Response(SwitchSerializer(services.ensure_switch(request.user)).data)

    def patch(self, request):
        switch = services.ensure_switch(request.user)
        serializer = SwitchSerializer(switch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        services.log(request.user, Activity.Kind.SCHEDULE_CHANGED,
                     interval=switch.interval_days, grace=switch.grace_days)
        # Changing the schedule is itself proof of life.
        switch = services.check_in(request.user, source="schedule")
        return Response(SwitchSerializer(switch).data)


class CheckInView(APIView):
    def post(self, request):
        switch = services.check_in(request.user, source="button")
        return Response(SwitchSerializer(switch).data)


class ActivityView(APIView):
    def get(self, request):
        items = request.user.activity.all()[:30]
        return Response(ActivitySerializer(items, many=True).data)


# --------------------------------------------------------------------------
# Public, token-based endpoints (no login)
# --------------------------------------------------------------------------


class PublicView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_token"


class EmailCheckInView(PublicView):
    def get(self, request, token):
        switch = get_object_or_404(Switch.objects.select_related("user"), checkin_token=token)
        return Response({"name": switch.user.first_name, "state": switch.state, "due_at": switch.due_at})

    def post(self, request, token):
        switch = get_object_or_404(Switch.objects.select_related("user"), checkin_token=token)
        switch = services.check_in(switch.user, source="email")
        return Response({"name": switch.user.first_name, "state": switch.state, "due_at": switch.due_at})


class InviteView(PublicView):
    def _get(self, token):
        return get_object_or_404(Nominee.objects.select_related("owner"), invite_token=token)

    def _payload(self, n):
        return {"owner": n.owner.full_name, "name": n.name, "relation": n.relation,
                "status": n.status, "language": n.language}

    def get(self, request, token):
        return Response(self._payload(self._get(token)))

    def post(self, request, token):
        nominee = self._get(token)
        decision = request.data.get("decision")
        if decision not in ("accept", "decline"):
            raise ValidationError({"decision": ["Choose accept or decline."]})
        if decision == "accept":
            nominee.status = Nominee.Status.VERIFIED
            nominee.verified_at = timezone.now()
            nominee.save(update_fields=["status", "verified_at"])
            services.log(nominee.owner, Activity.Kind.NOMINEE_VERIFIED, name=nominee.name)
            # Accepted after the owner's vault already released: send the link now.
            if getattr(nominee.owner, "switch", None) and nominee.owner.switch.state == Switch.State.RELEASED:
                services.send_release(nominee)
        else:
            nominee.status = Nominee.Status.DECLINED
            nominee.verified_at = None
            nominee.save(update_fields=["status", "verified_at"])
            services.log(nominee.owner, Activity.Kind.NOMINEE_DECLINED, name=nominee.name)
        return Response(self._payload(nominee))


def _released_nominee(token):
    nominee = (
        Nominee.objects.select_related("owner", "owner__switch")
        .filter(release_token=token, status=Nominee.Status.VERIFIED)
        .first()
    )
    switch = getattr(nominee.owner, "switch", None) if nominee else None
    if not nominee or not switch or switch.state != Switch.State.RELEASED:
        raise Http404("This link is not active.")
    return nominee


class ReleaseView(PublicView):
    def get(self, request, token):
        nominee = _released_nominee(token)
        assets = (
            Asset.objects.filter(assignments__nominee=nominee)
            .annotate(grant_key=F("assignments__wrapped_key"), grant_iv=F("assignments__iv"))
            .prefetch_related("documents")
        )
        if nominee.opened_at is None:
            nominee.opened_at = timezone.now()
            nominee.save(update_fields=["opened_at"])
            services.log(nominee.owner, Activity.Kind.RELEASE_OPENED, name=nominee.name)
        return Response({
            "owner": nominee.owner.full_name,
            "nominee": nominee.name,
            "released_at": nominee.owner.switch.released_at,
            "card_hint": nominee.card_hint,
            "server_share": nominee.server_share,
            "assets": ReleasedAssetSerializer(assets, many=True).data,
        })


class ReleaseDocumentView(PublicView):
    def get(self, request, token, doc_id):
        nominee = _released_nominee(token)
        doc = get_object_or_404(Document, pk=doc_id, asset__assignments__nominee=nominee)
        return FileResponse(doc.blob.open("rb"), content_type="application/octet-stream")


class CronRunView(PublicView):
    """External scheduler hook: POST with header `X-Cron-Secret`."""

    throttle_classes = []

    def post(self, request):
        secret = settings.CRON_SECRET
        given = request.headers.get("X-Cron-Secret", "")
        if not secret or not hmac.compare_digest(secret, given):
            return Response(status=status.HTTP_403_FORBIDDEN)
        return Response(services.run_all())
