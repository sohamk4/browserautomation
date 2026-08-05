import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface RecordedStep {
  id?: string;
  action: string;
  selectors?: Record<string, string>;
  url?: string;
  title?: string;
  value?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface SavedWorkflow {
  id: string;
  name: string;
  steps: RecordedStep[];
  variables?: { name: string; type: string; exampleValue?: string }[];
}

export async function startRecording(): Promise<{ sessionId: string }> {
  const res = await fetch(`${API_URL}/recorder/start`, { method: 'POST' });
  return res.json();
}

export async function stopRecording(save = true): Promise<SavedWorkflow> {
  const res = await fetch(`${API_URL}/recorder/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save }),
  });
  return res.json();
}

export async function pauseRecording(): Promise<void> {
  await fetch(`${API_URL}/recorder/pause`, { method: 'POST' });
}

export async function resumeRecording(): Promise<void> {
  await fetch(`${API_URL}/recorder/resume`, { method: 'POST' });
}

export async function listWorkflows(): Promise<SavedWorkflow[]> {
  const res = await fetch(`${API_URL}/workflows`);
  return res.json();
}

/** Fire an explicit, command-driven recorded action (back/forward/refresh/wait/screenshot/extract). */
export async function sendCommand(action: string, payload?: { ms?: number }): Promise<void> {
  await fetch(`${API_URL}/recorder/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
}

/** Connect to the recorder WebSocket and receive live steps. */
export function connectRecorder(onStep: (step: RecordedStep) => void): Socket {
  const socket = io(API_URL, { transports: ['websocket'] });
  socket.on('step', onStep);
  return socket;
}
