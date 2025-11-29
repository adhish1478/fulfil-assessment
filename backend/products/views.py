import uuid
import tempfile
import os, redis
from django.conf import settings
from celery.result import AsyncResult

from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework import generics, filters
from rest_framework.response import Response
from rest_framework import status
from .models import Product
from .serializers import ProductSerializer
from .pagination import ProductPagination


from webhooks.tasks import trigger_event_webhook
from .tasks import import_csv_task

# Create your views here.
class ImportView(APIView):
    def post(self, request):
        """
        Expects a file upload in 'file' field of the request.
        """
        upload_file= request.FILES.get('file')
        if not upload_file:
            return Response({"error": "No file uploaded"}, status= status.HTTP_400_BAD_REQUEST)
        
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        for chunk in upload_file.chunks():
            temp.write(chunk)
        temp.close()
        print(temp.name)
        job_id= str(uuid.uuid4())
        import_csv_task.delay(job_id, temp.name)

        return Response({"message": "Import started","job_id": job_id}, status= status.HTTP_202_ACCEPTED)

class ImportStatusCheckView(APIView):
    def get(self, request, job_id):
        """
        Check the status of an import job by job_id.
        """
        r= redis.Redis.from_url(settings.CELERY_BROKER_URL)
        raw= r.get(f"import : {job_id}")
        if not raw:
            return Response({"error": "Job ID not found or expired"}, status= status.HTTP_404_NOT_FOUND)

        return Response(eval(raw), status= status.HTTP_200_OK)

class ProductListCreateAPIView(generics.ListCreateAPIView):
    queryset = Product.objects.all().order_by('created_at')
    serializer_class = ProductSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['sku', 'name', 'description']
    pagination_class = ProductPagination


    def perform_create(self, serializer):
        product = serializer.save()
        trigger_event_webhook("product.created", {"product": ProductSerializer(product).data})

    def get_queryset(self):
        qs = super().get_queryset()
        sku = self.request.query_params.get("sku")
        name = self.request.query_params.get("name")
        description = self.request.query_params.get("description")
        active = self.request.query_params.get("active")

        if sku:
            qs = qs.filter(sku__icontains=sku)
        if name:
            qs = qs.filter(name__icontains=name)
        if description:
            qs = qs.filter(description__icontains=description)
        if active is not None:
            qs = qs.filter(active=active.lower() == "true")

        return qs

    def delete(self, request, *args, **kwargs):
        deleted, _ = Product.objects.all().delete()
        return Response(
            {"message": f"Deleted {deleted} products"},
            status=status.HTTP_200_OK
        )


class ProductRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    lookup_field = 'id'


    def perform_update(self, serializer):
        product = serializer.save()
        trigger_event_webhook("product.updated", {"product": ProductSerializer(product).data})

    def perform_destroy(self, instance):
        payload = {"product": ProductSerializer(instance).data}
        trigger_event_webhook("product.deleted", payload)
        instance.delete()