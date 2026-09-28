FROM python:3.12-slim
WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home wordloom && mkdir /data && chown wordloom /data
COPY app ./app
USER wordloom
ENV WORDLOOM_DB_PATH=/data/wordloom.db
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
