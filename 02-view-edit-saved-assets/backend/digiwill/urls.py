from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = "DigiWill BD administration"
admin.site.site_title = "DigiWill BD admin"
admin.site.index_title = "System overview"


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/vault/", include("vault.urls")),
    path("api/", include("legacy.urls")),
]
