import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Starting API server and all background workers in a single process...');

const spawnOptions = { stdio: 'inherit' };

const server = spawn('node', [join(__dirname, 'server.js')], spawnOptions);
const worker = spawn('node', [join(__dirname, 'workers/worker.js')], spawnOptions);
const scheduler = spawn('node', [join(__dirname, 'workers/scheduler.js')], spawnOptions);
const reaper = spawn('node', [join(__dirname, 'workers/reaper.js')], spawnOptions);

[server, worker, scheduler, reaper].forEach(child => {
  child.on('error', (err) => console.error('Child process error:', err));
  child.on('exit', (code) => {
    console.error(`Child process exited with code ${code}`);
    if (code !== 0) process.exit(code || 1);
  });
});
