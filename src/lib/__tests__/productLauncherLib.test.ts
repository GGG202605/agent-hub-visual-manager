/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AGENTHUB_BUILD_STAMP,
  AGENTHUB_PRODUCT_PORT,
  assertBuildFingerprintStable,
  buildBrowserOpenCommand,
  buildNpmInvocation,
  createBuildFingerprint,
  parseOperatorReceipt,
  parseProductLauncherArgs,
  readBuildFreshness,
  writeBuildStamp,
} from '../../../scripts/productLauncherLib.mjs';

const roots = new Set<string>();

async function createProductRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'agenthub-product-launcher-test-'));
  roots.add(root);
  await Promise.all([
    mkdir(path.join(root, 'src'), { recursive: true }),
    mkdir(path.join(root, 'public'), { recursive: true }),
    mkdir(path.join(root, 'dist'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<main>v1</main>\n', 'utf8'),
    writeFile(path.join(root, 'package.json'), '{"scripts":{"build":"vite build"}}\n', 'utf8'),
    writeFile(path.join(root, 'package-lock.json'), '{}\n', 'utf8'),
    writeFile(path.join(root, 'tsconfig.json'), '{}\n', 'utf8'),
    writeFile(path.join(root, 'tsconfig.node.json'), '{}\n', 'utf8'),
    writeFile(path.join(root, 'vite.config.ts'), 'export default {}\n', 'utf8'),
    writeFile(path.join(root, 'src', 'main.ts'), 'export const value = 1;\n', 'utf8'),
    writeFile(path.join(root, 'public', 'asset.txt'), 'asset-v1\n', 'utf8'),
    writeFile(path.join(root, 'dist', 'index.html'), '<main>built</main>\n', 'utf8'),
  ]);
  return root;
}

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.clear();
});

describe('product launcher argument boundary', () => {
  it('defaults a one-click start to the AgentHub repository and opens the browser', () => {
    const root = path.resolve('synthetic-agenthub-root');
    expect(parseProductLauncherArgs(['start'], root)).toEqual({
      ok: true,
      command: { action: 'start', port: 8794, workspace: root, openBrowser: true },
    });
    expect(parseProductLauncherArgs([
      'start', '--workspace', 'D:\\Projects\\demo', '--port', '43123', '--no-open',
    ], root)).toMatchObject({
      ok: true,
      command: { action: 'start', port: 43123, workspace: path.resolve('D:\\Projects\\demo'), openBrowser: false },
    });
  });

  it('keeps stop/status bounded and rejects unknown, duplicate or incomplete options', () => {
    const root = path.resolve('synthetic-agenthub-root');
    expect(parseProductLauncherArgs(['status'], root)).toEqual({
      ok: true,
      command: { action: 'status', port: 8794, workspace: '', openBrowser: false },
    });
    expect(parseProductLauncherArgs(['stop', '--port', '43123'], root)).toMatchObject({ ok: true });
    expect(AGENTHUB_PRODUCT_PORT).toBe(8794);
    expect(parseProductLauncherArgs(['stop', '--workspace', root], root)).toMatchObject({ ok: false });
    expect(parseProductLauncherArgs(['start', '--no-open', '--no-open'], root)).toMatchObject({ ok: false });
    expect(parseProductLauncherArgs(['start', '--workspace'], root)).toMatchObject({ ok: false });
    expect(parseProductLauncherArgs(['start', '--unsafe'], root)).toMatchObject({ ok: false });
  });

  it('keeps the Windows entry points zero-prompt and on the managed product launcher', async () => {
    const [startBatch, stopBatch] = await Promise.all([
      readFile(path.join(process.cwd(), 'start-all.bat'), 'utf8'),
      readFile(path.join(process.cwd(), 'stop-all.bat'), 'utf8'),
    ]);
    expect(startBatch).toContain('node scripts\\product-launcher.mjs start');
    expect(startBatch).not.toContain('set /p');
    expect(startBatch).not.toContain('server\\server.mjs');
    expect(stopBatch).toContain('node scripts\\product-launcher.mjs stop');
  });
});

describe('content-addressed product build freshness', () => {
  it('allows Vite projects without an optional public directory and tracks it once added', async () => {
    const root = await createProductRoot();
    await rm(path.join(root, 'public'), { recursive: true });

    const withoutPublic = await createBuildFingerprint(root);
    await writeBuildStamp(root, withoutPublic);
    expect(await readBuildFreshness(root)).toMatchObject({ current: true, fingerprint: withoutPublic });

    await mkdir(path.join(root, 'public'));
    await writeFile(path.join(root, 'public', 'asset.txt'), 'asset-v1\n', 'utf8');
    expect((await readBuildFreshness(root)).fingerprint).not.toBe(withoutPublic);
  });

  it('reuses an exact built fingerprint and invalidates it on source changes only', async () => {
    const root = await createProductRoot();
    const first = await createBuildFingerprint(root);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await readBuildFreshness(root)).toMatchObject({ current: false, fingerprint: first });

    await writeBuildStamp(root, first);
    expect(await readBuildFreshness(root)).toEqual({ current: true, fingerprint: first, recorded: first });
    expect(await createBuildFingerprint(root)).toBe(first);

    await writeFile(path.join(root, 'dist', 'ignored.js'), 'new output only\n', 'utf8');
    expect(await readBuildFreshness(root)).toMatchObject({ current: true, fingerprint: first });

    await writeFile(path.join(root, 'src', 'main.ts'), 'export const value = 2;\n', 'utf8');
    const changed = await readBuildFreshness(root);
    expect(changed.current).toBe(false);
    expect(changed.fingerprint).not.toBe(first);
    expect(changed.recorded).toBe(first);
    expect(AGENTHUB_BUILD_STAMP).toBe(path.join('dist', '.agenthub-build-input.sha256'));
    expect(assertBuildFingerprintStable(first, first)).toBe(first);
    expect(() => assertBuildFingerprintStable(first, changed.fingerprint)).toThrow('构建期间输入发生变化');
  });
});

describe('operator and browser handoff', () => {
  it('accepts only a JSON operator receipt and uses shell-free browser commands', () => {
    expect(parseOperatorReceipt('{"ok":true,"status":"started"}')).toEqual({ ok: true, status: 'started' });
    expect(() => parseOperatorReceipt('')).toThrow('本地服务未返回回执');
    expect(() => parseOperatorReceipt('not-json')).toThrow('本地服务回执不是合法 JSON');
    expect(buildBrowserOpenCommand('win32', 'http://127.0.0.1:8787')).toEqual({
      executable: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', 'http://127.0.0.1:8787'],
    });
    expect(buildBrowserOpenCommand('darwin', 'http://127.0.0.1:8787').executable).toBe('open');
    expect(buildBrowserOpenCommand('linux', 'http://127.0.0.1:8787').executable).toBe('xdg-open');
  });

  it('uses the Windows command processor only for exact fixed npm actions', () => {
    expect(buildNpmInvocation('win32', 'C:\\Windows\\System32\\cmd.exe', 'build')).toEqual({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd run build'],
    });
    const installArgs = buildNpmInvocation('win32', '', 'install').args;
    expect(installArgs[installArgs.length - 1]).toBe('npm.cmd ci --ignore-scripts --no-audit --no-fund');
    expect(buildNpmInvocation('linux', '', 'build')).toEqual({ executable: 'npm', args: ['run', 'build'] });
    expect(() => buildNpmInvocation('win32', '', 'publish' as never)).toThrow('固定 npm 动作非法');
  });
});
