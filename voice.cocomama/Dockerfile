FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV VOICE_GATEWAY_HOST=0.0.0.0
ENV VOICE_GATEWAY_PORT=8010

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY voice_gateway ./voice_gateway

EXPOSE 8010

CMD ["python", "-m", "uvicorn", "voice_gateway.main:app", "--host", "0.0.0.0", "--port", "8010"]