from django.urls import path
from .views import ImportView, ImportStatusCheckView, ProductListCreateAPIView, ProductRetrieveUpdateDestroyAPIView


urlpatterns = [
    path('imports/', ImportView.as_view(), name='import-csv'),
    path('imports/status/<str:job_id>/', ImportStatusCheckView.as_view(), name='import-status'),
    path("products/", ProductListCreateAPIView.as_view()),
    path("products/<str:id>/", ProductRetrieveUpdateDestroyAPIView.as_view()),
]
