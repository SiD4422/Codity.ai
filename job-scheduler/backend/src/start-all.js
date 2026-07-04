import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('Starting API server and all background workers in a single process...');

const spawnOptions = { stdio: 'inherit' };

// Start the API Server
spawn('node', [join(__dirname, 'server.js')], spawnOptions);

// Start the Workers
spawn('node', [join(__dirname, 'workers/worker.js')], spawnOptions);
spawn('node', [join(__dirname, 'workers/scheduler.js')], spawnOptions);
spawn('node', [join(__dirname, 'workers/reaper.js')], spawnOptions);
