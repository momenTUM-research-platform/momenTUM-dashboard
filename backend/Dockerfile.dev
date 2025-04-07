# Use a slim Python image for development
FROM python:3.10-slim

WORKDIR /app

# Install netcat-openbsd for wait-for-service logic
RUN apt-get update && apt-get install -y netcat-openbsd && apt-get clean

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Entrypoint
CMD ["./entrypoint.sh"]