FROM python:3.10-slim
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code including the entrypoint and init_db script
COPY . .

# Set the entrypoint
CMD ["./entrypoint.sh"]
