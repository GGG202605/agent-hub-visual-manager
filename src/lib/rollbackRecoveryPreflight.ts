import type {
  RollbackApprovalPacket,
  RollbackPreflightReceipt,
  RollbackReceiptTemplate,
  RollbackReceiptValidatorEvidence,
  RollbackStopCheck,
  RollbackTargetMetadata,
} from '../types';

interface RollbackPreflightInput {
  packet: RollbackApprovalPacket;
  targetMetadata: RollbackTargetMetadata;
  expectedRepo: string;
  expectedCwd: string;
}

interface RollbackReceiptValidationInput {
  packet: RollbackApprovalPacket;
  receipt: RollbackReceiptTemplate;
}

const hasText = (value: string) => value.trim().length > 0;

function isExactRepoRelativeFilePath(path: string) {
  if (!hasText(path)) {
    return false;
  }

  const normalized = path.split('\\').join('/');
  return (
    normalized === path &&
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !normalized.includes('..') &&
    !normalized.includes('*') &&
    !normalized.endsWith('/') &&
    normalized.includes('/') &&
    /\.[^/.]+$/.test(normalized)
  );
}

function matchesForbiddenPath(path: string, forbiddenPattern: string) {
  const normalizedPath = path.split('\\').join('/');
  const normalizedPattern = forbiddenPattern.split('\\').join('/');

  if (normalizedPattern.endsWith('/**')) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -3));
  }

  if (normalizedPattern === 'src/**/*.css') {
    return normalizedPath.startsWith('src/') && normalizedPath.endsWith('.css');
  }

  if (normalizedPattern === 'vite.config.*') {
    return normalizedPath.startsWith('vite.config.');
  }

  if (normalizedPattern === 'tsconfig*.json') {
    return normalizedPath.startsWith('tsconfig') && normalizedPath.endsWith('.json');
  }

  if (normalizedPattern === '.env*') {
    return normalizedPath.startsWith('.env');
  }

  return normalizedPath === normalizedPattern;
}

function check(id: string, label: string, passed: boolean, evidence: string): RollbackStopCheck {
  return {
    id,
    label,
    status: passed ? 'pass' : 'blocked',
    evidence,
  };
}

export const ROLLBACK_RECEIPT_REQUIRED_FIELDS = [
  'approval_id',
  'rollback_mode',
  'target_paths',
  'pre_rollback_hash',
  'post_rollback_hash',
  'changed_files',
  'diff_summary',
  'zero_extra_mutation_assertion',
  'staged_status',
  'receipt_status',
  'verification_status',
  'recovery_note',
] as const;

export function runRollbackRecoveryPreflight({
  packet,
  targetMetadata,
  expectedRepo,
  expectedCwd,
}: RollbackPreflightInput): RollbackPreflightReceipt {
  const targetPathsAreExact = packet.allowed_target_paths.every(isExactRepoRelativeFilePath);
  const targetPathApproved = packet.allowed_target_paths.includes(targetMetadata.path);
  const targetForbidden = packet.forbidden_paths.some((pattern) =>
    matchesForbiddenPath(targetMetadata.path, pattern),
  );
  const rollbackTypeLegal =
    packet.rollback_type === 'restore_preimage' || packet.rollback_type === 'delete_created_file';

  const stop_checks: RollbackStopCheck[] = [
    check('approval_id_present', 'approval_id exists', hasText(packet.approval_id), packet.approval_id),
    check(
      'allowed_repo_matches',
      'allowed_repo matches expected repo',
      packet.allowed_repo === expectedRepo,
      packet.allowed_repo,
    ),
    check(
      'allowed_cwd_matches',
      'allowed_cwd matches expected cwd',
      packet.allowed_cwd === expectedCwd,
      packet.allowed_cwd,
    ),
    check(
      'rollback_target_exact_file_path',
      'rollback target is an exact repo-relative file path',
      targetPathsAreExact,
      packet.allowed_target_paths.join(', '),
    ),
    check(
      'rollback_target_allowed',
      'rollback target appears in allowed_target_paths',
      targetPathApproved,
      targetMetadata.path,
    ),
    check(
      'rollback_target_not_forbidden',
      'rollback target does not match forbidden paths',
      !targetForbidden,
      packet.forbidden_paths.join(', '),
    ),
    check('rollback_type_legal', 'rollback_type is legal', rollbackTypeLegal, packet.rollback_type),
    check('preimage_hash_recorded', 'preimage_hash is recorded', hasText(packet.preimage_hash), packet.preimage_hash),
    check('current_hash_recorded', 'current_hash is recorded', hasText(packet.current_hash), packet.current_hash),
    check(
      'expected_post_rollback_hash_recorded',
      'expected_post_rollback_hash is recorded',
      hasText(packet.expected_post_rollback_hash),
      packet.expected_post_rollback_hash,
    ),
    check('max_files_one', 'max_files=1', packet.max_files === 1, String(packet.max_files)),
    check(
      'max_bytes_not_exceeded',
      'max_bytes is not exceeded by current target metadata',
      targetMetadata.currentByteSize <= packet.max_bytes,
      `${targetMetadata.currentByteSize}/${packet.max_bytes}`,
    ),
    check(
      'human_review_required',
      'human review is required',
      packet.human_review_required === true,
      String(packet.human_review_required),
    ),
    check('pro_gate_required', 'Pro gate is required', packet.pro_gate_required === true, String(packet.pro_gate_required)),
    check(
      'mutation_expectation_zero_for_preflight',
      'mutation expectation is zero for preflight',
      packet.mutation_expectation === 'zero_for_preflight',
      packet.mutation_expectation,
    ),
    check(
      'actual_rollback_performed_false',
      'actual_rollback_performed=false',
      packet.actual_rollback_performed === false,
      String(packet.actual_rollback_performed),
    ),
  ];

  const receipt_status = stop_checks.every((item) => item.status === 'pass')
    ? 'pass_zero_mutation'
    : 'blocked';

  return {
    approval_id: packet.approval_id,
    rollback_mode: packet.rollback_mode,
    target_paths_checked: packet.allowed_target_paths,
    rollback_type: packet.rollback_type,
    preimage_hash_status: hasText(packet.preimage_hash) ? 'recorded' : 'missing',
    current_hash_status: hasText(packet.current_hash) ? 'recorded' : 'missing',
    expected_post_rollback_hash_status: hasText(packet.expected_post_rollback_hash) ? 'recorded' : 'missing',
    mutation_expectation: 'zero_for_preflight',
    actual_rollback_performed: false,
    receipt_status,
    zero_mutation_assertion: true,
    stop_checks,
  };
}

export function validateRollbackReceiptTemplate({
  packet,
  receipt,
}: RollbackReceiptValidationInput): RollbackReceiptValidatorEvidence {
  const checks: RollbackStopCheck[] = [
    check('approval_id_matches', 'approval_id matches packet', receipt.approval_id === packet.approval_id, receipt.approval_id),
    check('rollback_mode_matches', 'rollback_mode matches packet', receipt.rollback_mode === packet.rollback_mode, receipt.rollback_mode),
    check(
      'target_paths_match',
      'target_paths match allowed target paths',
      receipt.target_paths.length === packet.allowed_target_paths.length &&
        receipt.target_paths.every((path, index) => path === packet.allowed_target_paths[index]),
      receipt.target_paths.join(', '),
    ),
    check(
      'pre_rollback_hash_present',
      'pre_rollback_hash is present',
      hasText(receipt.pre_rollback_hash),
      receipt.pre_rollback_hash,
    ),
    check(
      'post_rollback_hash_present',
      'post_rollback_hash is present',
      hasText(receipt.post_rollback_hash),
      receipt.post_rollback_hash,
    ),
    check(
      'changed_files_empty_for_preflight',
      'changed_files is empty for preflight template',
      receipt.changed_files.length === 0,
      String(receipt.changed_files.length),
    ),
    check('diff_summary_present', 'diff_summary is present', hasText(receipt.diff_summary), receipt.diff_summary),
    check(
      'zero_extra_mutation_assertion_true',
      'zero_extra_mutation_assertion=true',
      receipt.zero_extra_mutation_assertion === true,
      String(receipt.zero_extra_mutation_assertion),
    ),
    check('staged_status_empty', 'staged_status=empty', receipt.staged_status === 'empty', receipt.staged_status),
    check(
      'receipt_status_preflight_only',
      'receipt_status is preflight-only',
      receipt.receipt_status === 'preflight_only_not_executed',
      receipt.receipt_status,
    ),
    check(
      'verification_status_template_only',
      'verification_status is template-only',
      receipt.verification_status === 'validated_template_only',
      receipt.verification_status,
    ),
    check('recovery_note_present', 'recovery_note is present', hasText(receipt.recovery_note), receipt.recovery_note),
  ];

  const status = checks.every((item) => item.status === 'pass') ? 'pass' : 'blocked';

  return {
    validator_id: 'DemoScenario051-rollback-receipt-validator',
    status,
    required_fields: ROLLBACK_RECEIPT_REQUIRED_FIELDS,
    checks,
    conclusion:
      status === 'pass'
        ? 'Rollback receipt validator passes for the preflight-only template; it does not prove rollback execution.'
        : 'Rollback receipt validator blocked the preflight template.',
  };
}
