FROM node:20-alpine
WORKDIR /app
# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install
# Copy source code
COPY . .
# Build the Next.js app (if desired) or run in dev mode
CMD ["npm", "run", "dev"]