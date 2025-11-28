import requests
import time
from celery import shared_task
from .models import Webhook

@shared_task(bind=True)
def send_webhook(self, webhook_id, event, payload):
    wh= Webhook.objects.get(pk= webhook_id)
    if not wh.enabled:
        return {"status": "Webhook disabled"}
    
    body= {
        "event": event,
        "payload": payload
    }

    start= time.time()

    try:
        response= requests.post(wh.url, json= body, timeout= 15)
        elapsed= int(time.time() - start) * 1000 # in ms
        return {"status_code": response.status_code, "response_time_ms": elapsed, "response_body": response.text}
    except Exception as exc:
        # retry
        raise self.retry(exc= exc, countdown= 60, max_retries= 3)
    
@shared_task
def trigger_event_webhook(event, payload):
    matches= Webhook.objects.filter(event= event, enabled= True)
    for wh in matches:
        send_webhook.apply_async((wh.id, event, payload), queue='webhooks')

@shared_task
def deliver_webhook(url, payload):
    try:
        r = requests.post(url, json=payload, timeout=5)
        return {"status": r.status_code, "response": r.text}
    except Exception as e:
        return {"error": str(e)}