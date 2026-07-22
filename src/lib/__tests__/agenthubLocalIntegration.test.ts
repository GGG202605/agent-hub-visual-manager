/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOwnershipRecordPath } from '../../../scripts/agenthubLocalLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cliEntry = path.join(repoRoot, 'scripts', 'agenthub-local.mjs');
const cleanupPorts = new Set<number>();
const cleanupWorkspaces = new Set<string>();

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

async function createWorkspace() {
  const workspace = await mkdtemp(path.join(tmpdir(), 'agenthub-local-operator-test-'));
  cleanupWorkspaces.add(workspace);
  await mkdir(path.join(workspace, '.agent-hub'), { recursive: true });
  await writeFile(path.join(workspace, '.agent-hub', 'project-state.md'), '# Synthetic operator workspace\n', 'utf8');
  return workspace;
}

async function runCli(args: string[], timeoutMs = 15_000) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`operator command timed out: ${args[0]}`));
    }, timeoutMs);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function parseReceipt(stdout: string) {
  return JSON.parse(stdout) as Record<string, any>;
}

afterEach(async () => {
  for (const port of cleanupPorts) await runCli(['stop', '--port', String(port)]).catch(() => undefined);
  cleanupPorts.clear();
  for (const workspace of cleanupWorkspaces) await rm(workspace, { recursive: true, force: true });
  cleanupWorkspaces.clear();
});

describe('AgentHub local operator lifecycle', () => {
  it('starts default-off, reports safe status and stops only its owned service', async () => {
    const workspace = await createWorkspace();
    const port = await reservePort();
    cleanupPorts.add(port);

    const started = await runCli(['start', '--workspace', workspace, '--port', String(port)]);
    expect(started.code, started.stderr).toBe(0);
    const startReceipt = parseReceipt(started.stdout);
    expect(startReceipt).toMatchObject({
      ok: true,
      action: 'start',
      status: 'started',
      service: {
        ok: true,
        receipts: 0,
        safePilotIssuanceRequested: false,
        safePilotIssuanceEnabled: false,
        operator: { managed: true },
      },
    });
    expect(started.stdout).not.toContain(workspace);
    expect(started.stdout).not.toContain('sessionToken');

    const status = await runCli(['status', '--port', String(port)]);
    expect(status.code).toBe(0);
    expect(parseReceipt(status.stdout)).toMatchObject({ ok: true, action: 'status', status: 'running' });
    expect(status.stdout).not.toContain(workspace);
    expect(status.stdout).not.toContain('sessionToken');

    const stopped = await runCli(['stop', '--port', String(port)]);
    expect(stopped.code).toBe(0);
    expect(parseReceipt(stopped.stdout)).toEqual({ ok: true, action: 'stop', status: 'stopped' });
    cleanupPorts.delete(port);
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();
    await expect(rm(getOwnershipRecordPath(port), { force: false })).rejects.toMatchObject({ code: 'ENOENT' });
  }, 30_000);

  it('enables issuance only with all three approved hashes and never echoes full pins', async () => {
    const workspace = await createWorkspace();
    const port = await reservePort();
    cleanupPorts.add(port);
    const task = 'a'.repeat(64);
    const context = 'b'.repeat(64);
    const profile = 'c'.repeat(64);
    const started = await runCli([
      'start', '--workspace', workspace, '--port', String(port),
      '--enable-safe-pilot-issuance',
      '--task-sha256', task,
      '--context-sha256', context,
      '--profile-sha256', profile,
    ]);
    expect(started.code, started.stderr).toBe(0);
    expect(parseReceipt(started.stdout)).toMatchObject({
      ok: true,
      service: {
        safePilotIssuanceRequested: true,
        safePilotIssuanceEnabled: true,
        safePilotIssuerPinning: {
          ready: true,
          taskSha256Prefix: task.slice(0, 16),
          contextSha256Prefix: context.slice(0, 16),
          profileSha256Prefix: profile.slice(0, 16),
          blockers: [],
        },
      },
    });
    expect(started.stdout).not.toContain(task);
    expect(started.stdout).not.toContain(context);
    expect(started.stdout).not.toContain(profile);
  }, 30_000);

  it('blocks a foreign listener without terminating it', async () => {
    const workspace = await createWorkspace();
    const foreign: HttpServer = createHttpServer((_request, response) => {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('foreign');
    });
    await new Promise<void>((resolve, reject) => {
      foreign.once('error', reject);
      foreign.listen(0, '127.0.0.1', () => resolve());
    });
    const address = foreign.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    try {
      const started = await runCli(['start', '--workspace', workspace, '--port', String(port)]);
      expect(started.code).toBe(1);
      expect(parseReceipt(started.stdout)).toEqual({ ok: false, action: 'start', status: 'blocked_foreign_listener' });
      const stillRunning = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(stillRunning.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => foreign.close(() => resolve()));
    }
  });

  it('does not reuse an owned port for a different workspace', async () => {
    const firstWorkspace = await createWorkspace();
    const secondWorkspace = await createWorkspace();
    const port = await reservePort();
    cleanupPorts.add(port);

    const started = await runCli(['start', '--workspace', firstWorkspace, '--port', String(port)]);
    expect(started.code, started.stderr).toBe(0);
    const mismatched = await runCli(['start', '--workspace', secondWorkspace, '--port', String(port)]);
    expect(mismatched.code).toBe(1);
    expect(parseReceipt(mismatched.stdout)).toEqual({
      ok: false,
      action: 'start',
      status: 'blocked_workspace_mismatch',
    });

    const status = await runCli(['status', '--port', String(port)]);
    expect(status.code).toBe(0);
    expect(parseReceipt(status.stdout)).toMatchObject({ ok: true, status: 'running' });
  }, 30_000);
});
