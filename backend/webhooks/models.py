from django.db import models

class Webhook(models.Model):
    EVENT_CHOICES = [
    ("product.created", "Product Created"),
    ("product.updated", "Product Updated"),
    ("product.deleted", "Product Deleted"),
    ("product.import.completed", "Import Completed"),
]

    url = models.URLField()
    event = models.CharField(max_length=64, choices=EVENT_CHOICES)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)