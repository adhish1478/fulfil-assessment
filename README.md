
Acme Inc. Products Importer — Fulfil.io SDE Assignment

Deployed [Here](https://fulfil-assessment.netlify.app/)

This repository contains my implementation of the Product Importer application as per the assessment requirements. The system supports large-scale CSV imports (500k+ rows), product management UI, webhook management, asynchronous processing with Celery, and a deployed, publicly accessible instance.

I built both the backend (Django + Celery + Redis + PostgreSQL) and the frontend (vanilla HTML/JS) myself, using AI tools (ChatGPT, Claude) mainly for scaffolding and speeding up boilerplate UI, while all debugging, integration, architecture decisions, and deployment were done manually.

⸻

1. Architecture Overview

Backend
	•	Framework: Django REST Framework
	•	Async worker: Celery
	•	Broker + Cache: Redis
	•	Database: PostgreSQL
	•	Deployment: Docker + Docker Compose
	•	Reverse Proxy: Nginx (for HTTPS, gzip, body size config)
	•	Hosted on: Google Cloud Compute VM (single node)

Frontend
	•	Simple HTML/CSS/JS (Tailwind CDN)
	•	Hosted on Netlify
	•	Communicates with backend via REST APIs

Key Features
	•	CSV upload (supports ~500k rows) with real-time progress via polling
	•	Full product CRUD with filtering + pagination
	•	Webhook management (add/edit/delete/test)
	•	Bulk delete functionality
	•	Async webhook dispatch via Celery
	•	Idempotent import logic (SKU-based overwrite, case-insensitive)

⸻

2. Why Polling (and not SSE/WebSockets)

The assessment mentioned a 16–24 hour delivery window, so I optimised for reliability and implementation speed.

I initially considered:
	•	WebSockets: Requires connection management, SSL setup, load balancer support. More overhead in a single-VM deployment.
	•	Server-Sent Events (SSE): Django does not support SSE natively without async servers like Uvicorn, and mixing Gunicorn + SSE requires either gevent or a separate streaming endpoint.

Given the time constraint and the requirement for simplicity, I chose:
	•	Short-interval polling (500ms)
	•	Simple, debuggable, predictable under load
	•	Works reliably behind Nginx without touching Gunicorn configs
	•	Ideal for long-running Celery tasks

⸻

3. CSV Import Logic (500k+ rows)

The import task does the following:
	1.	Saves the uploaded file to a shared Docker volume (/app/tmp).
	2.	Counts rows using:

reader = csv.DictReader(f)
total_rows = sum(1 for row in reader if any(row.values()))

This avoids earlier inconsistencies where blank rows were counted.

	3.	Processes rows in chunks of 5000 for memory efficiency.
	4.	Performs:
	•	bulk_create for new SKUs
	•	bulk_update for existing ones
	5.	Progress stored in Redis:
{ status, percent, processed_rows, total_rows, message }
	6.	Final webhook: product.import.completed

⸻

4. Deployment Notes

Challenges Faced
	•	VM refused HTTPS → resolved by configuring Nginx reverse proxy with SSL.
	•	Requests were failing with 413 Request Entity Too Large → fixed with:

client_max_body_size 500M;


	•	Mixed content errors from Netlify → solved via HTTPS termination on Nginx.
	•	Docker Postgres initially crashed due to architecture mismatch → rebuilt using arm64-compatible image.
	•	Celery failing to find uploaded file → fixed by using a shared Docker volume (shared_tmp:/app/tmp).

Infrastructure Summary
	•	GCP Compute VM (Ubuntu)
	•	Docker + Docker Compose
	•	Nginx reverse proxy (SSL + large body sizes)
	•	Backend served via Gunicorn (2 workers)
	•	Celery worker + Redis + Postgres as services

⸻

5. API Endpoints

Import

POST    /api/imports/
GET     /api/imports/<job_id>/progress/

Products

GET     /api/products/
POST    /api/products/
GET     /api/products/<id>/
PATCH   /api/products/<id>/
DELETE  /api/products/<id>/
DELETE  /api/products/        # bulk delete

Webhooks

GET     /api/webhooks/
POST    /api/webhooks/
GET     /api/webhooks/<id>/
PUT     /api/webhooks/<id>/
DELETE  /api/webhooks/<id>/
POST    /api/webhooks/<id>/test/


⸻

6. Development Workflow

Even though AI tools helped accelerate UI scaffolding and some boilerplate, I had to resolve multiple deployment-level issues manually:
	•	Fixing Docker volume mounts for file sharing
	•	Ensuring Celery can access uploaded files
	•	Resolving HTTPS and CORS on Netlify
	•	Handling large file uploads with Nginx
	•	Ensuring correct Redis key structures for progress tracking
	•	Cleaning database race conditions during bulk import

Every part of the system was tested end-to-end with large CSV files.

⸻

7. Running Locally

docker-compose up --build

Django: http://localhost:8000
Frontend: open frontend/index.html in browser

⸻

8. Environment Variables

.env (backend)

POSTGRES_DB=fulfil_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=1234

CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

UPLOAD_TMP_DIR=/app/tmp
DJANGO_SECRET_KEY=<your-secret-key>
DJANGO_DEBUG=False


⸻

9. Conclusion

The application demonstrates:
	•	Scalable CSV ingestion
	•	A clean REST API
	•	Async task execution
	•	Real-time UI progress
	•	Webhook delivery system
	•	Fully working deployment on GCP with HTTPS

Within the limited turnaround time, I prioritised correctness, reliability, and a clean end-to-end working system over UI complexity.

