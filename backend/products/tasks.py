import csv
import io, os
import uuid
import redis
from django.conf import settings
from django.db import transaction
from celery import shared_task, current_task
from .models import Product
from webhooks.tasks import trigger_event_webhook

r= redis.Redis.from_url(settings.CELERY_BROKER_URL)

@shared_task(bind= True)
def import_csv_task(self, upload_id, file_path, chunk_size= 5000):
    """
    upload_id: job id used for progress
    file_path: path to local file in media/
    """
    # wipe existing data in the db
    print("DELETING ALL PRODUCTS...")
    deleted, _ = Product.objects.all().delete()
    print("DELETED:", deleted)
    # state initialization
    def set_progress(status, processed, total, message= ""):
        percent= int((processed / total) * 100) if total else 0

        if status == "COMPLETED":
            percent = 100
        elif total > 0:
            # Cap at 99% until COMPLETED to avoid premature UI stop
            percent = min(99, int((processed / total) * 100))
        else:
            percent = 0
        
        payload = {
            "job_id": upload_id,
            "status": status,
            "percent": percent,
            "processed_rows": processed,
            "total_rows": total,
            "message": message
        }
        r.set(f"import : {upload_id}", str(payload), ex=24*3600)

    set_progress("PARSING", 0, 0, "Opening file")
    processed= 0
    total_rows= 0

    # count total rows
    with open(file_path, "r", encoding= "utf-8") as f:
        reader = csv.DictReader(f)
        total_rows = sum(1 for row in reader if any(row.values()))

    set_progress("PARSING", processed, total_rows, "Starting Processing")

    seen_skus= set() # to track duplicates in the file, local
    chunk= []

    with open(file_path, "r", encoding= "utf-8") as f:
        reader= csv.DictReader(f)
        for row in reader:
            processed += 1
            sku= (row.get("sku") or "").strip()
            name= (row.get("name") or "").strip()
            description= (row.get("description") or "").strip()
            if not sku:
                continue  # skip rows without SKU

            sku_lower= sku.lower()
            if sku_lower in seen_skus:
                # duplicate inside same file, prefer last or skip — we'll opt to overwrite previous in this import
                # For simplicity, we will keep the last occurrence by replacing previous entry in chunk
                # remove any existing in chunk with same sku_lower
                chunk = [c for c in chunk if c['sku_lower'] != sku_lower]
            seen_skus.add(sku_lower)
            chunk.append({
                'sku':sku,
                'sku_lower': sku_lower,
                'name':name,
                'description':description,
            })

            if len(chunk) >= chunk_size:
                # process chunk
                set_progress("IMPORTING", processed, total_rows, f"processing chunk at row {processed}")
                process_chunk(chunk)
                chunk= []
                # update progress
                set_progress("IMPORTING", processed, total_rows, f"processed {processed} of {total_rows} rows")

        # process remaining rows in chunk
        if chunk:
            set_progress("IMPORTING", processed, total_rows, f"processing final chunk")
            process_chunk(chunk)

        
    set_progress("COMPLETED", processed, total_rows, "Import completed successfully")

    # trigger webhook for import completion
    trigger_event_webhook.delay("product.import.completed", {
        "job_id": upload_id,
        "total_rows": total_rows,
    })

    # cleanup
    seen_skus.clear()
    return {'status': 'completed', 'total_rows': total_rows}

def process_chunk(rows):
    """
    rows: list of dicts with keys sku, sku_lower, name, description
    """
    skus= [r['sku_lower'] for r in rows]
    existing= Product.objects.filter(sku_lower__in= skus)
    existing_map= {p.sku_lower:p for p in existing}

    to_create= []
    to_update= []

    for r in rows:
        if r['sku_lower'] in existing_map:
            p= existing_map[r['sku_lower']]
            p.name= r['name']
            p.description= r['description']
            p.active= True
            to_update.append(p)
        else:
            to_create.append(Product(
                name= r['name'],
                sku= r['sku'],
                sku_lower= r['sku_lower'],
                description= r['description'],
                active= True
            ))
    
    if to_create:
        Product.objects.bulk_create(to_create, batch_size= 10000)
    if to_update:
        Product.objects.bulk_update(to_update, fields= ['name', 'description', 'active'], batch_size= 1000)