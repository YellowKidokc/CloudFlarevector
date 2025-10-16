import { ChangeEvent, DragEvent, useCallback, useState } from 'react';
import axios from 'axios';

interface UploadPanelProps {
  apiBase: string;
  disabled: boolean;
  onUploadStart: () => void;
  onUploadComplete: (message: string) => void;
}

const allowedExtensions = ['.pdf', '.md', '.txt', '.json'];

const UploadPanel = ({ apiBase, disabled, onUploadStart, onUploadComplete }: UploadPanelProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const isAllowed = allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));
      if (!isAllowed) {
        setError('Unsupported file type.');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      onUploadStart();
      setError(null);
      try {
        const response = await axios.post(`${apiBase}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const data = response.data as { duplicate_message?: string; inserted_vectors: number; duplicate_chunks: number };
        if (data.duplicate_message) {
          onUploadComplete(`${data.duplicate_message} (${data.duplicate_chunks} matching segments)`);
        } else {
          onUploadComplete(`Success. ${data.inserted_vectors} vectors anchored to χ-Memory.`);
        }
      } catch (err: unknown) {
        const message = axios.isAxiosError(err) ? err.response?.data?.detail : null;
        setError(message ?? 'Upload failed.');
        onUploadComplete('Upload failed.');
      }
    },
    [apiBase, onUploadComplete, onUploadStart]
  );

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!disabled) {
      setDragActive(true);
    }
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (disabled) return;
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  return (
    <div className="space-y-4">
      <label
        htmlFor="file"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex h-48 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-zinc-700 bg-black/40 text-center transition ${
          dragActive ? 'border-accent/80 bg-accent/10' : 'hover:border-accent/50'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.4em] text-accent">Drop Files</p>
          <p className="text-xs text-zinc-500">PDF • Markdown • Text • JSON</p>
        </div>
        <input id="file" type="file" className="hidden" onChange={onInputChange} disabled={disabled} />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-zinc-500">
        Files are converted into sentence embeddings locally and routed via the Cloudflare tunnel for Milvus/Weaviate insertion.
      </p>
    </div>
  );
};

export default UploadPanel;
