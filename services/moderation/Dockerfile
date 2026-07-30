FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN useradd --create-home --uid 10001 moderator
WORKDIR /app
COPY services/moderation/requirements.txt services/moderation/requirements-model.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps --require-hashes -r requirements-model.txt
COPY services/moderation/moderator.py .
USER moderator
EXPOSE 8081
HEALTHCHECK --interval=20s --timeout=3s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8081/metrics', timeout=2)"
CMD ["python", "moderator.py"]
