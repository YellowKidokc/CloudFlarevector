# ΨΑ Genesis Data Manager

A self-hosted interface for orchestrating the χ-Framework upload and vectorization workflow. The system ships with a blacked-out React frontend, FastAPI backend, and Milvus vector database, all wired through a Cloudflare-secured endpoint.

## Architecture Overview

```
┌────────────────────────┐      ┌──────────────────────┐      ┌──────────────────────────┐
│  ΨΑ GUI (React/Vite)   │ ───▶ │ FastAPI Orchestrator │ ───▶ │ Milvus Vector Database   │
│  Drag & drop uploader  │      │ Encryption + Embeds  │      │ Similarity search + I/O │
└────────────────────────┘      └──────────────────────┘      └──────────────────────────┘
```

The backend stores Cloudflare and database credentials in an encrypted local volume and coordinates vectorization, de-duplication, and persistence.

## Features

- 🔐 **Secure Initialization** – first launch prompts for Cloudflare URL, API token, collection, and identity. Values are encrypted via Fernet and stored on the backend volume.
- 🧠 **Vectorization Pipeline** – PDF, Markdown, Text, and JSON files are chunked and embedded using `sentence-transformers/all-MiniLM-L6-v2`.
- ♻️ **Coherence Guard** – similarity search rejects vectors whose cosine similarity exceeds `0.98`, returning the mandated `DUPLICATE REJECTED (Coherence Already Maxed)` notice.
- 🌓 **Obsidian UI** – Vite + Tailwind deliver a default blackout theme with gold highlights.
- 🐳 **Container Native** – Dockerfiles and a Compose stack ready for Synology / Linux deployments.

## Running Locally

```bash
# Build and start the stack
docker compose up --build
```

- Frontend available on `http://localhost:5173`
- Backend API exposed on `http://localhost:8000`
- Milvus listening on `19530` (gRPC) / `9091` (HTTP)

The backend persists encrypted configuration in the `backend-data` Docker volume.

## First-Time Setup

1. Visit the GUI and complete the setup dialog with the Cloudflare tunnel URL, API key, collection name, and confirm the ΨΑ identity (defaults to `David Lowe`).
2. The backend encrypts the payload and stores it locally.
3. Subsequent uploads will automatically authenticate using the stored credentials.

## Upload Flow

1. Drag and drop `.pdf`, `.md`, `.txt`, or `.json` files onto the interface.
2. The backend reads and chunks document text, generates embeddings, and issues a similarity search against Milvus.
3. If any chunk exceeds the 0.98 similarity threshold, the upload is rejected as a duplicate.
4. Unique chunks are inserted with metadata including filename, upload timestamp, and ΨΑ identity.

## Configuration Reset

POST to `http://localhost:8000/config/reset` (or use the **Reconfigure** button in the GUI) to purge the encrypted configuration and restart the initialization workflow.

## Environment Variables

- `VITE_API_BASE` (optional) – override the backend base URL consumed by the frontend.

## Development Notes

- Backend dependencies pinned in `backend/requirements.txt`.
- Frontend uses Vite with Tailwind CSS for rapid iteration.
- The Milvus vector field defaults to `embedding`; adjust `VECTOR_FIELD` in `backend/app/main.py` to match your schema, or swap the client implementation to Weaviate if preferred.

## License

MIT
