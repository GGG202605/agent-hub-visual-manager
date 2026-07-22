export type DevelopmentAcceptanceScript =
  | 'preview'
  | 'dev'
  | 'start'
  | 'python-fastapi'
  | 'python-flask'
  | 'python-static';

export type DevelopmentAcceptanceAction =
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; key: 'Enter' | 'Escape' | 'Tab' | 'ArrowDown' | 'ArrowUp' | 'Space' }
  | { type: 'wait'; ms: number }
  | { type: 'assert-visible'; selector: string }
  | { type: 'assert-hidden'; selector: string }
  | { type: 'assert-absent'; selector: string }
  | { type: 'assert-text'; text: string }
  | { type: 'assert-text-absent'; text: string };

export interface DevelopmentAcceptancePlan {
  scriptId: DevelopmentAcceptanceScript;
  route: string;
  waitAfterLoadMs: number;
  actions: DevelopmentAcceptanceAction[];
}

export interface DevelopmentAcceptanceViewport {
  id: 'desktop' | 'mobile';
  width: number;
  height: number;
  documentWidth: number;
  documentHeight: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  failedRequestCount: number;
  failureCount: number;
  failures: string[];
  diagnostics: string[];
  screenshotSha256: string;
  screenshotDataUrl: string;
}

export interface DevelopmentAcceptanceResult {
  status: 'passed' | 'failed';
  scriptId: DevelopmentAcceptanceScript;
  planSha256: string;
  evidenceSha256: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  actionCount: number;
  viewportCount: number;
  consoleErrorCount: number;
  consoleWarningCount: number;
  failedRequestCount: number;
  failureCount: number;
  screenshotSha256: string[];
  viewports: DevelopmentAcceptanceViewport[];
}

export interface DevelopmentAcceptanceRuntime {
  run(input: {
    root: string;
    plan: unknown;
    availableScripts: string[];
  }): Promise<DevelopmentAcceptanceResult>;
  dispose(): Promise<void>;
}

export declare const DEVELOPMENT_ACCEPTANCE_SCRIPTS: readonly DevelopmentAcceptanceScript[];
export declare function chooseDevelopmentAcceptanceScript(availableScripts: unknown): DevelopmentAcceptanceScript | null;
export declare function isDevelopmentAcceptanceScript(value: unknown): value is DevelopmentAcceptanceScript;
export declare function isLoopbackAcceptanceUrl(value: unknown): boolean;
export declare function isDevelopmentAcceptanceRequestAllowed(value: unknown, targetValue: unknown): boolean;
export declare function formatDevelopmentBrowserDiagnostic(
  message: unknown,
  sourceUrl: unknown,
  targetUrl: unknown,
): string;
export declare function normalizeDevelopmentAcceptancePlan(
  value: unknown,
  availableScripts: unknown,
): DevelopmentAcceptancePlan;
export declare function resolveDevelopmentAcceptanceService(
  root: string,
  scriptId: DevelopmentAcceptanceScript,
): Promise<{ command: string; args: string[]; env: Record<string, string> }>;
export declare function createDevelopmentAcceptanceRuntime(options?: {
  browserExecutable?: string;
  browserRunner?: (input: Record<string, unknown>) => Promise<{ status: 'passed' | 'failed'; viewports: DevelopmentAcceptanceViewport[] }>;
  spawnProcess?: (...args: any[]) => any;
}): DevelopmentAcceptanceRuntime;
