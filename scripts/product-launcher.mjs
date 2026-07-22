import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspaceId } from './agenthubLocalLib.mjs';
import {
  assertBuildFingerprintStable,
  buildBrowserOpenCommand,
  buildNpmInvocation,
  parseOperatorReceipt,
  parseProductLauncherArgs,
  readBuildFreshness,
  writeBuildStamp,
} from './productLauncherLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const operatorEntry = path.join(repoRoot, 'scripts', 'agenthub-local.mjs');
const parsed = parseProductLauncherArgs(process.argv.slice(2), repoRoot);

if (!parsed.ok) finish({ ok: false, action: 'parse', status: 'failed_invalid_arguments', error: parsed.error }, 2);
else {
  try {
    await execute(parsed.command);
  } catch (error) {
    finish({
      ok: false,
      action: parsed.command.action,
      status: 'failed_product_launcher',
      error: safeError(error),
    }, 1);
  }
}

async function execute(command) {
  if (command.action === 'status') {
    const receipt = await runOperator(['status', '--port', String(command.port)]);
    finish(receipt, receipt.ok ? 0 : 1);
    return;
  }
  if (command.action === 'stop') {
    const status = await runOperator(['status', '--port', String(command.port)]);
    if (status.status === 'not_running' || status.status === 'stale_record_removed') {
      finish({ ok: true, action: 'stop', status: 'already_stopped' }, 0);
      return;
    }
    if (!status.ok || status.status !== 'running') {
      finish({ ...status, action: 'stop' }, 1);
      return;
    }
    const receipt = await runOperator(['stop', '--port', String(command.port)]);
    finish(receipt, receipt.ok ? 0 : 1);
    return;
  }

  await validateWorkspace(command.workspace);
  const status = await runOperator(['status', '--port', String(command.port)]);
  if (status.status === 'running') {
    if (status.service?.workspaceId !== createWorkspaceId(command.workspace)) {
      finish({ ok: false, action: 'start', status: 'blocked_workspace_mismatch' }, 1);
      return;
    }
  } else if (status.status !== 'not_running' && status.status !== 'stale_record_removed') {
    finish({ ...status, action: 'start' }, 1);
    return;
  }
  const dependencies = await ensureDependencies();
  const before = await readBuildFreshness(repoRoot);
  let build = 'current';
  if (!before.current) {
    await runNpm('build');
    const after = await readBuildFreshness(repoRoot);
    await writeBuildStamp(repoRoot, assertBuildFingerprintStable(before.fingerprint, after.fingerprint));
    build = 'rebuilt';
  }

  const receipt = await runOperator([
    'start',
    '--workspace', command.workspace,
    '--port', String(command.port),
  ]);
  if (!receipt.ok) {
    finish(receipt, 1);
    return;
  }

  let browser = 'skipped';
  if (command.openBrowser) {
    const url = `http://127.0.0.1:${command.port}`;
    const launch = buildBrowserOpenCommand(process.platform, url);
    await launchDetached(launch.executable, launch.args);
    browser = 'opened';
  }
  finish({ ...receipt, build, dependencies, browser }, 0);
}

async function validateWorkspace(workspace) {
  const requested = path.resolve(workspace);
  let requestedStat;
  try {
    requestedStat = await fsp.lstat(requested);
  } catch {
    throw new Error('产品工作区不存在或无法解析');
  }
  if (!requestedStat.isDirectory() || requestedStat.isSymbolicLink()) {
    throw new Error('产品工作区不得是文件或符号链接/目录联接');
  }
  let root;
  try {
    root = await fsp.realpath(requested);
  } catch {
    throw new Error('产品工作区不存在或无法解析');
  }
  const rootStat = await fsp.lstat(root);
  const hub = path.join(root, '.agent-hub');
  let hubStat;
  try {
    hubStat = await fsp.lstat(hub);
  } catch {
    throw new Error('产品工作区缺少 .agent-hub 目录');
  }
  if (!rootStat.isDirectory() || !hubStat.isDirectory() || hubStat.isSymbolicLink()) {
    throw new Error('产品工作区或 .agent-hub 类型不安全');
  }
}

async function ensureDependencies() {
  try {
    const stat = await fsp.stat(path.join(repoRoot, 'node_modules'));
    if (stat.isDirectory()) return 'current';
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await runNpm('install');
  return 'installed';
}

async function runNpm(action) {
  const invocation = buildNpmInvocation(process.platform, process.env.ComSpec || '', action);
  await runFixed(invocation.executable, invocation.args);
}

async function runFixed(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repoRoot,
      stdio: ['ignore', process.stderr, process.stderr],
      windowsHide: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`固定命令失败：${path.basename(executable)} ${args.slice(0, 2).join(' ')}`));
    });
  });
}

async function runOperator(args) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [operatorEntry, ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('本地服务操作超时'));
    }, 30_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
  const receipt = parseOperatorReceipt(result.stdout);
  if (result.code !== 0 && receipt.ok) throw new Error('本地服务退出码与回执不一致');
  return receipt;
}

async function launchDetached(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function safeError(error) {
  const message = error instanceof Error ? error.message : '未知错误';
  return message.replaceAll(repoRoot, '<agenthub-root>');
}

function finish(payload, code) {
  writeSync(process.stdout.fd, `${JSON.stringify(payload)}\n`);
  process.exitCode = code;
}
