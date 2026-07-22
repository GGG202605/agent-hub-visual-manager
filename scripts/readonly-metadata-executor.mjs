import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ALLOWED_REPO = 'D:\\Projects\\agent-hub-demo';
const ALLOWED_CWD = ALLOWED_REPO;
const DEFAULT_TIMEOUT_MS = 10000;

const COMMAND_ALLOWLIST = Object.freeze([
  Object.freeze({
    id: 'git_status_short',
    label: 'git status --short',
    executable: 'git',
    argv: Object.freeze(['status', '--short']),
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
  }),
  Object.freeze({
    id: 'git_status_branch',
    label: 'git status -sb',
    executable: 'git',
    argv: Object.freeze(['status', '-sb']),
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
  }),
  Object.freeze({
    id: 'git_rev_parse_head',
    label: 'git rev-parse HEAD',
    executable: 'git',
    argv: Object.freeze(['rev-parse', 'HEAD']),
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
  }),
  Object.freeze({
    id: 'git_branch_show_current',
    label: 'git branch --show-current',
    executable: 'git',
    argv: Object.freeze(['branch', '--show-current']),
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
  }),
  Object.freeze({
    id: 'git_diff_cached_name_only',
    label: 'git diff --cached --name-only',
    executable: 'git',
    argv: Object.freeze(['diff', '--cached', '--name-only']),
    shell: false,
    cwdPolicy: 'fixed_allowed_cwd',
    mutationRisk: 'read_only_metadata',
  }),
]);

const COMMANDS_BY_ID = Object.freeze(Object.fromEntries(COMMAND_ALLOWLIST.map((command) => [command.id, command])));

const DEFAULT_EXECUTION_PLAN = Object.freeze([
  Object.freeze(['baseline_status_short', 'git_status_short']),
  Object.freeze(['baseline_head', 'git_rev_parse_head']),
  Object.freeze(['baseline_staged', 'git_diff_cached_name_only']),
  Object.freeze(['branch_status', 'git_status_branch']),
  Object.freeze(['branch_name', 'git_branch_show_current']),
  Object.freeze(['post_status_short', 'git_status_short']),
  Object.freeze(['post_head', 'git_rev_parse_head']),
  Object.freeze(['post_staged', 'git_diff_cached_name_only']),
]);

const FORBIDDEN_ACTIONS = Object.freeze([
  'shell mode',
  'command concatenation',
  'pipe or redirect',
  'glob expansion',
  'fallback command',
  'write',
  'stage',
  'commit',
  'push',
  'npm',
  'dependency install',
  'backend filesystem read',
  'local path traversal',
  'private knowledge base action',
]);

const PERMISSIONS = Object.freeze({
  shell: false,
  write: false,
  stage: false,
  commit: false,
  push: false,
  npm: false,
  backendFsRead: false,
  localPathRead: false,
});

const STOP_RETRY_POLICY = Object.freeze([
  Object.freeze({
    condition: 'command mismatch',
    receipt_status: 'blocked_command_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Requested command IDs must exactly match the hardcoded allowlist descriptors.',
  }),
  Object.freeze({
    condition: 'cwd mismatch',
    receipt_status: 'blocked_cwd_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Execution cwd must equal the single fixed allowed cwd.',
  }),
  Object.freeze({
    condition: 'dirty repo',
    receipt_status: 'blocked_dirty_repo',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Preflight status must be empty before execution proceeds.',
  }),
  Object.freeze({
    condition: 'staged files',
    receipt_status: 'blocked_staged_files',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Preflight staged file list must be empty before execution proceeds.',
  }),
  Object.freeze({
    condition: 'command timeout',
    receipt_status: 'failed_command_timeout',
    outcome: 'failed',
    retry: 'manual_reauthorization_required',
    evidence: 'Timeout failure stops the run; any retry needs a new user decision.',
  }),
  Object.freeze({
    condition: 'command exit nonzero',
    receipt_status: 'failed_command_exit_nonzero',
    outcome: 'failed',
    retry: 'not_automatic',
    evidence: 'Nonzero exit creates a failed receipt and no automatic retry.',
  }),
  Object.freeze({
    condition: 'receipt missing fields',
    receipt_status: 'unverifiable_missing_receipt_fields',
    outcome: 'unverifiable',
    retry: 'not_allowed',
    evidence: 'Receipt QA requires all mandatory fields before success can be claimed.',
  }),
  Object.freeze({
    condition: 'pre/post HEAD mismatch',
    receipt_status: 'blocked_head_mismatch',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'HEAD must remain unchanged through execution.',
  }),
  Object.freeze({
    condition: 'pre/post status unexpected',
    receipt_status: 'blocked_status_unexpected',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Post status and staged state must match the clean preflight.',
  }),
  Object.freeze({
    condition: 'redaction failure',
    receipt_status: 'blocked_redaction_failure',
    outcome: 'blocked',
    retry: 'not_allowed',
    evidence: 'Receipt output must be summarizable without secrets, raw data, or out-of-scope paths.',
  }),
]);

const RECEIPT_QA_REQUIRED_FIELDS = Object.freeze([
  'approval_id',
  'executor_mode',
  'allowed_cwd',
  'requested_commands',
  'executed_commands',
  'exit_codes',
  'baseline_head',
  'current_head',
  'branch',
  'status_summary',
  'staged_summary',
  'zero_mutation_assertion',
  'receipt_status',
  'stop_checks',
  'redaction_status',
]);

const HARDENING_SCENARIOS = Object.freeze([
  Object.freeze({ scenario: 'command mismatch', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'cwd mismatch', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'dirty repo', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'staged files', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'command timeout', outcome: 'failed', retry: 'manual_reauthorization_required' }),
  Object.freeze({ scenario: 'command exit nonzero', outcome: 'failed', retry: 'not_automatic' }),
  Object.freeze({ scenario: 'receipt missing fields', outcome: 'unverifiable', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'pre/post HEAD mismatch', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'pre/post status unexpected', outcome: 'blocked', retry: 'not_allowed' }),
  Object.freeze({ scenario: 'redaction failure', outcome: 'blocked', retry: 'not_allowed' }),
]);

export function createReadonlyMetadataExecutorContractSnapshot() {
  return {
    readonly_metadata_executor_prototype: true,
    prototype_implemented: true,
    prototype_executed: false,
    executor_executed: false,
    allowed_repo: ALLOWED_REPO,
    allowed_cwd: ALLOWED_CWD,
    allowed_commands_count: COMMAND_ALLOWLIST.length,
    command_allowlist: COMMAND_ALLOWLIST.map(copyCommand),
    permissions: PERMISSIONS,
    forbidden_actions: [...FORBIDDEN_ACTIONS],
    spawn_policy: {
      shell: false,
      executable_plus_argv_only: true,
      fallback_command: false,
      timeout_ms: DEFAULT_TIMEOUT_MS,
    },
    stop_retry_policy: STOP_RETRY_POLICY.map(copyPolicyItem),
    receipt_qa_required_fields: [...RECEIPT_QA_REQUIRED_FIELDS],
    hardening_scenarios: HARDENING_SCENARIOS.map((scenario) => ({ ...scenario })),
    status_message: 'Prototype exists and DemoScenario043 hardening policy is defined',
    next_gate_message: 'Write executor and push require a separate future approval',
  };
}

export function createReadonlyMetadataNotExecutedReceipt() {
  return {
    receipt_status: 'not_executed_prototype',
    prototype_implemented: true,
    prototype_executed: false,
    executor_executed: false,
    allowed_repo: ALLOWED_REPO,
    allowed_cwd: ALLOWED_CWD,
    allowed_commands_count: COMMAND_ALLOWLIST.length,
    executed_command_count: 0,
    files_changed_count: 0,
    command_results: [],
    no_file_change_assertion: true,
    output_summary_placeholder:
      'No command output exists in this preview because it is a contract snapshot.',
    redaction_hooks: [
      'summarize stdout/stderr before UI display',
      'redact absolute paths outside the fixed allowed repo',
      'redact secrets, tokens, caches, exports, and raw local data references',
    ],
    stop_condition:
      'Stop before execution when command, cwd, dirty state, staged state, mutation, redaction, or receipt QA checks fail.',
    stop_retry_policy: STOP_RETRY_POLICY.map(copyPolicyItem),
    receipt_qa_required_fields: [...RECEIPT_QA_REQUIRED_FIELDS],
    hardening_scenarios: HARDENING_SCENARIOS.map((scenario) => ({ ...scenario })),
  };
}

export function runReadonlyMetadataExecutor({
  approvalId,
  baselineHead,
  requestedCommandIds = DEFAULT_EXECUTION_PLAN.map(([, id]) => id),
  allowedCwd = ALLOWED_CWD,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const requestedPlan = DEFAULT_EXECUTION_PLAN.map(([step, id], index) => [step, requestedCommandIds[index]]);
  const requestedCommands = requestedCommandIds.map((id) => COMMANDS_BY_ID[id]?.label ?? `unknown:${id}`);
  const base = {
    receipt_id: `DemoScenario043-HARDENING-${new Date().toISOString()}`,
    approval_id: approvalId ?? 'missing_approval_id',
    executor_mode: 'read_only_metadata_executor_v0_1',
    allowed_repo: ALLOWED_REPO,
    allowed_cwd: allowedCwd,
    requested_commands: requestedCommands,
    executed_commands: [],
    actual_commands: [],
    command_exit_codes: {},
    command_results: [],
    redaction_status: 'not_checked',
    stop_checks: createBaseStopChecks(allowedCwd, requestedCommandIds),
    stop_retry_policy: STOP_RETRY_POLICY.map(copyPolicyItem),
    receipt_qa_required_fields: [...RECEIPT_QA_REQUIRED_FIELDS],
    hardening_scenarios: HARDENING_SCENARIOS.map((scenario) => ({ ...scenario })),
  };

  const stopFailure = firstStopFailure(base.stop_checks);
  if (stopFailure) {
    return finalizeReceipt({
      ...base,
      receipt_status: stopFailure.receipt_status,
      zero_mutation_assertion: false,
      retry_policy: stopFailure.retry,
      stop_reason: stopFailure.condition,
    });
  }

  const executed = [];
  for (const [step, id] of requestedPlan) {
    const command = COMMANDS_BY_ID[id];
    if (!command) {
      return finalizeReceipt({
        ...base,
        receipt_status: 'blocked_command_mismatch',
        zero_mutation_assertion: false,
        retry_policy: 'not_allowed',
        stop_reason: 'command mismatch',
        command_results: executed,
      });
    }

    const result = spawnSync(command.executable, command.argv, {
      cwd: allowedCwd,
      shell: false,
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const commandResult = {
      step,
      id: command.id,
      command: command.label,
      executable: command.executable,
      argv: [...command.argv],
      shell: false,
      cwd: allowedCwd,
      exit_code: result.status,
      signal: result.signal,
      stdout: summarizeOutput(result.stdout),
      stderr_summary: summarizeOutput(result.stderr),
    };
    executed.push(commandResult);

    if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
      return finalizeReceipt({
        ...base,
        receipt_status: 'failed_command_timeout',
        zero_mutation_assertion: false,
        retry_policy: 'manual_reauthorization_required',
        stop_reason: 'command timeout',
        command_results: executed,
      });
    }
    if (result.status !== 0) {
      return finalizeReceipt({
        ...base,
        receipt_status: 'failed_command_exit_nonzero',
        zero_mutation_assertion: false,
        retry_policy: 'not_automatic',
        stop_reason: 'command exit nonzero',
        command_results: executed,
      });
    }

    if (step === 'baseline_status_short' && commandResult.stdout !== '') {
      return finalizeReceipt({
        ...base,
        receipt_status: 'blocked_dirty_repo',
        zero_mutation_assertion: false,
        retry_policy: 'not_allowed',
        stop_reason: 'dirty repo',
        command_results: executed,
      });
    }
    if (step === 'baseline_staged' && commandResult.stdout !== '') {
      return finalizeReceipt({
        ...base,
        receipt_status: 'blocked_staged_files',
        zero_mutation_assertion: false,
        retry_policy: 'not_allowed',
        stop_reason: 'staged files',
        command_results: executed,
      });
    }
  }

  const byStep = Object.fromEntries(executed.map((item) => [item.step, item]));
  const preHead = byStep.baseline_head?.stdout ?? '';
  const postHead = byStep.post_head?.stdout ?? '';
  const preStatus = byStep.baseline_status_short?.stdout ?? '';
  const postStatus = byStep.post_status_short?.stdout ?? '';
  const preStaged = byStep.baseline_staged?.stdout ?? '';
  const postStaged = byStep.post_staged?.stdout ?? '';
  const expectedHead = baselineHead ?? preHead;

  if (preHead !== expectedHead || postHead !== expectedHead) {
    return finalizeReceipt({
      ...base,
      receipt_status: 'blocked_head_mismatch',
      zero_mutation_assertion: false,
      retry_policy: 'not_allowed',
      stop_reason: 'pre/post HEAD mismatch',
      command_results: executed,
    });
  }
  if (preStatus !== '' || postStatus !== '' || preStaged !== '' || postStaged !== '') {
    return finalizeReceipt({
      ...base,
      receipt_status: 'blocked_status_unexpected',
      zero_mutation_assertion: false,
      retry_policy: 'not_allowed',
      stop_reason: 'pre/post status unexpected',
      command_results: executed,
    });
  }

  const redactionStatus = validateRedaction(executed);
  if (redactionStatus !== 'pass') {
    return finalizeReceipt({
      ...base,
      receipt_status: 'blocked_redaction_failure',
      zero_mutation_assertion: false,
      retry_policy: 'not_allowed',
      stop_reason: 'redaction failure',
      command_results: executed,
      redaction_status: redactionStatus,
    });
  }

  return finalizeReceipt({
    ...base,
    receipt_status: 'executed_readonly_metadata_zero_mutation',
    baseline_head: preHead,
    current_head: postHead,
    branch: byStep.branch_name?.stdout ?? '',
    status_summary: 'clean',
    staged_summary: 'empty',
    zero_mutation_assertion: true,
    retry_policy: 'not_needed',
    command_results: executed,
    redaction_status: 'pass',
    mutation_checks: {
      baseline_status_short: preStatus,
      post_status_short: postStatus,
      baseline_staged: preStaged,
      post_staged: postStaged,
      baseline_head: preHead,
      post_head: postHead,
    },
  });
}

export function runReadonlyMetadataExecutorPrototype() {
  return createReadonlyMetadataNotExecutedReceipt();
}

function finalizeReceipt(receipt) {
  const commandResults = receipt.command_results ?? [];
  const withSummaries = {
    baseline_head: '',
    current_head: '',
    branch: '',
    status_summary: 'unknown',
    staged_summary: 'unknown',
    mutation_checks: {
      baseline_status_short: '',
      post_status_short: '',
      baseline_staged: '',
      post_staged: '',
      baseline_head: '',
      post_head: '',
    },
    ...receipt,
    executed_commands: commandResults.map((item) => item.command),
    actual_commands: commandResults.map((item) => item.command),
    command_exit_codes: Object.fromEntries(commandResults.map((item) => [item.step, item.exit_code])),
  };
  const receiptQa = runReceiptQa(withSummaries);
  const missingFields = receiptQa.filter((check) => check.status !== 'pass');
  if (missingFields.length > 0 && withSummaries.receipt_status === 'executed_readonly_metadata_zero_mutation') {
    withSummaries.receipt_status = 'unverifiable_missing_receipt_fields';
    withSummaries.zero_mutation_assertion = false;
    withSummaries.retry_policy = 'not_allowed';
    withSummaries.stop_reason = 'receipt missing fields';
  }
  return {
    ...withSummaries,
    receipt_qa_checks: receiptQa,
    receipt_qa_status: missingFields.length === 0 ? 'pass' : 'unverifiable',
  };
}

function createBaseStopChecks(allowedCwd, requestedCommandIds) {
  const labels = new Set(COMMAND_ALLOWLIST.map((command) => command.label));
  const planIds = DEFAULT_EXECUTION_PLAN.map(([, id]) => id);
  const commandMismatch =
    requestedCommandIds.some((id) => COMMANDS_BY_ID[id] == null) ||
    requestedCommandIds.length !== planIds.length ||
    requestedCommandIds.some((id, index) => id !== planIds[index]);
  return {
    allowed_cwd_fixed: allowedCwd === ALLOWED_CWD,
    allowlist_exact: COMMAND_ALLOWLIST.every((command) => labels.has(command.label)) && COMMAND_ALLOWLIST.length === labels.size,
    requested_commands_match_allowlist: !commandMismatch,
    requested_commands_match_fixed_plan: !commandMismatch,
    no_shell_mode: COMMAND_ALLOWLIST.every((command) => command.shell === false),
    executable_plus_argv_only: true,
    fallback_command_disabled: true,
    no_write_stage_commit_push: COMMAND_ALLOWLIST.every((command) => !['add', 'commit', 'push'].includes(command.argv[0])),
    no_shell_metacharacters: COMMAND_ALLOWLIST.every((command) =>
      command.argv.every((part) => !part.includes('|') && !part.includes('>') && !part.includes('<') && !part.includes('*') && !part.includes('?')),
    ),
  };
}

function firstStopFailure(stopChecks) {
  if (!stopChecks.requested_commands_match_allowlist || !stopChecks.allowlist_exact) {
    return STOP_RETRY_POLICY.find((item) => item.condition === 'command mismatch');
  }
  if (!stopChecks.allowed_cwd_fixed) {
    return STOP_RETRY_POLICY.find((item) => item.condition === 'cwd mismatch');
  }
  if (!stopChecks.no_shell_mode || !stopChecks.executable_plus_argv_only || !stopChecks.fallback_command_disabled || !stopChecks.no_shell_metacharacters) {
    return STOP_RETRY_POLICY.find((item) => item.condition === 'command mismatch');
  }
  return undefined;
}

function runReceiptQa(receipt) {
  return RECEIPT_QA_REQUIRED_FIELDS.map((field) => ({
    field,
    status: hasReceiptField(receipt, field) ? 'pass' : 'missing',
  }));
}

function hasReceiptField(receipt, field) {
  const mappedField = field === 'exit_codes' ? 'command_exit_codes' : field;
  const value = receipt[mappedField];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return value !== undefined && value !== null && value !== '';
}

function validateRedaction(results) {
  const combined = results.map((result) => `${result.stdout}\n${result.stderr_summary}`).join('\n');
  if (/token|secret|password|D:\\\\private-data|D:\\\\private knowledge base/i.test(combined)) {
    return 'blocked_redaction_failure';
  }
  return 'pass';
}

function summarizeOutput(value) {
  return String(value ?? '').trim().slice(0, 2000);
}

function copyCommand(command) {
  return {
    ...command,
    argv: [...command.argv],
  };
}

function copyPolicyItem(item) {
  return { ...item };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const receipt = runReadonlyMetadataExecutor({
    approvalId: 'manual-direct-run-requires-user-approval',
  });
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(receipt.receipt_status === 'executed_readonly_metadata_zero_mutation' ? 0 : 2);
}
