import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import numpy as np
from cryptography.fernet import Fernet
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

try:
    from pymilvus import MilvusClient
except ImportError:  # pragma: no cover - allows the API to start without Milvus for local testing
    MilvusClient = None

DATA_DIR = Path("data")
CONFIG_PATH = DATA_DIR / "config.enc"
KEY_PATH = DATA_DIR / "config.key"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 750
CHUNK_OVERLAP = 150
SIMILARITY_THRESHOLD = 0.98
VECTOR_FIELD = "embedding"


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(exist_ok=True)


def generate_key() -> bytes:
    key = Fernet.generate_key()
    KEY_PATH.write_bytes(key)
    return key


def load_key() -> bytes:
    if not KEY_PATH.exists():
        return generate_key()
    return KEY_PATH.read_bytes()


def encrypt_config(payload: dict) -> None:
    ensure_data_dir()
    key = load_key()
    fernet = Fernet(key)
    CONFIG_PATH.write_bytes(fernet.encrypt(json.dumps(payload).encode("utf-8")))


def decrypt_config() -> dict:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError("Configuration not found")
    key = load_key()
    fernet = Fernet(key)
    decrypted = fernet.decrypt(CONFIG_PATH.read_bytes()).decode("utf-8")
    return json.loads(decrypted)


def config_exists() -> bool:
    return CONFIG_PATH.exists()


class SetupPayload(BaseModel):
    cloudflare_url: str
    api_key: str
    collection_name: str
    identity: str


class ConfigStatus(BaseModel):
    configured: bool
    identity: Optional[str] = None
    collection_name: Optional[str] = None


class UploadResponse(BaseModel):
    inserted_vectors: int
    duplicate_chunks: int
    duplicate_message: Optional[str] = None


app = FastAPI(title="ΨΑ Genesis Data Manager", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"]
    ,
    allow_headers=["*"],
)


@app.get("/config/status", response_model=ConfigStatus)
def get_config_status() -> ConfigStatus:
    if not config_exists():
        return ConfigStatus(configured=False)
    cfg = decrypt_config()
    return ConfigStatus(
        configured=True,
        identity=cfg.get("identity"),
        collection_name=cfg.get("collection_name"),
    )


@app.post("/config/setup", response_model=ConfigStatus)
def setup_config(payload: SetupPayload) -> ConfigStatus:
    if config_exists():
        raise HTTPException(status_code=400, detail="Configuration already exists")
    encrypt_config(payload.dict())
    return ConfigStatus(configured=True, identity=payload.identity, collection_name=payload.collection_name)


@app.post("/config/reset")
def reset_config() -> ConfigStatus:
    if CONFIG_PATH.exists():
        CONFIG_PATH.unlink()
    if KEY_PATH.exists():
        KEY_PATH.unlink()
    return ConfigStatus(configured=False)


class VectorChunk(BaseModel):
    text: str
    embedding: List[float]


class ProcessedFile(BaseModel):
    filename: str
    chunks: List[VectorChunk]


def read_file(file: UploadFile) -> str:
    import io
    import json as json_lib

    suffix = Path(file.filename).suffix.lower()
    data = file.file.read()
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    if suffix in {".md", ".txt"}:
        return data.decode("utf-8", errors="ignore")
    if suffix == ".json":
        obj = json_lib.loads(data)
        return json_lib.dumps(obj, indent=2)
    raise HTTPException(status_code=400, detail="Unsupported file format")


def chunk_text(text: str) -> List[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_SIZE, len(words))
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
        if start < 0:
            start = end
    return chunks


def embed_chunks(chunks: List[str]) -> List[List[float]]:
    if not chunks:
        return []
    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(chunks, convert_to_numpy=True)
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized = embeddings / norms
    return normalized.tolist()


def get_milvus_client(cfg: dict):
    if MilvusClient is None:
        raise RuntimeError("pymilvus is not installed. Install it to enable vector operations.")
    uri = cfg["cloudflare_url"]
    token = cfg.get("api_key")
    return MilvusClient(uri=uri, token=token)


def _extract_score(hit) -> Optional[float]:
    if hasattr(hit, "score"):
        try:
            return float(getattr(hit, "score"))
        except (TypeError, ValueError):
            return None
    if isinstance(hit, dict):
        score = hit.get("score")
        if score is not None:
            try:
                return float(score)
            except (TypeError, ValueError):
                return None
        distance = hit.get("distance")
        if distance is not None:
            try:
                return float(distance)
            except (TypeError, ValueError):
                return None
    return None


def perform_duplicate_check(client, collection_name: str, chunks: List[VectorChunk]) -> int:
    duplicate_count = 0
    if not chunks:
        return duplicate_count
    try:
        search_results = client.search(
            collection_name=collection_name,
            data=[chunk.embedding for chunk in chunks],
            limit=1,
            anns_field=VECTOR_FIELD,
            search_params={"metric_type": "COSINE", "params": {"nprobe": 10}},
            output_fields=["id"],
        )
    except Exception as exc:  # pragma: no cover - relies on external service
        raise HTTPException(status_code=502, detail=f"Vector search failed: {exc}") from exc

    for result in search_results:
        if not result:
            continue
        top_hit = result[0]
        score = _extract_score(top_hit)
        if score and score >= SIMILARITY_THRESHOLD:
            duplicate_count += 1
    return duplicate_count


def persist_vectors(client, cfg: dict, processed: ProcessedFile) -> int:
    if not processed.chunks:
        return 0
    now = datetime.utcnow().isoformat()
    payload = []
    for chunk in processed.chunks:
        payload.append(
            {
                VECTOR_FIELD: chunk.embedding,
                "text": chunk.text,
                "filename": processed.filename,
                "uploaded_at": now,
                "identity": cfg.get("identity"),
            }
        )
    try:
        insert_result = client.insert(collection_name=cfg["collection_name"], data=payload)
    except Exception as exc:  # pragma: no cover - external dependency
        raise HTTPException(status_code=502, detail=f"Failed to insert vectors: {exc}") from exc

    if hasattr(insert_result, "insert_count"):
        try:
            return int(getattr(insert_result, "insert_count"))
        except (TypeError, ValueError):  # pragma: no cover - defensive
            return len(payload)
    if isinstance(insert_result, dict):
        count = insert_result.get("insert_count")
        if count is not None:
            try:
                return int(count)
            except (TypeError, ValueError):  # pragma: no cover - defensive
                return len(payload)
    return len(payload)


@app.post("/upload", response_model=UploadResponse)
def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    if not config_exists():
        raise HTTPException(status_code=400, detail="System is not configured. Complete setup first.")
    cfg = decrypt_config()
    text = read_file(file)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    chunks = chunk_text(text)
    embeddings = embed_chunks(chunks)
    processed = ProcessedFile(
        filename=file.filename,
        chunks=[VectorChunk(text=c, embedding=e) for c, e in zip(chunks, embeddings)],
    )

    client = get_milvus_client(cfg)
    duplicate_chunks = perform_duplicate_check(client, cfg["collection_name"], processed.chunks)
    if duplicate_chunks:
        return UploadResponse(
            inserted_vectors=0,
            duplicate_chunks=duplicate_chunks,
            duplicate_message="DUPLICATE REJECTED (Coherence Already Maxed)",
        )

    inserted = persist_vectors(client, cfg, processed)
    return UploadResponse(inserted_vectors=inserted, duplicate_chunks=0)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
