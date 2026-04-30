// api.ts — backend API helpers
import type {
  DisplaysResponse,
  ProcessResponse,
  StatusEventData,
  UploadResponse,
} from './types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8888';

export async function fetchDisplays(): Promise<DisplaysResponse> {
  const r = await fetch(`${BASE}/api/displays`);
  return r.json();
}

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function startProcessing(params: {
  job_id: string;
  display_key: string;
  target_fps?: number;
  use_dither: boolean;
  dedup_threshold: number;
}): Promise<ProcessResponse> {
  const fd = new FormData();
  fd.append('job_id', params.job_id);
  fd.append('display_key', params.display_key);
  fd.append('use_dither', String(params.use_dither));
  fd.append('dedup_threshold', String(params.dedup_threshold));
  if (params.target_fps) fd.append('target_fps', String(params.target_fps));
  const r = await fetch(`${BASE}/api/process`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function subscribeStatus(
  jobId: string,
  onData: (d: StatusEventData) => void,
  onDone: () => void,
): () => void {
  const es = new EventSource(`${BASE}/api/status/${jobId}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data) as StatusEventData;
    onData(data);
    if (data.status === 'done' || data.status === 'error') {
      es.close();
      onDone();
    }
  };
  es.onerror = () => { es.close(); onDone(); };
  return () => es.close();
}

export function downloadUrl(jobId: string) {
  return `${BASE}/api/download/${jobId}`;
}

export function streamMetaUrl(jobId: string) {
  return `${BASE}/api/stream/${jobId}/meta`;
}
