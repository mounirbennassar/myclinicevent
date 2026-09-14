FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
RUN useradd -r -s /usr/sbin/nologin app && chown -R app:app /app
USER app
EXPOSE 8000
# Migrations run on every start; they're idempotent.
# Call the venv directly: the unprivileged user has no home for uv's cache.
CMD ["sh", "-c", "/app/.venv/bin/alembic upgrade head && /app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
