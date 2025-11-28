from rest_framework import serializers
from .models import Product

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'name', 'sku', 'sku_lower', 'description', 'active']
        read_only_fields = ['sku_lower']

    def validate_sku(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("SKU cannot be empty")

        sku_lower = value.lower().strip()

        qs = Product.objects.filter(sku_lower=sku_lower)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError("A product with this SKU already exists.")

        return value

    def create(self, validated_data):
        validated_data['sku_lower'] = validated_data['sku'].lower().strip()
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        if "sku" in validated_data:
            validated_data["sku_lower"] = validated_data["sku"].lower().strip()
        return super().update(instance, validated_data)