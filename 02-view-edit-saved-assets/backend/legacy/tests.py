import base64
import os
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from legacy import services
from legacy.models import Activity, Nominee, Switch


def b64(n):
    return base64.b64encode(os.urandom(n)).decode()


def key_material():
    return {"server_share": b64(32), "wrapped_key": b64(48), "key_iv": b64(12), "card_hint": "AB12"}


def asset_payload(category="mobile_banking"):
    return {"category": category, "ciphertext": b64(200), "iv": b64(12), "wrapped_key": b64(48), "key_iv": b64(12)}


@override_settings(CRON_SECRET="s3cret", MEDIA_ROOT="/tmp/digiwill-test-media")
class DigiWillFlowTests(APITestCase):
    def setUp(self):
        cache.clear()  # throttling counters

    def register(self, email="rahim@example.com"):
        res = self.client.post("/api/auth/register/", {
            "email": email, "full_name": "Rahim Uddin", "password": "kantha-stitch-42", "language": "bn",
        })
        self.assertEqual(res.status_code, 201, res.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return User.objects.get(email=email)

    def setup_vault(self):
        res = self.client.post("/api/vault/key/", {
            "kdf_salt": b64(16), "kdf_iterations": 600000, "wrapped_master_key": b64(48), "wrap_iv": b64(12),
        })
        self.assertEqual(res.status_code, 201, res.data)

    def add_nominee(self, email="karima@example.com"):
        res = self.client.post("/api/nominees/", {"name": "Karima", "email": email, "relation": "Sister", **key_material()})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertNotIn("server_share", res.data)
        return Nominee.objects.get(pk=res.data["id"])

    # ------------------------------------------------------------------

    def test_register_login_and_profile(self):
        user = self.register()
        self.assertTrue(Switch.objects.filter(user=user).exists())
        self.client.credentials()
        res = self.client.post("/api/auth/login/", {"email": "RAHIM@example.com", "password": "kantha-stitch-42"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user"]["language"], "bn")
        self.assertEqual(user.activity.filter(kind=Activity.Kind.CHECK_IN).count(), 2)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        res = self.client.patch("/api/auth/me/", {"full_name": "Rahim U.", "email": "x@x.com"})
        self.assertEqual(res.data["full_name"], "Rahim U.")
        self.assertEqual(res.data["email"], "rahim@example.com")

    def test_password_reset_roundtrip(self):
        self.register()
        self.client.credentials()
        mail.outbox.clear()
        self.client.post("/api/auth/password/reset/", {"email": "rahim@example.com"})
        self.assertEqual(len(mail.outbox), 1)
        link = [w for w in mail.outbox[0].body.split() if "/reset-password/" in w][0]
        uid, token = link.rstrip("/").split("/")[-2:]
        res = self.client.post("/api/auth/password/reset/confirm/", {"uid": uid, "token": token, "new_password": "new-kantha-99"})
        self.assertEqual(res.status_code, 200, res.data)
        res = self.client.post("/api/auth/login/", {"email": "rahim@example.com", "password": "new-kantha-99"})
        self.assertEqual(res.status_code, 200)

    def test_vault_assets_documents_and_isolation(self):
        self.register()
        self.assertEqual(self.client.post("/api/vault/assets/", asset_payload()).status_code, 400)  # no vault yet
        self.setup_vault()
        self.assertEqual(self.client.post("/api/vault/key/", {}).status_code, 409)
        asset = self.client.post("/api/vault/assets/", asset_payload()).data
        bad = {**asset_payload(), "iv": "not base64!"}
        self.assertEqual(self.client.post("/api/vault/assets/", bad).status_code, 400)

        blob = SimpleUploadedFile("x.bin", os.urandom(1000))
        res = self.client.post(f"/api/vault/assets/{asset['id']}/documents/", {
            "blob": blob, "file_iv": b64(12), "meta_ciphertext": b64(60), "meta_iv": b64(12),
        }, format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        doc_id = res.data["id"]
        self.assertEqual(self.client.get(f"/api/vault/documents/{doc_id}/").status_code, 200)

        self.register("intruder@example.com")
        self.assertEqual(self.client.get(f"/api/vault/assets/{asset['id']}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/vault/documents/{doc_id}/").status_code, 404)

    def test_full_switch_lifecycle(self):
        owner = self.register()
        self.setup_vault()
        asset = self.client.post("/api/vault/assets/", asset_payload()).data
        mail.outbox.clear()
        nominee = self.add_nominee()
        self.assertEqual(len(mail.outbox), 1)  # invitation
        self.assertIn(nominee.invite_token, mail.outbox[0].body)

        res = self.client.put(f"/api/assets/{asset['id']}/assignments/", {
            "assignments": [{"nominee": nominee.id, "wrapped_key": b64(48), "iv": b64(12)}]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)

        # Nominee accepts via public link.
        self.client.credentials()
        res = self.client.post(f"/api/public/invite/{nominee.invite_token}/", {"decision": "accept"})
        self.assertEqual(res.data["status"], "verified")

        switch = owner.switch
        switch.interval_days, switch.grace_days = 30, 7
        switch.save()
        start = switch.last_check_in
        mail.outbox.clear()

        self.assertIsNone(services.evaluate(switch, start + timedelta(days=10)))
        self.assertEqual(services.evaluate(switch, start + timedelta(days=28)), "heads_up")
        self.assertIsNone(services.evaluate(switch, start + timedelta(days=28, hours=6)))
        self.assertEqual(services.evaluate(switch, start + timedelta(days=30, hours=1)), "overdue")
        switch.refresh_from_db()
        self.assertEqual(switch.state, "overdue")
        recipients = [m.to[0] for m in mail.outbox]
        self.assertIn("karima@example.com", recipients)  # "please check on Rahim"
        self.assertIsNone(services.evaluate(switch, start + timedelta(days=31)))
        self.assertEqual(services.evaluate(switch, start + timedelta(days=32, hours=2)), "reminded")

        # Release link is not live before release.
        self.assertEqual(self.client.get("/api/public/release/nope/").status_code, 404)

        self.assertEqual(services.evaluate(switch, start + timedelta(days=37, hours=1)), "released")
        nominee.refresh_from_db()
        self.assertTrue(nominee.release_token)
        res = self.client.get(f"/api/public/release/{nominee.release_token}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["server_share"], nominee.server_share)
        self.assertEqual(len(res.data["assets"]), 1)
        self.assertIn("grant_key", res.data["assets"][0])

        # Owner proves life via emailed check-in link — release is revoked.
        token = nominee.release_token
        res = self.client.post(f"/api/public/checkin/{switch.checkin_token}/")
        self.assertEqual(res.data["state"], "active")
        self.assertEqual(self.client.get(f"/api/public/release/{token}/").status_code, 404)
        self.assertTrue(owner.activity.filter(kind=Activity.Kind.RELEASE_REVOKED).exists())

    def test_reissue_card_replaces_grants(self):
        self.register()
        self.setup_vault()
        a1 = self.client.post("/api/vault/assets/", asset_payload()).data
        nominee = self.add_nominee()
        old_share = nominee.server_share
        res = self.client.post(f"/api/nominees/{nominee.id}/reissue/", {
            **key_material(), "card_hint": "ZZ99",
            "assignments": [{"asset": a1["id"], "wrapped_key": b64(48), "iv": b64(12)}]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        nominee.refresh_from_db()
        self.assertNotEqual(nominee.server_share, old_share)
        self.assertEqual(res.data["asset_ids"], [a1["id"]])
        self.assertEqual(res.data["card_hint"], "ZZ99")

    def test_nominee_side_assignments(self):
        self.register()
        self.setup_vault()
        a1 = self.client.post("/api/vault/assets/", asset_payload()).data
        a2 = self.client.post("/api/vault/assets/", asset_payload("email")).data
        nominee = self.add_nominee()
        grants = [{"asset": a["id"], "wrapped_key": b64(48), "iv": b64(12)} for a in (a1, a2)]
        res = self.client.put(f"/api/nominees/{nominee.id}/assignments/", {"assignments": grants}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(sorted(res.data["asset_ids"]), sorted([a1["id"], a2["id"]]))
        asset = self.client.get(f"/api/vault/assets/{a1['id']}/").data
        self.assertEqual(asset["nominee_ids"], [nominee.id])

    def test_cannot_assign_foreign_assets(self):
        self.register()
        self.setup_vault()
        foreign = self.client.post("/api/vault/assets/", asset_payload()).data
        self.register("other@example.com")
        self.setup_vault()
        nominee = self.add_nominee()
        res = self.client.post(f"/api/nominees/{nominee.id}/reissue/", {
            **key_material(), "assignments": [{"asset": foreign["id"], "wrapped_key": b64(48), "iv": b64(12)}]},
            format="json")
        self.assertEqual(res.status_code, 400)

    def test_late_acceptance_after_release_gets_link(self):
        owner = self.register()
        self.setup_vault()
        nominee = self.add_nominee()
        switch = owner.switch
        services.evaluate(switch, switch.release_at + timedelta(minutes=1))
        switch.refresh_from_db()
        self.assertEqual(switch.state, "released")
        nominee.refresh_from_db()
        self.assertIsNone(nominee.release_token)  # unverified nominees get nothing
        mail.outbox.clear()
        self.client.credentials()
        self.client.post(f"/api/public/invite/{nominee.invite_token}/", {"decision": "accept"})
        nominee.refresh_from_db()
        self.assertTrue(nominee.release_token)
        self.assertIn(nominee.release_token, mail.outbox[-1].body)

    def test_cron_endpoint_requires_secret(self):
        self.assertEqual(self.client.post("/api/switch/run/").status_code, 403)
        res = self.client.post("/api/switch/run/", HTTP_X_CRON_SECRET="s3cret")
        self.assertEqual(res.status_code, 200)
        self.assertIn("checked", res.data)

    def test_schedule_change_counts_as_check_in(self):
        owner = self.register()
        Switch.objects.filter(user=owner).update(last_check_in=timezone.now() - timedelta(days=61), state="overdue")
        res = self.client.patch("/api/switch/", {"interval_days": 90, "grace_days": 30})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["state"], "active")
        self.assertEqual(self.client.patch("/api/switch/", {"interval_days": 45}).status_code, 400)
