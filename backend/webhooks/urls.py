from django.urls import path
from .views import (
    WebhookListCreateAPIView,
    WebhookRetrieveUpdateDestroyAPIView,
    WebhookTestAPIView,
)

urlpatterns = [
    path("", WebhookListCreateAPIView.as_view()),
    path("<int:pk>/", WebhookRetrieveUpdateDestroyAPIView.as_view()),
    path("<int:pk>/test/", WebhookTestAPIView.as_view()),
]