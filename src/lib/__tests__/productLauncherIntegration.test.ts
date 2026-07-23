/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const launcherEntry = path.join(repoRoot, 'scripts', 'product-launcher.mjs');
const START_TIMEOUT_MS = 120_000;

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error?: Error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function runLauncher(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [launcherEntry, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`product launcher timed out: ${args[0]}`));
    }, args[0] === 'start' ? START_TIMEOUT_MS : 15_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

describe('product launcher CLI receipts', () => {
  it('flushes a bounded JSON receipt when no managed service is running', async () => {
    const port = await reservePort();
    const result = await runLauncher(['status', '--port', String(port)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ ok: false, action: 'status', status: 'not_running' });
  });

  it('returns one parse receipt for invalid options', async () => {
    const result = await runLauncher(['start', '--unsafe']);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      action: 'parse',
      status: 'failed_invalid_arguments',
    });
  });

  it('treats an unused product port as already stopped', async () => {
    const port = await reservePort();
    const result = await runLauncher(['stop', '--port', String(port)]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, action: 'stop', status: 'already_stopped' });
  });

  it('flushes the full receipt for a fresh managed start', async () => {
    const port = await reservePort();
    try {
      const result = await runLauncher(['start', '--port', String(port), '--no-open']);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        action: 'start',
        status: 'started',
        build: expect.stringMatching(/^(current|rebuilt)$/),
        dependencies: 'current',
        browser: 'skipped',
      });
    } finally {
      const stopped = await runLauncher(['stop', '--port', String(port)]);
      expect(stopped.code).toBe(0);
      expect(JSON.parse(stopped.stdout)).toMatchObject({ ok: true, action: 'stop' });
    }
  }, START_TIMEOUT_MS + 15_000);
});
