from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("nominees", views.NomineeViewSet, basename="nominee")

urlpatterns = [
    path("assets/<int:asset_id>/assignments/", views.AssetAssignmentsView.as_view()),
    path("switch/", views.SwitchView.as_view()),
    path("switch/checkin/", views.CheckInView.as_view()),
    path("switch/run/", views.CronRunView.as_view()),
    path("activity/", views.ActivityView.as_view()),
    path("public/checkin/<str:token>/", views.EmailCheckInView.as_view()),
    path("public/invite/<str:token>/", views.InviteView.as_view()),
    path("public/release/<str:token>/", views.ReleaseView.as_view()),
    path("public/release/<str:token>/documents/<int:doc_id>/", views.ReleaseDocumentView.as_view()),
] + router.urls
