import { FormEvent, useState } from 'react';
import axios from 'axios';
import type { ConfigStatus } from '../types';

interface SetupFormProps {
  onConfigured: (status: ConfigStatus) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

const SetupForm = ({ onConfigured }: SetupFormProps) => {
  const [cloudflareUrl, setCloudflareUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [identity, setIdentity] = useState('David Lowe');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        cloudflare_url: cloudflareUrl,
        api_key: apiKey,
        collection_name: collectionName,
        identity,
      };
      const response = await axios.post<ConfigStatus>(`${API_BASE}/config/setup`, payload);
      onConfigured(response.data);
    } catch (err: unknown) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : null;
      setError(detail ?? 'Failed to persist configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-zinc-500" htmlFor="cloudflareUrl">
          Cloudflare / Vector DB URL
        </label>
        <input
          id="cloudflareUrl"
          type="url"
          className="w-full rounded border border-zinc-700 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          placeholder="https://tunnel.example.com"
          required
          value={cloudflareUrl}
          onChange={(event) => setCloudflareUrl(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-zinc-500" htmlFor="apiKey">
          API Key / Service Token
        </label>
        <input
          id="apiKey"
          type="password"
          className="w-full rounded border border-zinc-700 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          placeholder="s3cr3t-token"
          required
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-zinc-500" htmlFor="collectionName">
          Collection / Index Name
        </label>
        <input
          id="collectionName"
          className="w-full rounded border border-zinc-700 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          placeholder="pof_framework"
          required
          value={collectionName}
          onChange={(event) => setCollectionName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-zinc-500" htmlFor="identity">
          ΨΑ Identity
        </label>
        <input
          id="identity"
          className="w-full rounded border border-zinc-700 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          placeholder="David Lowe"
          required
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        className="w-full rounded border border-accent bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Encrypting…' : 'Save Parameters'}
      </button>
    </form>
  );
};

export default SetupForm;
