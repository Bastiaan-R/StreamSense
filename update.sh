#!/bin/bash

# Configuration
# Tip: You can create a .env file in the same directory to store these
# DOCKER_USERNAME="yourusername"
# DOCKER_REPO="streamsense"

echo "🚀 Updating StreamSense..."

# Pull the latest image
docker compose pull

# Restart the services
docker compose up -d

# Clean up old images
docker image prune -f

echo "✅ Update complete! StreamSense is running."
