export interface ProductLauncherCommand {
  action: 'start' | 'status' | 'stop';
  port: number;
  workspace: string;
  openBrowser: boolean;
}

export declare const AGENTHUB_BUILD_STAMP: string;
export declare const AGENTHUB_PRODUCT_PORT: 8794;
export declare function parseProductLauncherArgs(argv: string[], repoRoot: string):
  | { ok: true; command: ProductLauncherCommand }
  | { ok: false; error: string };
export declare function createBuildFingerprint(repoRoot: string): Promise<string>;
export declare function readBuildFreshness(repoRoot: string): Promise<{
  current: boolean;
  fingerprint: string;
  recorded: string;
}>;
export declare function writeBuildStamp(repoRoot: string, fingerprint: string): Promise<void>;
export declare function assertBuildFingerprintStable(before: string, after: string): string;
export declare function parseOperatorReceipt(stdout: string): Record<string, unknown>;
export declare function buildBrowserOpenCommand(platform: NodeJS.Platform, url: string): {
  executable: string;
  args: string[];
};
export declare function buildNpmInvocation(
  platform: NodeJS.Platform,
  comSpec: string,
  action: 'build' | 'install',
): { executable: string; args: string[] };
