FROM python:3.12-slim

WORKDIR /app

# Install build essentials for C extensions if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package definition and project files
COPY artifacts/ai-service/pyproject.toml ./
COPY artifacts/ai-service/app ./app
COPY data ./data

# Install dependencies and project in editable mode
RUN pip install --no-cache-dir .

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
