FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY orchestrator /app/orchestrator

EXPOSE 8080

ENV AO_HTTP_HOST=0.0.0.0 \
    AO_HTTP_PORT=8080 \
    AO_DB_PATH=/data/orchestrator.sqlite3

CMD ["python","-m","uvicorn","orchestrator.app:app","--host","0.0.0.0","--port","8080"]

