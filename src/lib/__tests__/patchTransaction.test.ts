/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  applyPatchTransaction,
  buildPatchedBuffer,
  preparePatchTransaction,
  recoverPatchTransactions,
} from '../../../server/patchTransaction.mjs';

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })));
});

describe('patch transaction design', () => {
  it('builds a deterministic postimage and rejects a mismatched after hash', () => {
    const source = 'alpha\nbeta\n';
    const after = 'alpha\nBETA\n';
    const file = proposalFile(
      'src/example.ts',
      source,
      after,
      '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+BETA\n',
      1,
      1,
    );
    expect(buildPatchedBuffer(file, Buffer.from(source))).toEqual(Buffer.from(after));
    expect(() => buildPatchedBuffer({ ...file, afterSha256: 'f'.repeat(64) }, Buffer.from(source))).toThrow(
      'postimage SHA-256 不匹配',
    );
  });

  it('commits two prepared files and removes all transaction artifacts', async () => {
    const workspace = await createWorkspace();
    const first = { path: 'src/example.ts', before: 'alpha\nbeta\n', after: 'alpha\nBETA\n' };
    const second = { path: 'docs/example.md', before: 'one\ntwo\nthree\n', after: 'zero\none\ntwo\nTHREE\n' };
    await seedFile(workspace, first.path, first.before);
    await seedFile(workspace, second.path, second.before);
    const proposal = createProposal([
      proposalFile(
        first.path,
        first.before,
        first.after,
        '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+BETA\n',
        1,
        1,
      ),
      proposalFile(
        second.path,
        second.before,
        second.after,
        '--- a/docs/example.md\n+++ b/docs/example.md\n@@ -1,2 +1,3 @@\n+zero\n one\n two\n@@ -3 +4 @@\n-three\n+THREE\n',
        2,
        1,
      ),
    ]);

    const result = await applyPatchTransaction(workspace, proposal);
    expect(result).toMatchObject({ status: 'applied', files: [{ path: first.path }, { path: second.path }] });
    expect(await readFile(path.join(workspace, first.path), 'utf8')).toBe(first.after);
    expect(await readFile(path.join(workspace, second.path), 'utf8')).toBe(second.after);
    expect(await transactionDirectories(workspace)).toEqual([]);
  });

  it('rolls back every file when a later commit step fails', async () => {
    const workspace = await createWorkspace();
    const first = { path: 'src/first.ts', before: 'first = 1\n', after: 'first = 2\n' };
    const second = { path: 'src/second.ts', before: 'second = 1\n', after: 'second = 2\n' };
    await seedFile(workspace, first.path, first.before);
    await seedFile(workspace, second.path, second.before);
    const proposal = createProposal([
      proposalFile(
        first.path,
        first.before,
        first.after,
        '--- a/src/first.ts\n+++ b/src/first.ts\n@@ -1 +1 @@\n-first = 1\n+first = 2\n',
        1,
        1,
      ),
      proposalFile(
        second.path,
        second.before,
        second.after,
        '--- a/src/second.ts\n+++ b/src/second.ts\n@@ -1 +1 @@\n-second = 1\n+second = 2\n',
        1,
        1,
      ),
    ]);

    await expect(
      applyPatchTransaction(workspace, proposal, {
        onStep(step) {
          if (step.phase === 'after_replace' && step.index === 0) throw new Error('synthetic commit failure');
        },
      }),
    ).rejects.toThrow('已恢复全部 preimage');
    expect(await readFile(path.join(workspace, first.path), 'utf8')).toBe(first.before);
    expect(await readFile(path.join(workspace, second.path), 'utf8')).toBe(second.before);
    expect(await transactionDirectories(workspace)).toEqual([]);
  });

  it('recovers an interrupted prepared transaction from its durable journal', async () => {
    const workspace = await createWorkspace();
    const file = { path: 'src/recover.ts', before: 'value = 1\n', after: 'value = 2\n' };
    await seedFile(workspace, file.path, file.before);
    const proposal = createProposal([
      proposalFile(
        file.path,
        file.before,
        file.after,
        '--- a/src/recover.ts\n+++ b/src/recover.ts\n@@ -1 +1 @@\n-value = 1\n+value = 2\n',
        1,
        1,
      ),
    ]);
    const handle = await preparePatchTransaction(workspace, proposal);
    const entry = handle.entries[0];
    await rename(entry.targetPath, entry.backupPath);
    await rename(entry.nextPath, entry.targetPath);

    const recovered = await recoverPatchTransactions(workspace);
    expect(recovered).toMatchObject([{ transactionId: handle.journal.transactionId, status: 'rolled_back' }]);
    expect(await readFile(path.join(workspace, file.path), 'utf8')).toBe(file.before);
    expect(await transactionDirectories(workspace)).toEqual([]);
  });
});

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'agenthub-patch-transaction-'));
  workspaces.push(workspace);
  await mkdir(path.join(workspace, '.agent-hub'), { recursive: true });
  return workspace;
}

async function seedFile(workspace: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(workspace, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

function createProposal(files: ReturnType<typeof proposalFile>[]) {
  return {
    version: '1.0.0',
    proposalId: `proposal-${Math.random().toString(16).slice(2)}`,
    runId: 'run-patch-transaction',
    agentId: 'AG-DEV',
    title: 'Synthetic transaction proposal',
    createdAt: '2099-01-01T00:00:00.000Z',
    files,
  };
}

function proposalFile(
  filePath: string,
  before: string,
  after: string,
  patch: string,
  addedLines: number,
  removedLines: number,
) {
  return {
    path: filePath,
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
    addedLines,
    removedLines,
    patch,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function transactionDirectories(workspace: string): Promise<string[]> {
  const root = path.join(workspace, 'ai-output', '.agenthub-patch-transactions');
  return readdir(root).catch(() => []);
}
