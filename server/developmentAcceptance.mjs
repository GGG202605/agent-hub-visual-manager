import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const NODE_ACCEPTANCE_SCRIPTS = Object.freeze([
  'preview',
  'dev',
  'start',
]);
const PYTHON_ACCEPTANCE_SCRIPTS = Object.freeze([
  'python-fastapi',
  'python-flask',
  'python-static',
]);
export const DEVELOPMENT_ACCEPTANCE_SCRIPTS = Object.freeze([
  ...NODE_ACCEPTANCE_SCRIPTS,
  ...PYTHON_ACCEPTANCE_SCRIPTS,
]);
const SAFE_ACCEPTANCE_SCRIPT_SET = new Set(DEVELOPMENT_ACCEPTANCE_SCRIPTS);
const NODE_ACCEPTANCE_SCRIPT_SET = new Set(NODE_ACCEPTANCE_SCRIPTS);
const SAFE_KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'Space']);
const MAX_ACTIONS = 12;
const ACCEPTANCE_PLAN_KEYS = Object.freeze(['scriptId', 'route', 'waitAfterLoadMs', 'actions']);
const MAX_SERVICE_OUTPUT_BYTES = 256 * 1024;
const VIEWPORTS = Object.freeze([
  Object.freeze({ id: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ id: 'mobile', width: 390, height: 844 }),
]);

export function chooseDevelopmentAcceptanceScript(availableScripts) {
  const available = new Set(Array.isArray(availableScripts) ? availableScripts : []);
  return DEVELOPMENT_ACCEPTANCE_SCRIPTS.find((script) => available.has(script)) ?? null;
}

export function isDevelopmentAcceptanceScript(value) {
  return typeof value === 'string' && SAFE_ACCEPTANCE_SCRIPT_SET.has(value);
}

export function isLoopbackAcceptanceUrl(value) {
  try {
    const url = new URL(String(value));
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'http:'
      && Boolean(url.port)
      && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1')
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function isDevelopmentAcceptanceRequestAllowed(value, targetValue) {
  try {
    const request = new URL(String(value));
    const target = new URL(String(targetValue));
    if (request.protocol === 'data:' || request.protocol === 'about:') return true;
    if (request.protocol === 'blob:') return request.origin === target.origin;
    return (request.protocol === 'http:' || request.protocol === 'https:') && request.origin === target.origin;
  } catch {
    return false;
  }
}

export function formatDevelopmentBrowserDiagnostic(messageValue, sourceUrlValue, targetUrlValue) {
  const message = boundedTail(String(messageValue || 'browser diagnostic').replace(/[\u0000-\u001f\u007f]/g, ' '), 400);
  const sourcePath = sameOriginBrowserPath(sourceUrlValue, targetUrlValue);
  return boundedTail(sourcePath ? `${message} @ ${sourcePath}` : message, 500);
}

export function normalizeDevelopmentAcceptancePlan(value, availableScripts) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, '浏览器验收计划必须是对象');
  assertExactObjectKeys(value, ACCEPTANCE_PLAN_KEYS, '浏览器验收计划');
  const available = [...new Set((Array.isArray(availableScripts) ? availableScripts : [])
    .filter((item) => SAFE_ACCEPTANCE_SCRIPT_SET.has(item)))];
  const requestedScript = typeof value.scriptId === 'string' ? value.scriptId : '';
  if (!SAFE_ACCEPTANCE_SCRIPT_SET.has(requestedScript) || !available.includes(requestedScript)) {
    throw httpError(400, '浏览器验收 scriptId 不在当前固定入口清单');
  }
  const scriptId = requestedScript;

  const route = typeof value.route === 'string' ? value.route.trim() : '/';
  if (!route || route.length > 500 || !route.startsWith('/') || route.startsWith('//') || /[\u0000-\u001f]/.test(route)) {
    throw httpError(400, '浏览器验收 route 必须是同源绝对路径');
  }
  const routeProbe = new URL(route, 'http://127.0.0.1:4173');
  if (routeProbe.origin !== 'http://127.0.0.1:4173') throw httpError(400, '浏览器验收 route 不得离开 localhost 同源');

  if (value.actions !== undefined && !Array.isArray(value.actions)) throw httpError(400, '浏览器验收 actions 必须是数组');
  const rawActions = value.actions ?? [];
  if (rawActions.length > MAX_ACTIONS) throw httpError(400, `浏览器验收动作不得超过 ${MAX_ACTIONS} 个`);
  const actions = compileAcceptanceActions(rawActions.map((action, index) => normalizeAction(action, index)));
  const waitAfterLoadMs = normalizeInteger(value.waitAfterLoadMs, 300, 0, 3_000, 'waitAfterLoadMs');
  return { scriptId, route, waitAfterLoadMs, actions };
}

export function createDevelopmentAcceptanceRuntime(options = {}) {
  const browserRunner = options.browserRunner ?? runChromiumAcceptance;
  const spawnProcess = options.spawnProcess ?? spawn;
  const activeChildren = new Set();

  const registerChild = (child) => {
    if (child?.pid) activeChildren.add(child);
  };
  const unregisterChild = (child) => activeChildren.delete(child);

  async function run(input) {
    const plan = normalizeDevelopmentAcceptancePlan(input?.plan, input?.availableScripts);
    const root = path.resolve(String(input?.root ?? ''));
    const startedAtMs = Date.now();
    const service = await startAcceptanceService({ root, scriptId: plan.scriptId, spawnProcess });
    registerChild(service.child);
    try {
      const serviceReady = await service.ready;
      const targetUrl = resolveSameOriginRoute(serviceReady.url, plan.route);
      const browserResult = await browserRunner({
        url: targetUrl,
        plan,
        browserExecutable: options.browserExecutable,
        spawnProcess,
        registerChild,
        unregisterChild,
      });
      const finishedAt = new Date().toISOString();
      const summary = {
        status: browserResult.status,
        scriptId: plan.scriptId,
        planSha256: sha256(JSON.stringify(plan)),
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt,
        durationMs: Date.now() - startedAtMs,
        actionCount: plan.actions.length,
        viewportCount: browserResult.viewports.length,
        consoleErrorCount: sum(browserResult.viewports, 'consoleErrorCount'),
        consoleWarningCount: sum(browserResult.viewports, 'consoleWarningCount'),
        failedRequestCount: sum(browserResult.viewports, 'failedRequestCount'),
        failureCount: sum(browserResult.viewports, 'failureCount'),
        screenshotSha256: browserResult.viewports.map((viewport) => viewport.screenshotSha256),
      };
      return {
        ...summary,
        evidenceSha256: sha256(JSON.stringify(summary)),
        viewports: browserResult.viewports,
      };
    } finally {
      unregisterChild(service.child);
      await stopProcessTree(service.child, spawnProcess);
    }
  }

  async function dispose() {
    await Promise.all([...activeChildren].map(async (child) => {
      activeChildren.delete(child);
      await stopProcessTree(child, spawnProcess);
    }));
  }

  return { run, dispose };
}

function normalizeAction(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, `浏览器验收动作 ${index + 1} 非法`);
  const type = typeof value.type === 'string' ? value.type : '';
  if (!type || type.length > 32) {
    const fields = Object.keys(value).filter((key) => /^[a-z][a-z0-9_-]{0,31}$/i.test(key)).slice(0, 8);
    throw httpError(400, `浏览器验收动作 ${index + 1} 缺少有效字符串 type；动作对象必须使用 type 字段${fields.length ? `；收到字段 ${fields.join(',')}` : ''}`);
  }
  if (type === 'click' || type === 'assert-visible' || type === 'assert-hidden' || type === 'assert-absent') {
    assertExactObjectKeys(value, ['type', 'selector'], `浏览器验收动作 ${index + 1}`);
    return { type, selector: boundedRequired(value.selector, 300, `动作 ${index + 1} selector`) };
  }
  if (type === 'fill') {
    assertExactObjectKeys(value, ['type', 'selector', 'value'], `浏览器验收动作 ${index + 1}`);
    const text = boundedRequired(value.value, 1_000, `动作 ${index + 1} value`, true);
    if (/(?:^|[^a-z])sk-[a-z0-9]{16,}/i.test(text)) throw httpError(400, '浏览器验收不得输入疑似 API Key');
    return {
      type,
      selector: boundedRequired(value.selector, 300, `动作 ${index + 1} selector`),
      value: text,
    };
  }
  if (type === 'press') {
    assertExactObjectKeys(value, ['type', 'key'], `浏览器验收动作 ${index + 1}`);
    const key = typeof value.key === 'string' ? value.key : '';
    if (!SAFE_KEYS.has(key)) throw httpError(400, `动作 ${index + 1} key 不在固定清单`);
    return { type, key };
  }
  if (type === 'wait') {
    assertExactObjectKeys(value, ['type', 'ms'], `浏览器验收动作 ${index + 1}`);
    return { type, ms: normalizeInteger(value.ms, 300, 50, 3_000, `动作 ${index + 1} ms`) };
  }
  if (type === 'assert-text' || type === 'assert-text-absent') {
    assertExactObjectKeys(value, ['type', 'text'], `浏览器验收动作 ${index + 1}`);
    return { type, text: boundedRequired(value.text, 500, `动作 ${index + 1} text`) };
  }
  const typeHint = /^[a-z][a-z0-9_-]{0,31}$/i.test(type) ? ` "${type}"` : '';
  throw httpError(400, `浏览器验收动作 ${index + 1} 类型${typeHint}不受支持；只允许固定动作清单`);
}

function compileAcceptanceActions(actions) {
  const compiled = [];
  const selectorAssertions = new Map();
  const textAssertions = new Map();
  let lastInteractionIndex = -1;
  const resetStaticAssertions = () => {
    selectorAssertions.clear();
    textAssertions.clear();
  };
  for (const [index, action] of actions.entries()) {
    if (action.type === 'click' || action.type === 'fill') {
      if (selectorAssertions.get(action.selector) === 'absent') {
        throw httpError(400, `浏览器验收动作 ${index + 1} 操作了已断言不存在的 selector`);
      }
      resetStaticAssertions();
      compiled.push(action);
      lastInteractionIndex = compiled.length - 1;
      continue;
    }
    if (action.type === 'press') {
      resetStaticAssertions();
      compiled.push(action);
      lastInteractionIndex = compiled.length - 1;
      continue;
    }
    if (action.type === 'wait') {
      resetStaticAssertions();
      compiled.push(action);
      continue;
    }
    if (action.type === 'assert-text' || action.type === 'assert-text-absent') {
      const assertion = action.type === 'assert-text' ? 'present' : 'absent';
      const previous = textAssertions.get(action.text);
      if (previous && previous !== assertion) {
        throw httpError(400, `浏览器验收动作 ${index + 1} 与同一静态阶段的文本断言相互矛盾`);
      }
      if (!previous) {
        textAssertions.set(action.text, assertion);
        compiled.push(action);
      }
      continue;
    }
    const assertion = action.type === 'assert-visible' ? 'visible' : action.type === 'assert-hidden' ? 'hidden' : 'absent';
    const previous = selectorAssertions.get(action.selector);
    if (previous && previous !== assertion) {
      throw httpError(400, `浏览器验收动作 ${index + 1} 与同一静态阶段的 selector 断言相互矛盾`);
    }
    if (!previous) {
      selectorAssertions.set(action.selector, assertion);
      compiled.push(action);
    }
  }
  if (lastInteractionIndex >= 0 && !compiled.slice(lastInteractionIndex + 1).some(isAcceptanceAssertion)) {
    throw httpError(400, '浏览器验收交互后缺少结果断言');
  }
  if (!compiled.some(isAcceptanceAssertion)) throw httpError(400, '浏览器验收计划缺少任务结果断言');
  return compiled;
}

function isAcceptanceAssertion(action) {
  return action.type === 'assert-visible'
    || action.type === 'assert-hidden'
    || action.type === 'assert-absent'
    || action.type === 'assert-text'
    || action.type === 'assert-text-absent';
}

function assertExactObjectKeys(value, allowed, label) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw httpError(400, `${label} 包含未允许的额外字段；只允许 ${allowed.join(',')}`);
  }
}

async function startAcceptanceService({ root, scriptId, spawnProcess }) {
  if (!SAFE_ACCEPTANCE_SCRIPT_SET.has(scriptId)) throw httpError(400, '验收服务脚本不在固定清单');
  const service = await resolveDevelopmentAcceptanceService(root, scriptId);
  const child = spawnProcess(service.command, service.args, {
    cwd: root,
    env: sanitizedChildEnv(service.env),
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let settled = false;
  let pollStarted = false;

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, httpError(504, '本地验收服务 30 秒内未提供可访问的 loopback URL')), 30_000);
    const inspect = (chunk) => {
      output = boundedTail(output + chunk.toString('utf8'), MAX_SERVICE_OUTPUT_BYTES);
      if (pollStarted) return;
      const match = stripAnsi(output).match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}(?:\/[^\s]*)?/i);
      if (!match || !isLoopbackAcceptanceUrl(match[0])) return;
      pollStarted = true;
      void waitForLoopback(match[0], child).then(
        (url) => finish(resolve, { url, outputSha256: sha256(output) }),
        (error) => finish(reject, error),
      );
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.once('error', (error) => finish(reject, httpError(500, `本地验收服务启动失败：${error.message}`)));
    child.once('close', (code) => {
      if (!settled) finish(reject, httpError(409, `本地验收服务在就绪前退出（exit ${Number.isInteger(code) ? code : 1}，输出 ${sha256(output).slice(0, 12)}）`));
    });
  });
  return { child, ready };
}

export async function resolveDevelopmentAcceptanceService(rootValue, scriptId) {
  if (!SAFE_ACCEPTANCE_SCRIPT_SET.has(scriptId)) throw httpError(400, '验收服务脚本不在固定清单');
  if (typeof rootValue !== 'string' || !rootValue.trim() || !path.isAbsolute(rootValue)) {
    throw httpError(400, '验收服务根目录必须是绝对路径');
  }
  const root = path.resolve(rootValue);
  const rootStat = await fsp.lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw httpError(400, '验收服务根目录非法');
  if (NODE_ACCEPTANCE_SCRIPT_SET.has(scriptId)) {
    return {
      command: process.platform === 'win32'
        ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')
        : 'npm',
      args: process.platform === 'win32'
        ? ['/d', '/s', '/c', `npm.cmd run ${scriptId}`]
        : ['run', scriptId],
      env: { BROWSER: 'none', HOST: '127.0.0.1' },
    };
  }

  const python = await resolvePythonRuntime(root);
  const commonEnv = { PYTHONDONTWRITEBYTECODE: '1' };
  if (scriptId === 'python-static') {
    const directory = await isFixedRegularFile(root, 'index.html')
      ? '.'
      : (await isFixedRegularFile(root, 'public/index.html') ? 'public' : '');
    if (!directory) throw httpError(409, 'python-static 需要根目录或 public/index.html');
    return {
      command: python,
      args: ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', directory],
      env: commonEnv,
    };
  }
  if (scriptId === 'python-flask') {
    const moduleName = await isFixedRegularFile(root, 'app.py')
      ? 'app'
      : (await isFixedRegularFile(root, 'wsgi.py') ? 'wsgi' : '');
    if (!moduleName) throw httpError(409, 'python-flask 需要根目录 app.py 或 wsgi.py');
    return {
      command: python,
      args: ['-u', '-m', 'flask', '--app', moduleName, 'run', '--host', '127.0.0.1', '--port', '0', '--no-reload'],
      env: { ...commonEnv, FLASK_SKIP_DOTENV: '1' },
    };
  }
  const appTarget = await isFixedRegularFile(root, 'main.py')
    ? 'main:app'
    : (await isFixedRegularFile(root, 'app.py') ? 'app:app' : '');
  if (!appTarget) throw httpError(409, 'python-fastapi 需要根目录 main.py 或 app.py 的 app 对象');
  return {
    command: python,
    args: ['-u', '-m', 'uvicorn', appTarget, '--host', '127.0.0.1', '--port', '0'],
    env: commonEnv,
  };
}

async function resolvePythonRuntime(root) {
  const candidates = process.platform === 'win32'
    ? ['.venv/Scripts/python.exe', 'venv/Scripts/python.exe']
    : ['.venv/bin/python', 'venv/bin/python'];
  for (const relativePath of candidates) {
    const target = path.join(root, ...relativePath.split('/'));
    const stat = await fsp.lstat(target).catch(() => null);
    if (stat?.isFile() && !stat.isSymbolicLink()) return target;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

async function isFixedRegularFile(root, relativePath) {
  let current = root;
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await fsp.lstat(current).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return false;
    if (index < parts.length - 1 && !stat.isDirectory()) return false;
    if (index === parts.length - 1) return stat.isFile();
  }
  return false;
}

async function waitForLoopback(value, child) {
  const url = new URL(value);
  url.hostname = '127.0.0.1';
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw httpError(409, '本地验收服务在健康检查前退出');
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1_500) });
      if (response.status < 500) return url.toString();
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw httpError(504, `本地验收服务不可访问（${lastError instanceof Error ? lastError.name : 'timeout'}）`);
}

async function runChromiumAcceptance(input) {
  const viewports = [];
  for (const viewport of VIEWPORTS) {
    viewports.push(await runChromiumViewportAcceptance(input, viewport));
  }
  return { status: viewports.every((viewport) => viewport.failureCount === 0) ? 'passed' : 'failed', viewports };
}

async function runChromiumViewportAcceptance(input, viewport) {
  const executable = await resolveBrowserExecutable(input.browserExecutable);
  const profileRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'agenthub-browser-acceptance-'));
  const child = input.spawnProcess(executable, [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileRoot}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-features=OptimizationHints,MediaRouter,Translate',
    'about:blank',
  ], {
    env: sanitizedChildEnv(),
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  input.registerChild?.(child);
  let cdp;
  try {
    const debuggerUrl = await waitForDebuggerUrl(profileRoot, child);
    cdp = await CdpSession.connect(debuggerUrl);
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Log.enable'),
      cdp.send('Network.enable'),
      cdp.send('Fetch.enable'),
    ]);
    return await runViewportAcceptance(cdp, input.url, input.plan, viewport);
  } finally {
    await cdp?.close().catch(() => undefined);
    input.unregisterChild?.(child);
    await stopProcessTree(child, input.spawnProcess);
    await fsp.rm(profileRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runViewportAcceptance(cdp, url, plan, viewport) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];
  const blockedNetworkIds = new Set();
  let documentStatus = 0;
  const unsubscribers = [
    cdp.subscribe('Runtime.consoleAPICalled', (params) => {
      if (params.type !== 'error' && params.type !== 'warning') return;
      const message = boundedTail((params.args ?? []).map((arg) => arg.value ?? arg.description ?? arg.type).join(' '), 500);
      const sourceUrl = params.stackTrace?.callFrames?.[0]?.url ?? '';
      (params.type === 'error' ? consoleErrors : consoleWarnings).push(
        formatDevelopmentBrowserDiagnostic(message || params.type, sourceUrl, url),
      );
    }),
    cdp.subscribe('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails ?? {};
      const sourceUrl = details.url ?? details.stackTrace?.callFrames?.[0]?.url ?? '';
      consoleErrors.push(formatDevelopmentBrowserDiagnostic(
        details.exception?.description ?? details.text ?? 'runtime exception',
        sourceUrl,
        url,
      ));
    }),
    cdp.subscribe('Log.entryAdded', (params) => {
      const level = params.entry?.level;
      if (level !== 'error' && level !== 'warning') return;
      (level === 'error' ? consoleErrors : consoleWarnings).push(
        formatDevelopmentBrowserDiagnostic(params.entry?.text ?? level, params.entry?.url ?? '', url),
      );
    }),
    cdp.subscribe('Network.loadingFailed', (params) => {
      if (blockedNetworkIds.delete(params.requestId)) return;
      if (params.canceled || params.errorText === 'net::ERR_ABORTED') return;
      failedRequests.push(boundedTail(`${params.type ?? 'resource'}:${params.errorText ?? 'failed'}`, 300));
    }),
    cdp.subscribe('Network.responseReceived', (params) => {
      const status = Number(params.response?.status) || 0;
      if (params.type === 'Document' && params.response?.url === url) {
        documentStatus = status;
        return;
      }
      if (status >= 400) {
        failedRequests.push(formatDevelopmentBrowserDiagnostic(
          `${params.type ?? 'resource'}:http-${status}`,
          params.response?.url ?? '',
          url,
        ));
      }
    }),
    cdp.subscribe('Fetch.requestPaused', (params) => {
      const requestId = params.requestId;
      const requestUrl = params.request?.url ?? '';
      if (isDevelopmentAcceptanceRequestAllowed(requestUrl, url)) {
        void cdp.send('Fetch.continueRequest', { requestId }).catch(() => undefined);
        return;
      }
      if (params.networkId) blockedNetworkIds.add(params.networkId);
      failedRequests.push(`blocked-external-request:${safeOriginHash(requestUrl)}`);
      void cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => undefined);
    }),
  ];
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    const load = cdp.waitFor('Page.loadEventFired', 20_000);
    await cdp.send('Page.navigate', { url });
    await load;
    if (plan.waitAfterLoadMs) await delay(plan.waitAfterLoadMs);
    const failures = [];
    for (const action of plan.actions) {
      const failure = await executeAction(cdp, action);
      if (failure) failures.push(failure);
    }
    const metrics = await evaluateValue(cdp, `(() => ({
      readyState: document.readyState,
      hasBody: Boolean(document.body),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement?.scrollWidth || 0, document.body?.scrollWidth || 0),
      documentHeight: Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0)
    }))()`);
    if (!metrics?.hasBody || metrics.readyState !== 'complete') failures.push('document-not-ready');
    if ((metrics?.documentWidth ?? 0) > viewport.width + 1) failures.push(`horizontal-overflow:${metrics.documentWidth}>${viewport.width}`);
    if (documentStatus >= 400) failures.push(`document-http-${documentStatus}`);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const screenshotBase64 = typeof screenshot?.data === 'string' ? screenshot.data : '';
    if (!screenshotBase64) failures.push('screenshot-missing');
    await delay(100);
    if (consoleErrors.length) failures.push(`console-errors:${consoleErrors.length}`);
    if (consoleWarnings.length) failures.push(`console-warnings:${consoleWarnings.length}`);
    if (failedRequests.length) failures.push(`failed-requests:${failedRequests.length}`);
    return {
      id: viewport.id,
      width: viewport.width,
      height: viewport.height,
      documentWidth: Number(metrics?.documentWidth) || 0,
      documentHeight: Number(metrics?.documentHeight) || 0,
      consoleErrorCount: consoleErrors.length,
      consoleWarningCount: consoleWarnings.length,
      failedRequestCount: failedRequests.length,
      failureCount: failures.length,
      failures: failures.slice(0, 24),
      diagnostics: [...consoleErrors, ...consoleWarnings, ...failedRequests].slice(0, 24),
      screenshotSha256: sha256(Buffer.from(screenshotBase64, 'base64')),
      screenshotDataUrl: `data:image/png;base64,${screenshotBase64}`,
    };
  } finally {
    for (const unsubscribe of unsubscribers) unsubscribe();
  }
}

function sameOriginBrowserPath(sourceUrlValue, targetUrlValue) {
  try {
    const source = new URL(String(sourceUrlValue));
    const target = new URL(String(targetUrlValue));
    if (source.origin !== target.origin || !source.pathname.startsWith('/')) return '';
    return source.pathname.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
  } catch {
    return '';
  }
}

async function executeAction(cdp, action) {
  if (action.type === 'wait') {
    await delay(action.ms);
    return '';
  }
  if (action.type === 'click') {
    const result = await evaluateValue(cdp, `(() => {
      let element; try { element = document.querySelector(${JSON.stringify(action.selector)}); } catch { return { ok: false, reason: 'invalid-selector' }; }
      if (!(element instanceof HTMLElement)) return { ok: false, reason: 'selector-not-found' };
      element.scrollIntoView({ block: 'center', inline: 'center' }); element.click(); return { ok: true };
    })()`);
    if (!result?.ok) return `click:${result?.reason ?? 'failed'}`;
    await delay(250);
    return '';
  }
  if (action.type === 'fill') {
    const result = await evaluateValue(cdp, `(() => {
      let element; try { element = document.querySelector(${JSON.stringify(action.selector)}); } catch { return { ok: false, reason: 'invalid-selector' }; }
      if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return { ok: false, reason: 'input-not-found' };
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) return { ok: false, reason: 'value-setter-missing' };
      element.focus(); setter.call(element, ${JSON.stringify(action.value)});
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);
    return result?.ok ? '' : `fill:${result?.reason ?? 'failed'}`;
  }
  if (action.type === 'press') {
    const result = await evaluateValue(cdp, `(() => {
      const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
      if (!target) return { ok: false, reason: 'no-active-element' };
      const key = ${JSON.stringify(action.key)};
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      if (key === 'Enter' && target instanceof HTMLInputElement && target.form?.requestSubmit) target.form.requestSubmit();
      return { ok: true };
    })()`);
    if (!result?.ok) return `press:${result?.reason ?? 'failed'}`;
    await delay(250);
    return '';
  }
  if (action.type === 'assert-visible' || action.type === 'assert-hidden' || action.type === 'assert-absent') {
    const result = await evaluateValue(cdp, `(() => {
      let element; try { element = document.querySelector(${JSON.stringify(action.selector)}); } catch { return { exists: false, visible: false, invalid: true }; }
      if (!(element instanceof Element)) return { exists: false, visible: false };
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { exists: true, visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' };
    })()`);
    if (result?.invalid) return `${action.type}:invalid-selector`;
    if (action.type === 'assert-visible' && !result?.visible) return 'assert-visible:not-visible';
    if (action.type === 'assert-hidden' && result?.visible) return 'assert-hidden:element-visible';
    if (action.type === 'assert-absent' && result?.exists) return 'assert-absent:element-present';
    return '';
  }
  if (action.type === 'assert-text' || action.type === 'assert-text-absent') {
    const result = await evaluateValue(cdp, `(() => Boolean(document.body?.innerText.includes(${JSON.stringify(action.text)})))()`);
    if (action.type === 'assert-text') return result ? '' : 'assert-text:not-found';
    return result ? 'assert-text-absent:found' : '';
  }
  return 'unsupported-action';
}

async function evaluateValue(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) return null;
  return response?.result?.value;
}

async function waitForDebuggerUrl(profileRoot, child) {
  const marker = path.join(profileRoot, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw httpError(500, '浏览器在 DevTools 就绪前退出');
    const body = await fsp.readFile(marker, 'utf8').catch(() => '');
    const port = Number(body.split(/\r?\n/, 1)[0]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) })).json();
        const page = Array.isArray(targets) ? targets.find((target) => target?.type === 'page' && target.webSocketDebuggerUrl) : null;
        if (page) return page.webSocketDebuggerUrl;
      } catch {
        // DevTools may be listening before the initial page target exists.
      }
    }
    await delay(100);
  }
  throw httpError(504, '浏览器 DevTools 10 秒内未就绪');
}

async function resolveBrowserExecutable(explicit) {
  const candidates = [
    explicit,
    process.env.AGENTHUB_BROWSER_EXECUTABLE,
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const stat = await fsp.stat(path.resolve(candidate)).catch(() => null);
    if (stat?.isFile()) return path.resolve(candidate);
  }
  throw httpError(409, '未找到本机 Edge/Chrome 浏览器；浏览器验收保持阻塞');
}

function resolveSameOriginRoute(baseValue, route) {
  if (!isLoopbackAcceptanceUrl(baseValue)) throw httpError(409, '验收服务未提供可信 loopback URL');
  const base = new URL(baseValue);
  const target = new URL(route, base);
  if (target.origin !== base.origin) throw httpError(400, '验收 route 离开服务同源');
  return target.toString();
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', (event) => { void this.handleMessage(event.data); });
    socket.addEventListener('close', () => this.rejectPending(new Error('浏览器 DevTools 连接已关闭')));
    socket.addEventListener('error', () => this.rejectPending(new Error('浏览器 DevTools 连接失败')));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(httpError(504, '浏览器 DevTools WebSocket 连接超时')), 5_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(httpError(500, '浏览器 DevTools WebSocket 连接失败')); }, { once: true });
    });
    return new CdpSession(socket);
  }

  async handleMessage(data) {
    const text = typeof data === 'string'
      ? data
      : data instanceof Blob
        ? await data.text()
        : Buffer.from(data).toString('utf8');
    let message;
    try { message = JSON.parse(text); } catch { return; }
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) {
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(httpError(504, `浏览器命令超时：${method}`));
      }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs) {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe(method, (params) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
      const timer = setTimeout(() => {
        unsubscribe();
        reject(httpError(504, `等待浏览器事件超时：${method}`));
      }, timeoutMs);
    });
  }

  subscribe(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(method);
    };
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.close();
    });
  }
}

async function stopProcessTree(child, spawnProcess) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawnProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', () => resolve());
      killer.once('close', () => resolve());
    });
    if (child.exitCode === null) {
      await Promise.race([new Promise((resolve) => child.once('close', resolve)), delay(1_500)]);
    }
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('close', resolve)), delay(1_500)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function sanitizedChildEnv(extra = {}) {
  const allowed = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|COMSPEC|OS|NUMBER_OF_PROCESSORS)$/i;
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key))),
    CI: '1',
    NO_COLOR: '1',
    ...extra,
  };
}

function boundedRequired(value, max, label, preserveWhitespace = false) {
  if (typeof value !== 'string') throw httpError(400, `${label} 缺失`);
  const text = preserveWhitespace ? value : value.trim();
  if (!text || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw httpError(400, `${label} 非法`);
  return text;
}

function normalizeInteger(value, fallback, minimum, maximum, label) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw httpError(400, `${label} 非法`);
  return number;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function boundedTail(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(-max);
}

function sum(values, key) {
  return values.reduce((total, value) => total + (Number(value?.[key]) || 0), 0);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeOriginHash(value) {
  try {
    const url = new URL(String(value));
    return sha256(url.origin === 'null' ? url.protocol : url.origin).slice(0, 12);
  } catch {
    return sha256('invalid-request-url').slice(0, 12);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
