# Stage 1: Build the frontend and prepare the server
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 (if needed)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies like vite and tsx)
RUN npm install

# Copy source code
COPY . .

# Build the frontend (outputs to dist/)
RUN npm run build

# Stage 2: Final production image
FROM node:20-slim

WORKDIR /app

# Install minimal system dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy built assets and necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/public ./public
# Copy config files if any (like .env.example)
COPY --from=builder /app/.env.example ./

# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application using tsx as defined in package.json
# Note: DATABASE_PATH should be pointed to a volume in docker-compose
CMD ["npm", "start"]
