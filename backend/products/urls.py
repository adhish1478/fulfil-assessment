from django.urls import path
from .views import ImportView, ImportStatusCheckView


urlpatterns = [
    path('import/', ImportView.as_view(), name='import-csv'),
    path('import/status/<str:job_id>/', ImportStatusCheckView.as_view(), name='import-status'),
]
