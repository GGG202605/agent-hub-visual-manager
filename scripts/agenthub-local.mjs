import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import { connect } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerArgs,
  createEntryIdentityPrefix,
  createOperatorMarkerPrefix,
  createOwnershipRecord,
  createWorkspaceId,
  getOwnershipRecordPath,
  parseAgentHubLocalArgs,
  projectSafeHealth,
  safeReceipt,
  verifyOwnedService,
} from './agenthubLocalLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(repoRoot, 'server', 'server.mjs');

const parsed = parseAgentHubLocalArgs(process.argv.slice(2));
if (!parsed.ok) finish({ ok: false, action: 'parse', status: 'failed_invalid_arguments', error: parsed.error }, 2);
else await execute(parsed.command);

async function execute(command) {
  const recordPath = getOwnershipRecordPath(command.port);
  try {
    if (command.action === 'start') await start(command, recordPath);
    else if (command.action === 'status') await status(command, recordPath);
    else await stop(command, recordPath);
  } catch {
    finish({ ok: false, action: command.action, status: 'failed_local_operator' }, 1);
  }
}

async function start(command, recordPath) {
  const existing = await readRecord(recordPath);
  const currentHealth = await fetchHealth(command.port);
  if (currentHealth) {
    if (existing && verifyOwnedService(existing, currentHealth, command.port).ok) {
      if (currentHealth.workspaceId !== createWorkspaceId(command.workspace)) {
        finish({ ok: false, action: 'start', status: 'blocked_workspace_mismatch' }, 1);
        return;
      }
      finish(safeReceipt('start', 'already_running', currentHealth), 0);
      return;
    }
    finish({ ok: false, action: 'start', status: 'blocked_foreign_listener' }, 1);
    return;
  }
  if (await isPortListening(command.port)) {
    finish({ ok: false, action: 'start', status: 'blocked_foreign_listener' }, 1);
    return;
  }
  if (existing) {
    if (isProcessAlive(existing.pid)) {
      finish({ ok: false, action: 'start', status: 'blocked_live_stale_record' }, 1);
      return;
    }
    await removeRecord(recordPath);
  }

  const marker = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, buildServerArgs(command, marker), {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  let ownershipRecorded = false;
  try {
    const health = await waitForHealth(command.port, child);
    const safeHealth = health ? projectSafeHealth(health) : null;
    const issuanceMatches = safeHealth && issuanceMatchesCommand(command, safeHealth);
    const record = safeHealth ? createOwnershipRecord({
      pid: child.pid,
      port: command.port,
      workspaceId: createWorkspaceId(command.workspace),
      marker,
      entrySha256Prefix: createEntryIdentityPrefix(serverEntry),
      health: safeHealth,
    }) : null;
    const ownership = record && health ? verifyOwnedService(record, health, command.port) : { ok: false };
    if (!health || !record || !ownership.ok || !issuanceMatches) {
      finish({ ok: false, action: 'start', status: 'failed_start_verification' }, 1);
      return;
    }
    await writeRecord(recordPath, record);
    ownershipRecorded = true;
    finish(safeReceipt('start', 'started', safeHealth), 0);
  } finally {
    if (!ownershipRecorded) terminateProcess(child.pid);
  }
}

async function status(command, recordPath) {
  const record = await readRecord(recordPath);
  const health = await fetchHealth(command.port);
  if (!record) {
    const occupied = Boolean(health) || await isPortListening(command.port);
    finish({ ok: false, action: 'status', status: occupied ? 'blocked_foreign_listener' : 'not_running' }, occupied ? 1 : 0);
    return;
  }
  if (!health) {
    if (!isProcessAlive(record.pid)) {
      await removeRecord(recordPath);
      finish({ ok: true, action: 'status', status: 'stale_record_removed' }, 0);
      return;
    }
    finish({ ok: false, action: 'status', status: 'blocked_unverifiable_process' }, 1);
    return;
  }
  const verified = verifyOwnedService(record, health, command.port);
  if (!verified.ok) {
    finish({ ok: false, action: 'status', status: 'blocked_ownership_mismatch' }, 1);
    return;
  }
  finish(safeReceipt('status', 'running', verified.health), 0);
}

async function stop(command, recordPath) {
  const record = await readRecord(recordPath);
  if (!record) {
    finish({ ok: false, action: 'stop', status: 'blocked_no_ownership_record' }, 1);
    return;
  }
  const health = await fetchHealth(command.port);
  if (!health) {
    if (!isProcessAlive(record.pid)) {
      await removeRecord(recordPath);
      finish({ ok: true, action: 'stop', status: 'stale_record_removed_without_kill' }, 0);
      return;
    }
    finish({ ok: false, action: 'stop', status: 'blocked_unverifiable_process' }, 1);
    return;
  }
  const verified = verifyOwnedService(record, health, command.port);
  if (!verified.ok) {
    finish({ ok: false, action: 'stop', status: 'blocked_ownership_mismatch' }, 1);
    return;
  }
  process.kill(record.pid, 'SIGTERM');
  const stopped = await waitForStop(command.port, record.pid);
  if (!stopped) {
    finish({ ok: false, action: 'stop', status: 'failed_stop_timeout' }, 1);
    return;
  }
  await removeRecord(recordPath);
  finish({ ok: true, action: 'stop', status: 'stopped' }, 0);
}

async function fetchHealth(port, timeoutMs = 600) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForHealth(port, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) return null;
    const health = await fetchHealth(port);
    if (health) return health;
    await delay(100);
  }
  return null;
}

async function waitForStop(port, pid) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!isProcessAlive(pid) && !(await fetchHealth(port, 200))) return true;
    await delay(100);
  }
  return false;
}

async function readRecord(recordPath) {
  try {
    const stat = await fsp.stat(recordPath);
    if (!stat.isFile() || stat.size > 16_384) throw new Error('invalid record');
    return JSON.parse(await fsp.readFile(recordPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeRecord(recordPath, record) {
  await fsp.mkdir(path.dirname(recordPath), { recursive: true });
  const temporary = `${recordPath}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(temporary, recordPath);
}

async function removeRecord(recordPath) {
  await fsp.rm(recordPath, { force: true });
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminateProcess(pid) {
  if (!isProcessAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The child may exit between the liveness check and the signal.
  }
}

function issuanceMatchesCommand(command, health) {
  if (!command.issuance.enabled) {
    return !health.safePilotIssuanceRequested && !health.safePilotIssuanceEnabled;
  }
  return health.safePilotIssuanceRequested &&
    health.safePilotIssuanceEnabled &&
    health.safePilotIssuerPinning.ready &&
    health.safePilotIssuerPinning.taskSha256Prefix === command.issuance.pins.taskSha256.slice(0, 16) &&
    health.safePilotIssuerPinning.contextSha256Prefix === command.issuance.pins.contextSha256.slice(0, 16) &&
    health.safePilotIssuerPinning.profileSha256Prefix === command.issuance.pins.profileSha256.slice(0, 16);
}

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finish(receipt, exitCode) {
  writeSync(process.stdout.fd, `${JSON.stringify(receipt)}\n`);
  process.exitCode = exitCode;
}
