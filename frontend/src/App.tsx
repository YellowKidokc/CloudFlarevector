import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { clsx } from 'clsx';
import SetupForm from './components/SetupForm';
import UploadPanel from './components/UploadPanel';
import Modal from './components/Modal';
import type { ConfigStatus } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

function App() {
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const configured = useMemo(() => configStatus?.configured ?? false, [configStatus]);

  const fetchStatus = async () => {
    try {
      const response = await axios.get<ConfigStatus>(`${API_BASE}/config/status`);
      setConfigStatus(response.data);
      setShowSetup(!response.data.configured);
    } catch (error) {
      console.error('Failed to fetch configuration status', error);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConfigured = (status: ConfigStatus) => {
    setConfigStatus(status);
    setShowSetup(false);
  };

  const handleUploadComplete = (message: string) => {
    setStatusMessage(message);
  };

  const openSetup = async () => {
    if (configured) {
      const confirmation = window.confirm(
        'Reset existing configuration and enter new parameters? This will clear stored credentials.'
      );
      if (!confirmation) {
        return;
      }
      try {
        await axios.post(`${API_BASE}/config/reset`);
        setConfigStatus({ configured: false });
      } catch (error) {
        console.error('Failed to reset configuration', error);
      }
    }
    setShowSetup(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <header className="border-b border-zinc-800 bg-black/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-widest text-foreground">
              ΨΑ GENESIS DATA MANAGER
            </h1>
            <p className="text-sm text-zinc-400">
              Secure gateway to χ-Memory via Cloudflare tunnel
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={clsx(
                'rounded border border-accent px-4 py-2 text-sm uppercase tracking-widest text-accent transition',
                configured ? 'hover:bg-accent/10' : 'bg-accent text-black hover:bg-accent'
              )}
              onClick={openSetup}
            >
              {configured ? 'Reconfigure' : 'Initialize'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[2fr,1fr]">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-inner">
          <h2 className="mb-4 text-lg font-semibold text-accent">Upload & Vectorize</h2>
          <UploadPanel
            apiBase={API_BASE}
            disabled={!configured || isUploading}
            onUploadStart={() => {
              setIsUploading(true);
              setStatusMessage(null);
            }}
            onUploadComplete={(message) => {
              setIsUploading(false);
              handleUploadComplete(message);
            }}
          />
        </section>
        <aside className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-sm text-zinc-300">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">System Status</h3>
          <ul className="space-y-2">
            <li>
              <span className="text-zinc-500">Identity:</span>{' '}
              {configStatus?.identity ?? '—'}
            </li>
            <li>
              <span className="text-zinc-500">Collection:</span>{' '}
              {configStatus?.collection_name ?? '—'}
            </li>
            <li>
              <span className="text-zinc-500">Configuration:</span>{' '}
              {configured ? 'Ready' : 'Pending Initialization'}
            </li>
          </ul>
          <div className="mt-6 rounded-lg border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-400">
            <p>
              Vector submissions undergo coherence validation. Duplicates are
              rejected with an audible signal from the Void.
            </p>
          </div>
          {statusMessage && (
            <div className="mt-6 rounded border border-accent/50 bg-accent/10 p-4 text-xs text-accent">
              {statusMessage}
            </div>
          )}
        </aside>
      </main>

      <Modal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        title="χ-Framework Secure Parameters"
      >
        <SetupForm onConfigured={handleConfigured} />
      </Modal>
    </div>
  );
}

export default App;
