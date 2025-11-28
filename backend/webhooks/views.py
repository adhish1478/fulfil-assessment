from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView
import requests
from .models import Webhook
from .serializers import WebhookSerializer

class WebhookListCreateAPIView(generics.ListCreateAPIView):
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer


class WebhookRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Webhook.objects.all()
    serializer_class = WebhookSerializer


class WebhookTestAPIView(APIView):
    def post(self, request, pk):
        webhook = Webhook.objects.get(pk=pk)

        payload = {
            "event": "test",
            "message": "Webhook test successful"
        }

        try:
            r = requests.post(webhook.url, json=payload, timeout=5)
            return Response({"status": r.status_code, "response": r.text})
        except Exception as e:
            return Response({"error": str(e)}, status=500)