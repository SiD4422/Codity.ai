import { useEffect, useRef, useState } from 'react';

export function useLiveStatus() {
  const [summary, setSummary] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const url = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace('/api', '').replace('http', 'ws') + '/ws';
    let ws;
    let retryTimer;

    function connect() {
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'job_status_summary') setSummary(msg);
        } catch { /* ignore malformed frame */ }
      };
      ws.onclose = () => { retryTimer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    }
    connect();

    return () => { clearTimeout(retryTimer); wsRef.current?.close(); };
  }, []);

  return summary;
}
