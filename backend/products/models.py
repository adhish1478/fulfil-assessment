from django.db import models
import uuid
# Create your models here.

class Product(models.Model):
    id= models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sku= models.CharField(max_length=100, help_text="Original SKU of the product")
    sku_norm= models.CharField(max_length=100, 
                               unique=True,
                               db_index=True,
                               help_text="Normalized SKU of the product")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    active= models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        indexes = [
            models.Index(fields=['sku_norm']),
            models.Index(fields=['active']),
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"{self.sku} - {self.name}"
    
    def __save__(self, *args, **kwargs):
        # Normalize the SKU before saving
        if self.sku:
            self.sku_norm = self.sku.strip().lower()
        super().save(*args, **kwargs)
