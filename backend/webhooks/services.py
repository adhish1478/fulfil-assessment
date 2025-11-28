from .models import Webhook
from .tasks import deliver_webhook

def trigger_webhooks(event, payload):
    hooks = Webhook.objects.filter(event=event, enabled=True)
    for hook in hooks:
        deliver_webhook.delay(hook.url, {"event": event, **payload})