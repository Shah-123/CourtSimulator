FROM python:3.12-slim

# The repo layout is load-bearing, not cosmetic: app/config.py resolves
# REPO_ROOT as parents[3] of its own path, so the service must sit at
# <root>/artifacts/ai-service exactly as it does in the working tree. Flattening
# app/ to /app/app makes parents[3] raise IndexError and the container dies on
# import. Editable install for the same reason — one copy of the package, at the
# path the code expects, rather than a second one under site-packages.
WORKDIR /app

# Install build essentials for C extensions if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package definition and project files
COPY artifacts/ai-service/pyproject.toml ./artifacts/ai-service/
COPY artifacts/ai-service/app ./artifacts/ai-service/app
COPY data ./data

# Base dependencies only. The `crossencoder` extra is deliberately not installed:
# it pulls torch for a reranker backend the evaluation rejected, and reranker.py
# imports it lazily so the LLM default is unaffected. See pyproject.toml.
RUN pip install --no-cache-dir -e ./artifacts/ai-service

WORKDIR /app/artifacts/ai-service

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
