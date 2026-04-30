// api.ts — backend API helpers
import type {
  DisplaysResponse,
  FeedbackFormData,
  FeedbackPromptResponse,
  FeedbackSubmitResponse,
  ProcessResponse,
  StatusEventData,
  UploadResponse,
} from './types';

const rawApiBase = import.meta.env.VITE_API_URL?.trim() ?? '';
const BASE = rawApiBase
  .replace(/\/+$/, '')
  .replace(/\/api$/i, '');

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

async function readApiError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { detail?: unknown };
    return typeof data.detail === 'string' ? data.detail : text;
  } catch {
    return text || response.statusText;
  }
}

export async function fetchDisplays(): Promise<DisplaysResponse> {
  const r = await fetch(apiUrl('/displays'));
  return r.json();
}

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(apiUrl('/upload'), { method: 'POST', body: fd });
  if (!r.ok) throw new Error(await readApiError(r));
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
  const r = await fetch(apiUrl('/process'), { method: 'POST', body: fd });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export function subscribeStatus(
  jobId: string,
  onData: (d: StatusEventData) => void,
  onDone: () => void,
): () => void {
  const es = new EventSource(apiUrl(`/status/${jobId}`));
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
  return apiUrl(`/download/${jobId}`);
}

export function streamMetaUrl(jobId: string) {
  return apiUrl(`/stream/${jobId}/meta`);
}

export async function fetchFeedbackPrompt(): Promise<FeedbackPromptResponse> {
  const r = await fetch(apiUrl('/feedback/prompt'));
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}

export async function markFeedbackPromptSeen(): Promise<void> {
  const r = await fetch(apiUrl('/feedback/prompt-seen'), { method: 'POST' });
  if (!r.ok) throw new Error(await readApiError(r));
}

export async function submitFeedback(data: FeedbackFormData): Promise<FeedbackSubmitResponse> {
  const r = await fetch(apiUrl('/feedback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await readApiError(r));
  return r.json();
}
