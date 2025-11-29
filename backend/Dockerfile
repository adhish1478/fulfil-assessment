FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

# copy entire backend source
COPY backend /app/backend

WORKDIR /app/backend

ENV PATH="/root/.local/bin:$PATH"

# collect static optionally; entrypoint is gunicorn or celery in docker-compose