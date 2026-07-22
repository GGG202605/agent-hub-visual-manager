/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  AGENTHUB_DEFAULT_PORT,
  buildServerArgs,
  createEntryIdentityPrefix,
  createOperatorMarkerPrefix,
  createOwnershipRecord,
  createWorkspaceId,
  parseAgentHubLocalArgs,
  projectSafeHealth,
  verifyOwnedService,
} from '../../../scripts/agenthubLocalLib.mjs';

const marker = '1'.repeat(64);
const taskSha256 = 'a'.repeat(64);
const contextSha256 = 'b'.repeat(64);
const profileSha256 = 'c'.repeat(64);
const workspace = path.resolve('synthetic-workspace');
const serverEntry = path.resolve('server/server.mjs');

function approvedStartArgs() {
  return [
    'start',
    '--workspace',
    workspace,
    '--port',
    '43210',
    '--enable-safe-pilot-issuance',
    '--task-sha256',
    taskSha256,
    '--context-sha256',
    contextSha256,
    '--profile-sha256',
    profileSha256,
  ];
}

describe('AgentHub local operator argument boundary', () => {
  it('starts default-off and validates the bounded port', () => {
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace])).toMatchObject({
      ok: true,
      command: {
        action: 'start',
        port: AGENTHUB_DEFAULT_PORT,
        workspace,
        issuance: { enabled: false, pins: { taskSha256: '', contextSha256: '', profileSha256: '' } },
      },
    });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--port', '0'])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--port', '65536'])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--port', '2.5'])).toMatchObject({ ok: false });
  });

  it('fails closed on incomplete, unflagged, duplicate or unknown launch parameters', () => {
    expect(parseAgentHubLocalArgs(['start'])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs([
      'start', '--workspace', workspace, '--enable-safe-pilot-issuance', '--task-sha256', taskSha256,
    ])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--task-sha256', taskSha256])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--workspace', workspace])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['start', '--workspace', workspace, '--unsafe'])).toMatchObject({ ok: false });
  });

  it('accepts all three exact pins only with the explicit issuance flag', () => {
    const parsed = parseAgentHubLocalArgs(approvedStartArgs());
    expect(parsed).toMatchObject({
      ok: true,
      command: {
        action: 'start',
        port: 43210,
        issuance: { enabled: true, pins: { taskSha256, contextSha256, profileSha256 } },
      },
    });
    if (!parsed.ok) throw new Error('expected valid start arguments');
    const serverArgs = buildServerArgs(parsed.command, marker);
    expect(serverArgs).toContain('--enable-safe-pilot-issuance');
    expect(serverArgs).toEqual(expect.arrayContaining([taskSha256, contextSha256, profileSha256]));
  });

  it('restricts status and stop to an optional bounded port', () => {
    expect(parseAgentHubLocalArgs(['status'])).toMatchObject({ ok: true, command: { action: 'status', port: 8787 } });
    expect(parseAgentHubLocalArgs(['stop', '--port', '43210'])).toMatchObject({ ok: true, command: { action: 'stop', port: 43210 } });
    expect(parseAgentHubLocalArgs(['status', '--workspace', workspace])).toMatchObject({ ok: false });
    expect(parseAgentHubLocalArgs(['stop', '--enable-safe-pilot-issuance'])).toMatchObject({ ok: false });
  });
});

describe('AgentHub local operator ownership and redaction', () => {
  const workspaceId = createWorkspaceId(workspace);
  const markerSha256Prefix = createOperatorMarkerPrefix(marker);
  const entrySha256Prefix = createEntryIdentityPrefix(serverEntry);
  const rawHealth = {
    ok: true,
    version: '1.8.0',
    workspaceId,
    workspace,
    agentHub: path.join(workspace, '.agent-hub'),
    receipts: 2,
    sessionToken: 'must-not-escape',
    rawTask: 'must-not-escape',
    safePilotIssuanceRequested: false,
    safePilotIssuanceEnabled: false,
    safePilotIssuerPinning: {
      ready: false,
      taskSha256Prefix: taskSha256.slice(0, 16),
      contextSha256Prefix: contextSha256.slice(0, 16),
      profileSha256Prefix: profileSha256.slice(0, 16),
      blockers: ['synthetic blocker'],
      taskSha256,
    },
    operator: { managed: true, processId: 1234, markerSha256Prefix, entrySha256Prefix, marker },
  };

  it('projects only explicitly allowed health fields', () => {
    const projected = projectSafeHealth(rawHealth);
    expect(projected).toMatchObject({
      ok: true,
      version: '1.8.0',
      workspaceId,
      receipts: 2,
      operator: { managed: true, processId: 1234, markerSha256Prefix, entrySha256Prefix },
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(workspace);
    expect(serialized).not.toContain('must-not-escape');
    expect(serialized).not.toContain(taskSha256);
    expect(serialized).not.toContain(marker);
  });

  it('binds the record to pid, workspace, marker and server entry', () => {
    const safeHealth = projectSafeHealth(rawHealth);
    const record = createOwnershipRecord({
      pid: 1234,
      port: 43210,
      workspaceId,
      marker,
      entrySha256Prefix,
      health: safeHealth,
    });
    expect(verifyOwnedService(record, rawHealth, 43210)).toMatchObject({ ok: true });
    expect(verifyOwnedService({ ...record, pid: 1235 }, rawHealth, 43210)).toMatchObject({ ok: false });
    expect(verifyOwnedService({ ...record, operatorMarker: '2'.repeat(64) }, rawHealth, 43210)).toMatchObject({ ok: false });
    expect(verifyOwnedService(record, rawHealth, 43211)).toMatchObject({ ok: false });
    expect(verifyOwnedService(record, { ...rawHealth, workspaceId: 'd'.repeat(24) }, 43210)).toMatchObject({ ok: false });
    expect(verifyOwnedService(record, { ...rawHealth, operator: { ...rawHealth.operator, managed: false } }, 43210)).toMatchObject({ ok: false });
  });

  it('keeps runtime records free of full paths, launch pins and server secrets', () => {
    const record = createOwnershipRecord({
      pid: 1234,
      port: 43210,
      workspaceId,
      marker,
      entrySha256Prefix,
      health: projectSafeHealth(rawHealth),
    });
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(workspace);
    expect(serialized).not.toContain(taskSha256);
    expect(serialized).not.toContain(contextSha256);
    expect(serialized).not.toContain(profileSha256);
    expect(serialized).not.toContain('must-not-escape');
  });
});
