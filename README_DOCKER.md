# Hosting StreamSense with Docker

This guide explains how to host your StreamSense application using Docker and Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your system.
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop).

## Configuration

You have two ways to configure StreamSense:

### Option A: In-App Setup Wizard (Recommended)
Simply start the container and navigate to the app in your browser. If it's your first time, you'll be greeted by a **Setup Wizard** that will walk you through connecting Jellyfin, TMDB, and Gemini.

### Option B: Environment Variables
You can pre-configure the application by filling out the `environment` section in `docker-compose.yml` or by creating a `.env` file. These values act as defaults.

1. **Environment Variables**: Update the `environment` section in `docker-compose.yml` or create a `.env` file:
   - `JELLYFIN_URL`: Your Jellyfin server URL.
   - `JELLYFIN_API_KEY`: A Jellyfin API key.
   - `TMDB_READ_ACCESS_TOKEN`: Your TMDB v4 Token.
   - `GEMINI_API_KEY`: Your Google Gemini API Key.

## Deployment

1.  **Preparation**: Ensure you have a `.env` file in the same directory as `docker-compose.yml` with your credentials (see `.env.example`).
2.  **Start the App**: Run the following command:
    ```bash
    docker compose up -d
    ```
    *Note: The first time it runs, it will pull the pre-built image from GHCR.*

3.  **Access the App**: Open your browser to `http://your-server-ip:3000`.

## Automatic Updates (CI/CD)

The project is configured with **GitHub Actions** (`.github/workflows/docker-publish.yml`).

1.  **Every push to `main`** or a version tag (e.g., `v1.0.0`) automatically builds a new Docker image.
2.  The image is pushed to the **GitHub Container Registry (GHCR)** at `ghcr.io/yourusername/streamsense`.

## Updating on your Server

### Manual Update
To pull the latest image and restart the container, run:
```bash
chmod +x update.sh
./update.sh
```

### Automated Updates (Recommended)
You can use **Watchtower** to automatically update your container whenever a new image is pushed to GitHub.

1.  Uncomment the `watchtower` service in `docker-compose.yml`.
2.  Restart your stack: `docker compose up -d`.
3.  Watchtower will check for updates every hour (default) and automatically restart `streamsense` if a new version is found.

## Persistence

The application uses an SQLite database stored in the `/app/data` directory inside the container. This is mapped to a `./data` folder in your project root on the host machine, ensuring your watch history and recommendations are preserved even if the container is restarted or updated.

## Logs

To view the application logs:
```bash
docker logs -f streamsense
```
