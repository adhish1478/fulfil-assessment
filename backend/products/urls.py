from django.urls import path
from .views import ImportView, ImportStatusCheckView, ProductListCreateAPIView, ProductRetrieveUpdateDestroyAPIView


urlpatterns = [
    path('import/', ImportView.as_view(), name='import-csv'),
    path('import/status/<str:job_id>/', ImportStatusCheckView.as_view(), name='import-status'),
    path("product/", ProductListCreateAPIView.as_view()),
    path("product/<str:sku>/", ProductRetrieveUpdateDestroyAPIView.as_view()),
]
