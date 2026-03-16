FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir uv

COPY pyproject.toml .

RUN uv pip compile pyproject.toml -o requirements.txt && \
    uv pip install --system -r requirements.txt

COPY . .

# By default, run the FastAPI server.
# To run a worker, override the command in your docker-compose:
# command: ["rq", "worker-pool", "-n", "N"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
