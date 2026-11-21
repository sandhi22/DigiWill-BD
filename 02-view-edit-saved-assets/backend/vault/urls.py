from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("assets", views.AssetViewSet, basename="asset")
router.register("documents", views.DocumentViewSet, basename="document")

urlpatterns = [path("key/", views.VaultKeyView.as_view())] + router.urls
