from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Product
from .tasks import import_csv_task
import uuid
import tempfile
import os, redis
from django.conf import settings
from celery.result import AsyncResult

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