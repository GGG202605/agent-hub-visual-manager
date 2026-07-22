import type {
  SelectedFileImportDocumentKind,
  SelectedFileImportRecord,
  SelectedFileImportSafetyWarning,
  SelectedFileImportViewModel,
} from '../types';

const allowedExtensions = ['.md', '.json', '.txt'];
const maxFileCount = 20;
const maxTotalBytes = 1024 * 1024;

const emptyCategories: Record<SelectedFileImportDocumentKind, number> = {
  'project-state': 0,
  task: 0,
  run: 0,
  review: 0,
  goal: 0,
  receipt: 0,
  'next-decision': 0,
  boundary: 0,
  unknown: 0,
};

export async function parseSelectedAgentHubFiles(files: FileList | File[]): Promise<SelectedFileImportViewModel> {
  const selectedFiles = Array.from(files);
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  if (selectedFiles.length === 0) {
    return createViewModel({
      acceptedFiles: [],
      blockedFiles: [],
      safetyWarnings: createPolicyWarnings(),
      state: 'idle',
      totalSelectedFiles: 0,
      totalBytes: 0,
      warnings: ['No files selected.'],
    });
  }

  if (selectedFiles.length > maxFileCount) {
    return createViewModel({
      acceptedFiles: [],
      blockedFiles: selectedFiles.map((file) => ({
        fileName: safeFileName(file),
        reason: `blocked: file count ${selectedFiles.length} exceeds limit ${maxFileCount}; no selected content was parsed`,
      })),
      safetyWarnings: [
        createBlockedSelectionWarning('file_count_limit', `Selected ${selectedFiles.length} files; limit is ${maxFileCount}.`),
      ],
      state: 'blocked',
      totalSelectedFiles: selectedFiles.length,
      totalBytes,
      warnings: ['Selected-file import blocked because the file count exceeds the browser-only pilot limit.'],
    });
  }

  if (totalBytes > maxTotalBytes) {
    return createViewModel({
      acceptedFiles: [],
      blockedFiles: selectedFiles.map((file) => ({
        fileName: safeFileName(file),
        reason: `blocked: total selected bytes ${totalBytes} exceeds 1 MB; no selected content was parsed`,
      })),
      safetyWarnings: [
        createBlockedSelectionWarning('total_size_limit', `Selected ${totalBytes} bytes; limit is ${maxTotalBytes}.`),
      ],
      state: 'blocked',
      totalSelectedFiles: selectedFiles.length,
      totalBytes,
      warnings: ['Selected-file import blocked because total selected bytes exceed 1 MB.'],
    });
  }

  const acceptedFiles: SelectedFileImportRecord[] = [];
  const blockedFiles: Array<{ fileName: string; reason: string }> = [];
  const detectedWarnings: SelectedFileImportSafetyWarning[] = [];
  const seenNames = new Set<string>();

  for (const file of selectedFiles) {
    const fileName = safeFileName(file);
    const extension = getExtension(fileName);
    const normalizedName = fileName.toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      blockedFiles.push({
        fileName,
        reason: `blocked: unsupported extension "${extension || 'none'}"; only .md, .json, and .txt are allowed`,
      });
      detectedWarnings.push(createBlockedSelectionWarning('unsupported_extension', `${fileName} was skipped before parsing.`));
      continue;
    }

    if (seenNames.has(normalizedName)) {
      detectedWarnings.push({
        warningId: 'duplicate_signal',
        severity: 'warning',
        label: 'duplicate file name signal',
        detail: 'A duplicate selected file name was detected. Treat repeated records as review material, not approval.',
        evidence: fileName,
      });
    }
    seenNames.add(normalizedName);

    let text = '';
    try {
      text = await file.text();
    } catch {
      blockedFiles.push({
        fileName,
        reason: 'blocked: browser could not read file text; no preview was created',
      });
      detectedWarnings.push(createBlockedSelectionWarning('read_failed', `${fileName} could not be read by browser File.text().`));
      continue;
    }

    if (text.trim().length === 0) {
      blockedFiles.push({
        fileName,
        reason: 'blocked: empty file has no previewable content',
      });
      detectedWarnings.push(createBlockedSelectionWarning('empty_file', `${fileName} contains no previewable text.`));
      continue;
    }

    const kind = detectKind(fileName, text);
    detectedWarnings.push(...detectSafetyWarnings(fileName, kind, text));
    acceptedFiles.push({
      fileName,
      kind,
      extension,
      byteSize: file.size,
      status: 'accepted_preview',
      sourceRef: `browser-selected-file://${encodeURIComponent(fileName)}`,
      taint: 'untrusted_user_selected_file',
      preview: createPreview(text),
    });
  }

  const state =
    acceptedFiles.length === 0
      ? 'blocked'
      : blockedFiles.length > 0
        ? 'partial'
        : 'parsed_preview';

  return createViewModel({
    acceptedFiles,
    blockedFiles,
    safetyWarnings: detectedWarnings.length > 0 ? detectedWarnings : createNoSignalWarnings(acceptedFiles),
    state,
    totalSelectedFiles: selectedFiles.length,
    totalBytes,
    warnings: [
      'Selected file content is untrusted data, not instruction.',
      'Import preview is not approval.',
      'Parsed output is a recommendation signal, not execution approval.',
      'Unsafe path, missing reference, duplicate, stale state, and unverifiable receipt signals must stay warnings for human review.',
    ],
  });
}

export function createEmptySelectedFileImportViewModel(): SelectedFileImportViewModel {
  return createViewModel({
    acceptedFiles: [],
    blockedFiles: [],
    safetyWarnings: createPolicyWarnings(),
    state: 'idle',
    totalSelectedFiles: 0,
    totalBytes: 0,
    warnings: ['Waiting for browser-selected synthetic .agent-hub files.'],
  });
}

function createViewModel({
  acceptedFiles,
  blockedFiles,
  safetyWarnings,
  state,
  totalSelectedFiles,
  totalBytes,
  warnings,
}: {
  acceptedFiles: SelectedFileImportRecord[];
  blockedFiles: Array<{ fileName: string; reason: string }>;
  safetyWarnings: SelectedFileImportSafetyWarning[];
  state: SelectedFileImportViewModel['state'];
  totalSelectedFiles: number;
  totalBytes: number;
  warnings: string[];
}): SelectedFileImportViewModel {
  const categories = acceptedFiles.reduce(
    (counts, file) => {
      counts[file.kind] += 1;
      return counts;
    },
    { ...emptyCategories },
  );

  return {
    importId: 'browser-only-selected-file-import-pilot-DemoScenario029',
    state,
    limits: {
      allowedExtensions,
      maxFileCount,
      maxTotalBytes,
    },
    selectedFileImportEnabled: true,
    browserOnlyImport: true,
    directoryPickerEnabled: false,
    fsAccess: false,
    backendImport: false,
    fileUploadImplemented: false,
    writePermission: false,
    executorPermission: false,
    gitPermission: false,
    npmPermission: false,
    wikiPermission: false,
    pushPermission: false,
    approvalGranted: false,
    parserOutputRole: 'recommendation_signal_only',
    totalSelectedFiles,
    totalBytes,
    acceptedFiles,
    blockedFiles,
    warnings,
    safetyWarnings: [
      {
        warningId: 'tainted_import_text',
        severity: 'warning',
        label: 'tainted imported text',
        detail: 'Imported file text is treated as untrusted data and cannot become an instruction.',
        evidence: 'taint=untrusted_user_selected_file; approval_granted=false',
      },
      ...safetyWarnings,
    ],
    categories,
    safetyFlags: [
      { label: 'selected_file_import_enabled', value: 'true' },
      { label: 'browser_only_import', value: 'true' },
      { label: 'directory_picker_enabled', value: 'false' },
      { label: 'fs_access', value: 'false' },
      { label: 'backend_import', value: 'false' },
      { label: 'write_permission', value: 'false' },
      { label: 'executor_permission', value: 'false' },
      { label: 'git_permission', value: 'false' },
      { label: 'npm_permission', value: 'false' },
      { label: 'wiki_permission', value: 'false' },
      { label: 'push_permission', value: 'false' },
    ],
  };
}

function safeFileName(file: File) {
  return file.name.replace(/[\\/]/g, '_');
}

function getExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

function detectKind(fileName: string, content: string): SelectedFileImportDocumentKind {
  const normalized = `${fileName}\n${content.slice(0, 500)}`.toLowerCase();

  if (normalized.includes('project-state')) return 'project-state';
  if (normalized.includes('next-decision')) return 'next-decision';
  if (normalized.includes('review-') || normalized.includes('/reviews/') || normalized.includes('ag-sec')) return 'review';
  if (normalized.includes('task-') || normalized.includes('/tasks/')) return 'task';
  if (normalized.includes('run-') || normalized.includes('/runs/')) return 'run';
  if (normalized.includes('receipt')) return 'receipt';
  if (normalized.includes('boundary') || normalized.includes('permission')) return 'boundary';
  if (normalized.includes('goal')) return 'goal';
  return 'unknown';
}

function detectSafetyWarnings(
  fileName: string,
  kind: SelectedFileImportDocumentKind,
  content: string,
): SelectedFileImportSafetyWarning[] {
  const normalized = `${fileName}\n${content.slice(0, 1200)}`.toLowerCase();
  const warnings: SelectedFileImportSafetyWarning[] = [];

  if (/[a-z]:\\|\\\\|\/users\/|\/home\/|\/var\/|\/tmp\/|\.agent-hub\/exports|cache|secret|token|ocr/.test(normalized)) {
    warnings.push({
      warningId: 'unsafe_path_signal',
      severity: 'warning',
      label: 'unsafe or sensitive path signal',
      detail: 'The preview contains path-like or sensitive-source wording. Do not resolve, read, import, or execute it.',
      evidence: createPreview(content),
    });
  }

  if (/\bmissing\b|missing[_-]|not found|缺失|不存在/.test(normalized)) {
    warnings.push({
      warningId: 'missing_reference_signal',
      severity: 'warning',
      label: 'missing reference signal',
      detail: 'Missing records are review signals only. They do not authorize filesystem reads or repair actions.',
      evidence: fileName,
    });
  }

  if (/\bduplicate\b|duplicate[_-]|duplicated|重复/.test(normalized)) {
    warnings.push({
      warningId: 'duplicate_signal',
      severity: 'warning',
      label: 'duplicate signal',
      detail: 'Duplicate IDs or records require human review and cannot be auto-merged.',
      evidence: fileName,
    });
  }

  if (/\bstale\b|stale[_-]|outdated|过期|陈旧/.test(normalized)) {
    warnings.push({
      warningId: 'stale_state_signal',
      severity: 'warning',
      label: 'stale state signal',
      detail: 'Stale status is advisory only and does not update baselines or approvals.',
      evidence: fileName,
    });
  }

  if ((kind === 'receipt' || /unverifiable[_-]?receipt|fake[_-]?receipt/.test(normalized)) && !/(sha256|hash|exit\s*code|commit|verified|验证)/.test(normalized)) {
    warnings.push({
      warningId: 'unverifiable_receipt_signal',
      severity: 'warning',
      label: 'unverifiable receipt signal',
      detail: 'Receipt-like content lacks verification evidence and must not be treated as executed proof.',
      evidence: fileName,
    });
  }

  return warnings;
}

function createPolicyWarnings(): SelectedFileImportSafetyWarning[] {
  return [
    {
      warningId: 'no_warning_signal_detected',
      severity: 'info',
      label: 'warning policy visible',
      detail: 'Unsafe path, missing reference, duplicate, stale state, and unverifiable receipt signals will be shown here after file selection.',
      evidence: 'policy_only_until_selection',
    },
  ];
}

function createNoSignalWarnings(acceptedFiles: SelectedFileImportRecord[]): SelectedFileImportSafetyWarning[] {
  return [
    {
      warningId: 'no_warning_signal_detected',
      severity: 'info',
      label: 'no unsafe warning signal detected',
      detail: 'No unsafe/missing/duplicate/stale/unverifiable receipt signal was detected in the accepted preview. The content remains tainted data.',
      evidence: `${acceptedFiles.length} accepted preview file(s)`,
    },
  ];
}

function createBlockedSelectionWarning(kind: string, evidence: string): SelectedFileImportSafetyWarning {
  return {
    warningId: 'unsupported_or_blocked_file',
    severity: 'blocked',
    label: `blocked selection: ${kind}`,
    detail: 'Blocked selections are not parsed and do not create approval, write, executor, Git, npm, Wiki, or push permission.',
    evidence,
  };
}

function createPreview(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact || 'empty file';
}
