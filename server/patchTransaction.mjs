import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { normalizePatchProposal, parseUnifiedPatch, sha256Hex } from './serverLib.mjs';

const TRANSACTION_VERSION = '1.0.0';
const TRANSACTION_SUBDIR = '.agenthub-patch-transactions';
const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_POSTIMAGE_BYTES = 512 * 1024;

/** 在内存中确定性生成 postimage；任何上下文、行号或哈希不一致都会失败。 */
export function buildPatchedBuffer(file, sourceBuffer) {
  if (!Buffer.isBuffer(sourceBuffer)) throw new Error('patch source 必须是 Buffer');
  if (sourceBuffer.length > MAX_SOURCE_BYTES) throw new Error(`${file.path} 超过 256KB 原文件上限`);
  if (sha256Hex(sourceBuffer) !== file.beforeSha256) throw new Error(`${file.path} preimage SHA-256 不匹配`);
  const sourceText = sourceBuffer.toString('utf8');
  if (!Buffer.from(sourceText, 'utf8').equals(sourceBuffer)) throw new Error(`${file.path} 不是有效 UTF-8 文本`);
  const parsed = parseUnifiedPatch(file.patch, file.path);
  if (!parsed.ok) throw new Error(parsed.error);

  const source = splitSourceText(sourceText, file.path);
  const output = [];
  let cursor = 0;
  let finalNewline = source.finalNewline;

  for (let hunkIndex = 0; hunkIndex < parsed.hunks.length; hunkIndex += 1) {
    const hunk = parsed.hunks[hunkIndex];
    const oldTarget = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    const newTarget = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
    if (oldTarget < cursor || oldTarget > source.lines.length) throw new Error(`${file.path} hunk oldStart 越界或重叠`);
    output.push(...source.lines.slice(cursor, oldTarget));
    if (output.length !== newTarget) throw new Error(`${file.path} hunk newStart 与 postimage 位置不一致`);

    let sourceIndex = oldTarget;
    let lastProducedLine = null;
    for (const line of hunk.lines) {
      if (line.prefix === ' ') {
        if (source.lines[sourceIndex] !== line.content) throw new Error(`${file.path} hunk context 不匹配`);
        output.push(line.content);
        sourceIndex += 1;
        lastProducedLine = line;
      } else if (line.prefix === '-') {
        if (source.lines[sourceIndex] !== line.content) throw new Error(`${file.path} hunk removal 不匹配`);
        sourceIndex += 1;
      } else {
        output.push(line.content);
        lastProducedLine = line;
      }
    }
    cursor = sourceIndex;
    const isLastHunk = hunkIndex === parsed.hunks.length - 1;
    if (isLastHunk && cursor === source.lines.length) {
      finalNewline = lastProducedLine ? !lastProducedLine.noNewline : output.length > 0;
    }
  }

  if (cursor < source.lines.length) {
    output.push(...source.lines.slice(cursor));
    finalNewline = source.finalNewline;
  }
  const postText = `${output.join(source.newline)}${finalNewline && output.length ? source.newline : ''}`;
  const postBuffer = Buffer.from(postText, 'utf8');
  if (postBuffer.length > MAX_POSTIMAGE_BYTES) throw new Error(`${file.path} postimage 超过 512KB 上限`);
  if (sha256Hex(postBuffer) !== file.afterSha256) throw new Error(`${file.path} postimage SHA-256 不匹配`);
  return postBuffer;
}

/** 准备事务：读取全部 preimage、生成并 fsync 全部 next 文件，再落盘 prepared journal。 */
export async function preparePatchTransaction(workspaceRoot, proposal) {
  const normalized = normalizePatchProposal({ proposal });
  if (!normalized.ok) throw new Error(normalized.error);
  const realWorkspace = await resolveRealWorkspace(workspaceRoot);
  const preparedFiles = [];
  for (const file of normalized.proposal.files) {
    const targetPath = await resolveExistingSourceFile(realWorkspace, file.path);
    const stat = await fsp.lstat(targetPath);
    const sourceBuffer = await fsp.readFile(targetPath);
    preparedFiles.push({
      file,
      targetPath,
      mode: stat.mode,
      postBuffer: buildPatchedBuffer(file, sourceBuffer),
    });
  }

  const transactionRoot = await ensureTransactionRoot(realWorkspace);
  const transactionId = `txn-${normalized.proposalSha256.slice(0, 16)}-${randomBytes(6).toString('hex')}`;
  const transactionDir = path.join(transactionRoot, transactionId);
  await fsp.mkdir(transactionDir, { recursive: false });
  const entries = preparedFiles.map((item, index) => ({
    path: item.file.path,
    targetPath: item.targetPath,
    nextPath: path.join(transactionDir, `${String(index).padStart(2, '0')}.next`),
    backupPath: path.join(transactionDir, `${String(index).padStart(2, '0')}.backup`),
    beforeSha256: item.file.beforeSha256,
    afterSha256: item.file.afterSha256,
    mode: item.mode,
  }));
  const handle = {
    realWorkspace,
    transactionRoot,
    transactionDir,
    journalPath: path.join(transactionDir, 'journal.json'),
    journalTempPath: path.join(transactionDir, 'journal.tmp'),
    journal: {
      version: TRANSACTION_VERSION,
      transactionId,
      proposalId: normalized.proposal.proposalId,
      proposalSha256: normalized.proposalSha256,
      state: 'prepared',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: entries.map(journalEntry),
    },
    entries,
  };

  try {
    for (let index = 0; index < preparedFiles.length; index += 1) {
      await writeSyncedFile(entries[index].nextPath, preparedFiles[index].postBuffer, entries[index].mode);
    }
    await writeJournal(handle);
    return handle;
  } catch (error) {
    await cleanupKnownTransactionArtifacts(handle).catch(() => undefined);
    throw error;
  }
}

/** 提交事务；进程内错误会立即逆序回滚，committed 后只允许完成清理。 */
export async function commitPreparedPatchTransaction(handle, options = {}) {
  let committed = false;
  try {
    handle.journal.state = 'committing';
    await writeJournal(handle);
    for (const entry of handle.entries) await assertSafeExistingTarget(handle, entry, entry.beforeSha256);

    for (let index = 0; index < handle.entries.length; index += 1) {
      const entry = handle.entries[index];
      await callStepHook(options, 'before_backup', entry.path, index);
      await assertSafeExistingTarget(handle, entry, entry.beforeSha256);
      await fsp.rename(entry.targetPath, entry.backupPath);
      await callStepHook(options, 'after_backup', entry.path, index);
      await assertFileHash(entry.nextPath, entry.afterSha256, `${entry.path} next`);
      await assertSafeRecoveryTarget(handle, entry);
      await fsp.rename(entry.nextPath, entry.targetPath);
      await callStepHook(options, 'after_replace', entry.path, index);
    }

    for (const entry of handle.entries) await assertSafeExistingTarget(handle, entry, entry.afterSha256);
    handle.journal.state = 'committed';
    await writeJournal(handle);
    committed = true;
    await finalizeCommittedTransaction(handle);
    return transactionSummary(handle, 'applied');
  } catch (error) {
    const reason = error instanceof Error ? error.message : '事务提交失败';
    if (committed) throw new Error(`补丁已提交，但事务清理待恢复：${reason}`);
    try {
      await rollbackPreparedPatchTransaction(handle);
    } catch (rollbackError) {
      handle.journal.state = 'rollback_failed';
      await writeJournal(handle).catch(() => undefined);
      const rollbackReason = rollbackError instanceof Error ? rollbackError.message : '未知回滚错误';
      throw new Error(`补丁提交失败且回滚未完成：${reason}；${rollbackReason}`);
    }
    throw new Error(`补丁提交失败，已恢复全部 preimage：${reason}`);
  }
}

export async function applyPatchTransaction(workspaceRoot, proposal, options = {}) {
  const handle = await preparePatchTransaction(workspaceRoot, proposal);
  return commitPreparedPatchTransaction(handle, options);
}

/** 恢复未完成事务：committed 只清理，其余状态一律尝试恢复 preimage。 */
export async function recoverPatchTransactions(workspaceRoot) {
  const realWorkspace = await resolveRealWorkspace(workspaceRoot);
  const root = path.join(realWorkspace, 'ai-output', TRANSACTION_SUBDIR);
  if (!(await exists(root))) return [];
  const rootStat = await fsp.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('补丁事务目录非法');
  const records = [];
  for (const dirent of await fsp.readdir(root, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !/^txn-[a-f0-9-]{20,80}$/.test(dirent.name)) continue;
    const transactionDir = path.join(root, dirent.name);
    try {
      const handle = await loadTransactionHandle(realWorkspace, root, transactionDir);
      if (handle.journal.state === 'committed') {
        for (const entry of handle.entries) await assertSafeExistingTarget(handle, entry, entry.afterSha256);
        await finalizeCommittedTransaction(handle);
        records.push(transactionSummary(handle, 'committed_cleanup_completed'));
      } else {
        await rollbackPreparedPatchTransaction(handle);
        records.push(transactionSummary(handle, 'rolled_back'));
      }
    } catch (error) {
      records.push({
        transactionId: dirent.name,
        status: 'recovery_failed',
        error: error instanceof Error ? error.message : '未知恢复错误',
      });
    }
  }
  return records;
}

export async function rollbackPreparedPatchTransaction(handle) {
  for (const entry of [...handle.entries].reverse()) {
    await assertSafeRecoveryTarget(handle, entry);
    const backupExists = await exists(entry.backupPath);
    const targetExists = await exists(entry.targetPath);
    if (backupExists) {
      await assertFileHash(entry.backupPath, entry.beforeSha256, `${entry.path} backup`);
      if (targetExists) {
        const targetHash = sha256Hex(await fsp.readFile(entry.targetPath));
        if (targetHash === entry.afterSha256) {
          await fsp.unlink(entry.targetPath);
          await fsp.rename(entry.backupPath, entry.targetPath);
        } else if (targetHash === entry.beforeSha256) {
          await fsp.unlink(entry.backupPath);
        } else {
          throw new Error(`${entry.path} 当前内容不属于事务，拒绝覆盖`);
        }
      } else {
        await fsp.rename(entry.backupPath, entry.targetPath);
      }
    } else {
      if (!targetExists) throw new Error(`${entry.path} 与 backup 同时缺失`);
      await assertFileHash(entry.targetPath, entry.beforeSha256, entry.path);
    }
    await unlinkIfExists(entry.nextPath);
  }
  for (const entry of handle.entries) await assertSafeExistingTarget(handle, entry, entry.beforeSha256);
  handle.journal.state = 'rolled_back';
  await cleanupKnownTransactionArtifacts(handle);
  return transactionSummary(handle, 'rolled_back');
}

function splitSourceText(value, filePath) {
  const hasCrLf = value.includes('\r\n');
  const remainder = value.replaceAll('\r\n', '');
  if (remainder.includes('\r') || (hasCrLf && remainder.includes('\n'))) {
    throw new Error(`${filePath} 使用混合或不支持的换行格式`);
  }
  const newline = hasCrLf ? '\r\n' : '\n';
  const normalized = hasCrLf ? value.replaceAll('\r\n', '\n') : value;
  const finalNewline = normalized.endsWith('\n');
  const body = finalNewline ? normalized.slice(0, -1) : normalized;
  return { newline, finalNewline, lines: normalized === '' ? [] : body.split('\n') };
}

async function resolveRealWorkspace(workspaceRoot) {
  const absolute = path.resolve(workspaceRoot);
  const stat = await fsp.lstat(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('工作区必须是真实目录');
  return fsp.realpath(absolute);
}

async function resolveExistingSourceFile(realWorkspace, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error(`${relativePath} 不是安全相对路径`);
  let cursor = realWorkspace;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const stat = await fsp.lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${relativePath} 路径含符号链接或目录联接`);
    if (index < segments.length - 1 && !stat.isDirectory()) throw new Error(`${relativePath} 父路径不是目录`);
    if (index === segments.length - 1 && !stat.isFile()) throw new Error(`${relativePath} 不是普通文件`);
  }
  const realTarget = await fsp.realpath(cursor);
  const relation = path.relative(realWorkspace, realTarget);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) throw new Error(`${relativePath} 越出工作区`);
  return realTarget;
}

async function resolveRecoveryTarget(realWorkspace, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error(`${relativePath} 不是安全恢复路径`);
  const candidate = path.resolve(realWorkspace, ...relativePath.split('/'));
  const relation = path.relative(realWorkspace, candidate);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) throw new Error(`${relativePath} 越出工作区`);
  let cursor = realWorkspace;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = path.join(cursor, segments[index]);
    const stat = await fsp.lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${relativePath} 恢复父路径非法`);
  }
  const realParent = await fsp.realpath(path.dirname(candidate));
  const parentRelation = path.relative(realWorkspace, realParent);
  if (parentRelation.startsWith('..') || path.isAbsolute(parentRelation)) throw new Error(`${relativePath} 恢复父路径越界`);
  if (await exists(candidate)) {
    const stat = await fsp.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${relativePath} 恢复目标不是普通文件`);
  }
  return candidate;
}

function isSafeRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 240 &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    !value.split('/').includes('..')
  );
}

async function ensureTransactionRoot(realWorkspace) {
  const outputRoot = path.join(realWorkspace, 'ai-output');
  await ensureRealDirectory(outputRoot);
  const transactionRoot = path.join(outputRoot, TRANSACTION_SUBDIR);
  await ensureRealDirectory(transactionRoot);
  const realRoot = await fsp.realpath(transactionRoot);
  const relation = path.relative(realWorkspace, realRoot);
  if (relation.startsWith('..') || path.isAbsolute(relation)) throw new Error('事务目录越出工作区');
  return realRoot;
}

async function ensureRealDirectory(directory) {
  if (!(await exists(directory))) await fsp.mkdir(directory, { recursive: false });
  const stat = await fsp.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${directory} 必须是真实目录`);
}

async function writeSyncedFile(target, content, mode) {
  const handle = await fsp.open(target, 'wx', mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJournal(handle) {
  handle.journal.updatedAt = new Date().toISOString();
  const content = Buffer.from(`${JSON.stringify(handle.journal, null, 2)}\n`, 'utf8');
  await unlinkIfExists(handle.journalTempPath);
  await writeSyncedFile(handle.journalTempPath, content, 0o600);
  await fsp.rename(handle.journalTempPath, handle.journalPath);
}

async function loadTransactionHandle(realWorkspace, transactionRoot, transactionDir) {
  const transactionStat = await fsp.lstat(transactionDir);
  if (!transactionStat.isDirectory() || transactionStat.isSymbolicLink()) throw new Error('事务实例目录非法');
  const realTransactionDir = await fsp.realpath(transactionDir);
  const transactionRelation = path.relative(transactionRoot, realTransactionDir);
  if (!transactionRelation || transactionRelation.startsWith('..') || path.isAbsolute(transactionRelation)) {
    throw new Error('事务实例目录越界');
  }
  const journalPath = path.join(transactionDir, 'journal.json');
  const journal = JSON.parse(await fsp.readFile(journalPath, 'utf8'));
  if (
    journal?.version !== TRANSACTION_VERSION ||
    journal.transactionId !== path.basename(transactionDir) ||
    !['prepared', 'committing', 'committed', 'rollback_failed'].includes(journal.state) ||
    !Array.isArray(journal.entries) ||
    journal.entries.length < 1 ||
    journal.entries.length > 8
  ) {
    throw new Error('事务 journal 结构非法');
  }
  const entries = await Promise.all(journal.entries.map(async (entry, index) => {
    if (
      entry?.path === undefined ||
      !/^[a-f0-9]{64}$/.test(entry.beforeSha256) ||
      !/^[a-f0-9]{64}$/.test(entry.afterSha256) ||
      entry.nextName !== `${String(index).padStart(2, '0')}.next` ||
      entry.backupName !== `${String(index).padStart(2, '0')}.backup`
    ) {
      throw new Error('事务 journal entry 非法');
    }
    return {
      path: entry.path,
      targetPath: await resolveRecoveryTarget(realWorkspace, entry.path),
      nextPath: path.join(transactionDir, entry.nextName),
      backupPath: path.join(transactionDir, entry.backupName),
      beforeSha256: entry.beforeSha256,
      afterSha256: entry.afterSha256,
      mode: entry.mode,
    };
  }));
  return {
    realWorkspace,
    transactionRoot,
    transactionDir,
    journalPath,
    journalTempPath: path.join(transactionDir, 'journal.tmp'),
    journal,
    entries,
  };
}

function journalEntry(entry, index) {
  return {
    path: entry.path,
    beforeSha256: entry.beforeSha256,
    afterSha256: entry.afterSha256,
    nextName: `${String(index).padStart(2, '0')}.next`,
    backupName: `${String(index).padStart(2, '0')}.backup`,
    mode: entry.mode,
  };
}

async function finalizeCommittedTransaction(handle) {
  for (const entry of handle.entries) {
    await unlinkIfExists(entry.nextPath);
    await unlinkIfExists(entry.backupPath);
  }
  await cleanupKnownTransactionArtifacts(handle);
}

async function cleanupKnownTransactionArtifacts(handle) {
  const allowed = new Set(['journal.json', 'journal.tmp']);
  handle.entries.forEach((entry) => {
    allowed.add(path.basename(entry.nextPath));
    allowed.add(path.basename(entry.backupPath));
  });
  if (!(await exists(handle.transactionDir))) return;
  const actual = await fsp.readdir(handle.transactionDir);
  const unknown = actual.filter((name) => !allowed.has(name));
  if (unknown.length) throw new Error(`事务目录含未知文件：${unknown.join(', ')}`);
  for (const name of actual) await unlinkIfExists(path.join(handle.transactionDir, name));
  await fsp.rmdir(handle.transactionDir);
}

async function assertFileHash(filePath, expectedHash, label) {
  const stat = await fsp.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} 不是普通文件`);
  const actual = sha256Hex(await fsp.readFile(filePath));
  if (actual !== expectedHash) throw new Error(`${label} SHA-256 不匹配`);
}

async function assertSafeExistingTarget(handle, entry, expectedHash) {
  const resolved = await resolveExistingSourceFile(handle.realWorkspace, entry.path);
  if (path.normalize(resolved) !== path.normalize(entry.targetPath)) throw new Error(`${entry.path} 真实路径已变化`);
  await assertFileHash(entry.targetPath, expectedHash, entry.path);
}

async function assertSafeRecoveryTarget(handle, entry) {
  const resolved = await resolveRecoveryTarget(handle.realWorkspace, entry.path);
  if (path.normalize(resolved) !== path.normalize(entry.targetPath)) throw new Error(`${entry.path} 恢复路径已变化`);
}

async function callStepHook(options, phase, filePath, index) {
  if (typeof options.onStep === 'function') await options.onStep({ phase, path: filePath, index });
}

async function unlinkIfExists(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

async function exists(filePath) {
  try {
    await fsp.lstat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function transactionSummary(handle, status) {
  return {
    transactionId: handle.journal.transactionId,
    proposalId: handle.journal.proposalId,
    proposalSha256: handle.journal.proposalSha256,
    status,
    files: handle.entries.map((entry) => ({
      path: entry.path,
      beforeSha256: entry.beforeSha256,
      afterSha256: entry.afterSha256,
    })),
  };
}
