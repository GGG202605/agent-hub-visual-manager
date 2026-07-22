import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const AGENTHUB_BUILD_STAMP = path.join('dist', '.agenthub-build-input.sha256');
export const AGENTHUB_PRODUCT_PORT = 8794;
const BUILD_INPUTS = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'src',
  'public',
];

export function parseProductLauncherArgs(argv, repoRoot) {
  const source = Array.isArray(argv) ? argv : [];
  const action = source[0];
  if (!['start', 'status', 'stop'].includes(action)) return fail('命令必须为 start、status 或 stop');
  const values = new Map();
  let noOpen = false;
  for (let index = 1; index < source.length; index += 1) {
    const token = source[index];
    if (!['--workspace', '--port', '--no-open'].includes(token)) return fail('存在未允许的产品启动参数');
    if (token === '--no-open') {
      if (noOpen) return fail('产品启动参数不得重复');
      noOpen = true;
      continue;
    }
    if (values.has(token)) return fail('产品启动参数不得重复');
    const value = source[index + 1];
    if (!value || value.startsWith('--')) return fail('产品启动参数缺少值');
    values.set(token, value);
    index += 1;
  }
  if (action !== 'start' && (values.has('--workspace') || noOpen)) {
    return fail('status/stop 只允许指定端口');
  }
  const port = Number(values.get('--port') ?? AGENTHUB_PRODUCT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return fail('端口必须为 1-65535 的整数');
  return {
    ok: true,
    command: {
      action,
      port,
      workspace: action === 'start'
        ? path.resolve(values.get('--workspace') ?? repoRoot)
        : '',
      openBrowser: action === 'start' && !noOpen,
    },
  };
}

export async function createBuildFingerprint(repoRoot) {
  const root = path.resolve(repoRoot);
  const files = [];
  for (const relative of BUILD_INPUTS) await collectInputFiles(root, relative, files);
  files.sort((left, right) => left.localeCompare(right, 'en'));
  const hash = createHash('sha256');
  for (const relative of files) {
    hash.update(relative.replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(await fsp.readFile(path.join(root, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function readBuildFreshness(repoRoot) {
  const root = path.resolve(repoRoot);
  const fingerprint = await createBuildFingerprint(root);
  const recorded = await readRecordedFingerprint(path.join(root, AGENTHUB_BUILD_STAMP));
  const builtIndex = path.join(root, 'dist', 'index.html');
  const built = await isRegularFile(builtIndex);
  return { current: built && recorded === fingerprint, fingerprint, recorded };
}

export async function writeBuildStamp(repoRoot, fingerprint) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('构建输入指纹非法');
  const root = path.resolve(repoRoot);
  const dist = path.join(root, 'dist');
  await fsp.mkdir(dist, { recursive: true });
  await fsp.writeFile(path.join(root, AGENTHUB_BUILD_STAMP), `${fingerprint}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function assertBuildFingerprintStable(before, after) {
  if (!/^[a-f0-9]{64}$/.test(before) || !/^[a-f0-9]{64}$/.test(after)) {
    throw new Error('构建输入指纹非法');
  }
  if (before !== after) throw new Error('构建期间输入发生变化；未写入新鲜度标记，请重新启动');
  return before;
}

export function parseOperatorReceipt(stdout) {
  const source = typeof stdout === 'string' ? stdout.trim() : '';
  if (!source) throw new Error('本地服务未返回回执');
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid receipt');
    return parsed;
  } catch {
    throw new Error('本地服务回执不是合法 JSON');
  }
}

export function buildBrowserOpenCommand(platform, url) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('产品启动器只允许打开本机 HTTP 页面');
  }
  if (platform === 'win32') {
    return { executable: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', target.href.replace(/\/$/, '')] };
  }
  if (platform === 'darwin') return { executable: 'open', args: [target.href.replace(/\/$/, '')] };
  return { executable: 'xdg-open', args: [target.href.replace(/\/$/, '')] };
}

export function buildNpmInvocation(platform, comSpec, action) {
  const fixedArgs = action === 'build'
    ? ['run', 'build']
    : action === 'install'
      ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
      : null;
  if (!fixedArgs) throw new Error('固定 npm 动作非法');
  if (platform === 'win32') {
    return {
      executable: comSpec || 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', `npm.cmd ${fixedArgs.join(' ')}`],
    };
  }
  return { executable: 'npm', args: fixedArgs };
}

async function collectInputFiles(root, relative, files) {
  const target = path.join(root, relative);
  let stat;
  try {
    stat = await fsp.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`产品构建输入缺失：${relative}`);
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`产品构建输入不得是符号链接：${relative}`);
  if (stat.isFile()) {
    files.push(relative);
    return;
  }
  if (!stat.isDirectory()) throw new Error(`产品构建输入类型不受支持：${relative}`);
  const entries = await fsp.readdir(target, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) await collectInputFiles(root, path.join(relative, entry.name), files);
}

async function readRecordedFingerprint(stamp) {
  try {
    const stat = await fsp.lstat(stamp);
    if (!stat.isFile() || stat.isSymbolicLink()) return '';
    const value = (await fsp.readFile(stamp, 'utf8')).trim();
    return /^[a-f0-9]{64}$/.test(value) ? value : '';
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function isRegularFile(target) {
  try {
    const stat = await fsp.lstat(target);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function fail(error) {
  return { ok: false, error };
}
