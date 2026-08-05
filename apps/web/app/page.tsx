'use client';

import { useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function Home() {
  const [recording, setRecording] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const startRecording = async () => {
    try {
      const res = await fetch('http://localhost:3000/recorder/start', { method: 'POST' });
      const { sessionId } = await res.json();
      setRecording(true);

      const newSocket = io('http://localhost:3000');
      setSocket(newSocket);
      newSocket.on('step', (step) => {
        setSteps((prev) => [...prev, step]);
      });
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    try {
      await fetch('http://localhost:3000/recorder/stop', { method: 'POST' });
      setRecording(false);
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };
  const toggleExtraction = () => {
    console.log('sc');
    if (socket) {
      console.log('scc');
      socket.emit('toggleExtraction');
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Workflow Recorder</h1>
      <p className="mt-1 text-sm text-slate-500">
        Record real browser actions and turn them into replayable workflows.
      </p>
      <button
        onClick={recording ? stopRecording : startRecording}
        className={`mt-4 rounded px-4 py-2 font-medium text-white ${
          recording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {recording ? '⏹ Stop Recording' : '▶ Start Recording'}
      </button>
      <button onClick={toggleExtraction} className="...">
        🔍 Extract
      </button>

      {steps.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Recorded Steps ({steps.length})</h2>
          <ul className="mt-2 max-h-96 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2">
            {steps.map((s, i) => (
              <li key={i} className="border-b border-slate-200 py-1 text-sm">
                <span className="font-mono text-blue-700">{s.action}</span>
                {s.url && <span className="ml-2 text-slate-500">{s.url}</span>}
                {s.value && <span className="ml-2 text-slate-500">value: {s.value}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}