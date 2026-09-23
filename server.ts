import http from 'http';
import { spawn } from 'child_process';

const PORT = parseInt(process.env.PORT || '3000', 10);
const FLASK_PORT = 5000;

// Check and spawn python backend
const py = spawn('python3', ['app.py'], {
  stdio: 'inherit',
  env: { ...process.env, FLASK_PORT: String(FLASK_PORT) }
});

py.on('error', (err) => {
  console.error('Failed to spawn Python Flask backend:', err);
});

// Create proxy server to route all traffic to Flask
const server = http.createServer((req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: FLASK_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend connection pending...', details: err.message }));
  });

  req.pipe(proxy, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Institutional AMS server listening on port ${PORT}`);
});
