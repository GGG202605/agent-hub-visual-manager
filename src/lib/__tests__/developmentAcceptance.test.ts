import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_ACCEPTANCE_SCRIPTS,
  chooseDevelopmentAcceptanceScript,
  createDevelopmentAcceptanceRuntime,
  formatDevelopmentBrowserDiagnostic,
  isDevelopmentAcceptanceRequestAllowed,
  isDevelopmentAcceptanceScript,
  isLoopbackAcceptanceUrl,
  normalizeDevelopmentAcceptancePlan,
  resolveDevelopmentAcceptanceService,
} from '../../../server/developmentAcceptance.mjs';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })));
});

describe('development browser acceptance executor', () => {
  it('keeps scripts, routes and actions on the typed localhost contract', () => {
    const syntheticApiKey = ['sk', '0'.repeat(16)].join('-');
    expect(DEVELOPMENT_ACCEPTANCE_SCRIPTS).toEqual([
      'preview', 'dev', 'start', 'python-fastapi', 'python-flask', 'python-static',
    ]);
    expect(isDevelopmentAcceptanceScript('python-static')).toBe(true);
    expect(isDevelopmentAcceptanceScript('python-arbitrary')).toBe(false);
    expect(chooseDevelopmentAcceptanceScript(['dev', 'preview'])).toBe('preview');
    expect(chooseDevelopmentAcceptanceScript(['python-static'])).toBe('python-static');
    expect(isLoopbackAcceptanceUrl('http://127.0.0.1:4173/path')).toBe(true);
    expect(isLoopbackAcceptanceUrl('https://example.com')).toBe(false);
    expect(isDevelopmentAcceptanceRequestAllowed('http://127.0.0.1:4173/api', 'http://127.0.0.1:4173/page')).toBe(true);
    expect(isDevelopmentAcceptanceRequestAllowed('blob:http://127.0.0.1:4173/id', 'http://127.0.0.1:4173/page')).toBe(true);
    expect(isDevelopmentAcceptanceRequestAllowed('data:image/png;base64,eA==', 'http://127.0.0.1:4173/page')).toBe(true);
    expect(isDevelopmentAcceptanceRequestAllowed('http://127.0.0.1:4174/api', 'http://127.0.0.1:4173/page')).toBe(false);
    expect(isDevelopmentAcceptanceRequestAllowed('https://example.com/api', 'http://127.0.0.1:4173/page')).toBe(false);
    expect(formatDevelopmentBrowserDiagnostic(
      'Failed to load resource: 404',
      'http://127.0.0.1:4173/favicon.ico?session=secret',
      'http://127.0.0.1:4173/page',
    )).toBe('Failed to load resource: 404 @ /favicon.ico');
    expect(formatDevelopmentBrowserDiagnostic(
      'blocked external source',
      'https://example.com/private?token=secret',
      'http://127.0.0.1:4173/page',
    )).toBe('blocked external source');
    expect(normalizeDevelopmentAcceptancePlan({
      scriptId: 'dev',
      route: '/settings',
      actions: [
        { type: 'assert-visible', selector: '[aria-label="设置"]' },
        { type: 'assert-hidden', selector: '[aria-label="加载中"]' },
        { type: 'assert-text-absent', text: '加载中' },
      ],
    }, ['dev'])).toMatchObject({
      scriptId: 'dev',
      route: '/settings',
      actions: [{ type: 'assert-visible' }, { type: 'assert-hidden' }, { type: 'assert-text-absent' }],
    });
    expect(normalizeDevelopmentAcceptancePlan({
      scriptId: 'python-fastapi', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }],
    }, ['python-fastapi']))
      .toMatchObject({ scriptId: 'python-fastapi', route: '/' });
    expect(() => normalizeDevelopmentAcceptancePlan({ scriptId: 'python-fastapi', route: '/' }, ['python-fastapi']))
      .toThrow('任务结果断言');
    expect(() => normalizeDevelopmentAcceptancePlan({ scriptId: 'dev', route: '//example.com' }, ['dev'])).toThrow('同源');
    expect(() => normalizeDevelopmentAcceptancePlan({
      scriptId: 'dev',
      actions: [
        { type: 'fill', selector: 'input', value: syntheticApiKey },
        { type: 'assert-visible', selector: 'body' },
      ],
    }, ['dev'])).toThrow('API Key');
    expect(() => normalizeDevelopmentAcceptancePlan({ scriptId: 'start', route: '/' }, ['preview'])).toThrow('scriptId');
    expect(() => normalizeDevelopmentAcceptancePlan({ scriptId: 'preview', route: '/', command: 'npm start' }, ['preview'])).toThrow('额外字段');
    expect(() => normalizeDevelopmentAcceptancePlan({
      scriptId: 'preview',
      actions: [{ type: 'assert-text-absent', text: '处理中', selector: 'body' }],
    }, ['preview'])).toThrow('只允许 type,text');
    expect(() => normalizeDevelopmentAcceptancePlan({
      scriptId: 'preview',
      actions: [{ action: 'click', selector: '#save' }],
    }, ['preview'])).toThrow('必须使用 type 字段；收到字段 action,selector');
    expect(() => normalizeDevelopmentAcceptancePlan({
      scriptId: 'preview',
      actions: [
        { type: 'assert-visible', selector: '#panel' },
        { type: 'assert-text', text: '面板' },
        { type: 'assert-absent', selector: '#panel' },
      ],
    }, ['preview'])).toThrow('相互矛盾');
    expect(() => normalizeDevelopmentAcceptancePlan({
      scriptId: 'preview',
      actions: [{ type: 'click', selector: '#submit' }],
    }, ['preview'])).toThrow('结果断言');
    expect(normalizeDevelopmentAcceptancePlan({
      scriptId: 'preview',
      actions: [
        { type: 'assert-text', text: '完成' },
        { type: 'assert-text', text: '完成' },
      ],
    }, ['preview']).actions).toEqual([{ type: 'assert-text', text: '完成' }]);
  });

  it('generates only fixed Python static, Flask and FastAPI service commands', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-python-services-'));
    temporaryRoots.push(root);
    await mkdir(path.join(root, 'public'));
    await writeFile(path.join(root, 'public', 'index.html'), '<main>static</main>', 'utf8');
    await writeFile(path.join(root, 'app.py'), 'app = object()\n', 'utf8');
    await writeFile(path.join(root, 'main.py'), 'app = object()\n', 'utf8');

    const staticService = await resolveDevelopmentAcceptanceService(root, 'python-static');
    expect(['python', 'python3']).toContain(staticService.command);
    expect(staticService).toMatchObject({
      args: ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', 'public'],
      env: { PYTHONDONTWRITEBYTECODE: '1' },
    });

    const flaskService = await resolveDevelopmentAcceptanceService(root, 'python-flask');
    expect(flaskService.args).toEqual([
      '-u', '-m', 'flask', '--app', 'app', 'run', '--host', '127.0.0.1', '--port', '0', '--no-reload',
    ]);
    expect(flaskService.env).toMatchObject({ PYTHONDONTWRITEBYTECODE: '1', FLASK_SKIP_DOTENV: '1' });

    const fastApiService = await resolveDevelopmentAcceptanceService(root, 'python-fastapi');
    expect(fastApiService.args).toEqual([
      '-u', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '0',
    ]);
    await expect(resolveDevelopmentAcceptanceService('relative-root', 'python-static')).rejects.toThrow('绝对路径');
    await expect(resolveDevelopmentAcceptanceService(root, 'arbitrary-command' as any)).rejects.toThrow('固定清单');
  });

  it('starts a real fixed Python static service and cleans it up', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-python-static-'));
    temporaryRoots.push(root);
    await writeFile(path.join(root, 'index.html'), '<main>python static fixture</main>', 'utf8');
    let visited = '';
    const runtime = createDevelopmentAcceptanceRuntime({
      async browserRunner(input: any) {
        visited = input.url;
        const response = await fetch(input.url);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('python static fixture');
        return {
          status: 'passed',
          viewports: (['desktop', 'mobile'] as const).map((id) => ({
            id,
            width: id === 'desktop' ? 1440 : 390,
            height: id === 'desktop' ? 900 : 844,
            documentWidth: id === 'desktop' ? 1440 : 390,
            documentHeight: 900,
            consoleErrorCount: 0,
            consoleWarningCount: 0,
            failedRequestCount: 0,
            failureCount: 0,
            failures: [],
            diagnostics: [],
            screenshotSha256: id === 'desktop' ? 'e'.repeat(64) : 'f'.repeat(64),
            screenshotDataUrl: 'data:image/png;base64,cHl0aG9u',
          })),
        };
      },
    });
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['python-static'],
        plan: { scriptId: 'python-static', route: '/', actions: [{ type: 'assert-visible', selector: 'body' }] },
      });
      expect(visited).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(result).toMatchObject({ status: 'passed', scriptId: 'python-static', viewportCount: 2 });
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it('starts one fixed preview service, returns in-memory viewport evidence and cleans up', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-acceptance-runtime-'));
    temporaryRoots.push(root);
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { preview: 'node preview.mjs' } }), 'utf8');
    await writeFile(path.join(root, 'preview.mjs'), [
      "import http from 'node:http';",
      "const server = http.createServer((_request, response) => { response.writeHead(200, {'content-type':'text/html'}); response.end('<main>fixture</main>'); });",
      "server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`));",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
      '',
    ].join('\n'), 'utf8');
    const screenshot = Buffer.from('synthetic-png').toString('base64');
    let visited = '';
    const runtime = createDevelopmentAcceptanceRuntime({
      async browserRunner(input: any) {
        visited = input.url;
        expect((await fetch(input.url)).status).toBe(200);
        return {
          status: 'passed',
          viewports: (['desktop', 'mobile'] as const).map((id) => ({
            id,
            width: id === 'desktop' ? 1440 : 390,
            height: id === 'desktop' ? 900 : 844,
            documentWidth: id === 'desktop' ? 1440 : 390,
            documentHeight: 1_000,
            consoleErrorCount: 0,
            consoleWarningCount: 0,
            failedRequestCount: 0,
            failureCount: 0,
            failures: [],
            diagnostics: [],
            screenshotSha256: id === 'desktop' ? 'c'.repeat(64) : 'd'.repeat(64),
            screenshotDataUrl: `data:image/png;base64,${screenshot}`,
          })),
        };
      },
    });
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['preview'],
        plan: { scriptId: 'preview', route: '/fixture', actions: [{ type: 'assert-visible', selector: 'main' }] },
      });
      expect(visited).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/fixture$/);
      expect(result).toMatchObject({ status: 'passed', scriptId: 'preview', viewportCount: 2, failureCount: 0 });
      expect(result.viewports[0].screenshotDataUrl).toContain('data:image/png;base64,');
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it.runIf(process.env.AGENTHUB_BROWSER_E2E === '1')('accepts a fixed Python static service in real desktop and mobile browsers', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-python-browser-'));
    temporaryRoots.push(root);
    await writeFile(path.join(root, 'index.html'), [
      '<!doctype html>',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="icon" href="data:,">',
      '<title>Python browser fixture</title>',
      '<main data-testid="ready">python browser fixture</main>',
      '<button data-testid="hidden-control" hidden>hidden control</button>',
    ].join('\n'), 'utf8');
    const runtime = createDevelopmentAcceptanceRuntime();
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['python-static'],
        plan: {
          scriptId: 'python-static',
          route: '/',
          actions: [
            { type: 'assert-visible', selector: '[data-testid="ready"]' },
            { type: 'assert-hidden', selector: '[data-testid="hidden-control"]' },
            { type: 'assert-text', text: 'python browser fixture' },
            { type: 'assert-text-absent', text: 'unexpected fixture text' },
          ],
        },
      });
      expect(result).toMatchObject({ status: 'passed', scriptId: 'python-static', viewportCount: 2, failureCount: 0 });
      expect(result.viewports.map((viewport) => viewport.width)).toEqual([1440, 390]);
      expect(result.viewports.every((viewport) => (
        viewport.consoleErrorCount === 0
        && viewport.consoleWarningCount === 0
        && viewport.screenshotDataUrl.startsWith('data:image/png;base64,')
      ))).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it.runIf(process.env.AGENTHUB_BROWSER_E2E === '1')('fails closed when assert-absent contains an invalid selector', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-invalid-selector-browser-'));
    temporaryRoots.push(root);
    await writeFile(path.join(root, 'index.html'), [
      '<!doctype html>',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="icon" href="data:,">',
      '<main>invalid selector fixture</main>',
    ].join('\n'), 'utf8');
    const runtime = createDevelopmentAcceptanceRuntime();
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['python-static'],
        plan: {
          scriptId: 'python-static',
          route: '/',
          actions: [{ type: 'assert-absent', selector: '[' }],
        },
      });
      expect(result.status).toBe('failed');
      expect(result.viewports.every((viewport) => viewport.failures.includes('assert-absent:invalid-selector'))).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it.runIf(process.env.AGENTHUB_BROWSER_E2E === '1')('reports same-origin HTTP failures with pathname-only repair evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-browser-http-failure-'));
    temporaryRoots.push(root);
    await writeFile(path.join(root, 'index.html'), [
      '<!doctype html>',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="icon" href="/favicon.ico?session=secret">',
      '<main>missing favicon fixture</main>',
    ].join('\n'), 'utf8');
    const runtime = createDevelopmentAcceptanceRuntime();
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['python-static'],
        plan: { scriptId: 'python-static', route: '/', actions: [{ type: 'assert-visible', selector: 'main' }] },
      });
      expect(result.status).toBe('failed');
      expect(result.failedRequestCount).toBe(2);
      const diagnostics = result.viewports.flatMap((viewport) => viewport.diagnostics).join(' ');
      expect(diagnostics).toContain('http-404 @ /favicon.ico');
      expect(diagnostics).not.toContain('session=secret');
      expect(diagnostics).not.toMatch(/127\.0\.0\.1:\d+/);
    } finally {
      await runtime.dispose();
    }
  }, 30_000);

  it.runIf(process.env.AGENTHUB_BROWSER_E2E === '1')('blocks page-initiated cross-origin requests before transport', async () => {
    let trapHits = 0;
    const trap = createServer((_request, response) => {
      trapHits += 1;
      response.writeHead(204).end();
    });
    await new Promise<void>((resolve, reject) => {
      trap.once('error', reject);
      trap.listen(0, '127.0.0.1', resolve);
    });
    const address = trap.address();
    const trapPort = typeof address === 'object' && address ? address.port : 0;
    const root = await mkdtemp(path.join(tmpdir(), 'agenthub-acceptance-egress-'));
    temporaryRoots.push(root);
    const html = `<main>egress fixture</main><script>fetch('http://127.0.0.1:${trapPort}/write',{method:'POST'}).catch(()=>{});</script>`;
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { preview: 'node preview.mjs' } }), 'utf8');
    await writeFile(path.join(root, 'preview.mjs'), [
      "import http from 'node:http';",
      `const html = ${JSON.stringify(html)};`,
      "const server = http.createServer((_request, response) => { response.writeHead(200, {'content-type':'text/html'}); response.end(html); });",
      "server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/`));",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
      '',
    ].join('\n'), 'utf8');
    const runtime = createDevelopmentAcceptanceRuntime();
    try {
      const result = await runtime.run({
        root,
        availableScripts: ['preview'],
        plan: { scriptId: 'preview', route: '/', waitAfterLoadMs: 500, actions: [{ type: 'assert-visible', selector: 'main' }] },
      });
      expect(result.status).toBe('failed');
      expect(result.failedRequestCount).toBe(2);
      expect(result.viewports.every((viewport) => viewport.failures.includes('failed-requests:1'))).toBe(true);
      const diagnostics = result.viewports.flatMap((viewport) => viewport.diagnostics);
      expect(diagnostics.filter((item) => /^blocked-external-request:[a-f0-9]{12}$/.test(item))).toHaveLength(2);
      expect(diagnostics.join(' ')).not.toContain(String(trapPort));
      expect(diagnostics.join(' ')).not.toContain('http://');
      expect(trapHits).toBe(0);
    } finally {
      await runtime.dispose();
      await new Promise<void>((resolve, reject) => trap.close((error) => (error ? reject(error) : resolve())));
    }
  }, 30_000);
});
