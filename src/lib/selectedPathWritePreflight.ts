import type {
  SelectedPathWriteApprovalPacket,
  SelectedPathWritePreflightReceipt,
  SelectedPathWriteStopCheck,
  SelectedPathWriteTargetMetadata,
} from '../types';

interface PreflightInput {
  packet: SelectedPathWriteApprovalPacket;
  targetMetadata: SelectedPathWriteTargetMetadata;
  expectedRepo: string;
  expectedCwd: string;
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

function check(id: string, label: string, passed: boolean, evidence: string): SelectedPathWriteStopCheck {
  return {
    id,
    label,
    status: passed ? 'pass' : 'blocked',
    evidence,
  };
}

export function runSelectedPathWritePreflight({
  packet,
  targetMetadata,
  expectedRepo,
  expectedCwd,
}: PreflightInput): SelectedPathWritePreflightReceipt {
  const targetPathsAreExact = packet.allowed_target_paths.every(isExactRepoRelativeFilePath);
  const targetPathApproved = packet.allowed_target_paths.includes(targetMetadata.path);
  const targetForbidden = packet.forbidden_paths.some((pattern) =>
    matchesForbiddenPath(targetMetadata.path, pattern),
  );

  const stop_checks: SelectedPathWriteStopCheck[] = [
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
      'allowed_target_paths_exact',
      'allowed_target_paths are exact repo-relative file paths',
      targetPathsAreExact,
      packet.allowed_target_paths.join(', '),
    ),
    check(
      'target_path_approved',
      'target path appears in allowed_target_paths',
      targetPathApproved,
      targetMetadata.path,
    ),
    check(
      'target_not_forbidden',
      'target path does not match forbidden paths',
      !targetForbidden,
      packet.forbidden_paths.join(', '),
    ),
    check(
      'max_files_not_exceeded',
      'max_files is positive and not exceeded',
      packet.max_files > 0 && packet.allowed_target_paths.length <= packet.max_files,
      `${packet.allowed_target_paths.length}/${packet.max_files}`,
    ),
    check(
      'max_bytes_not_exceeded',
      'max_bytes is positive and not exceeded by target metadata',
      packet.max_bytes > 0 && targetMetadata.byteSize <= packet.max_bytes,
      `${targetMetadata.byteSize}/${packet.max_bytes}`,
    ),
    check(
      'preimage_hash_recorded',
      'preimage hash is recorded',
      packet.preimage_required && hasText(targetMetadata.preimageSha256),
      targetMetadata.preimageSha256,
    ),
    check(
      'expected_diff_summary_recorded',
      'expected diff summary is recorded',
      hasText(packet.expected_diff_summary),
      packet.expected_diff_summary,
    ),
    check(
      'rollback_strategy_recorded',
      'rollback strategy is recorded',
      hasText(packet.rollback_strategy),
      packet.rollback_strategy,
    ),
    check(
      'human_review_required',
      'human review is required',
      packet.human_review_required === true,
      String(packet.human_review_required),
    ),
    check(
      'pro_gate_required',
      'Pro gate is required',
      packet.pro_gate_required === true,
      String(packet.pro_gate_required),
    ),
    check(
      'mutation_expectation_zero',
      'mutation expectation is zero',
      packet.mutation_expectation === 'zero',
      packet.mutation_expectation,
    ),
  ];

  const receipt_status = stop_checks.every((item) => item.status === 'pass')
    ? 'pass_zero_write'
    : 'blocked';

  return {
    approval_id: packet.approval_id,
    executor_mode: 'selected_path_write_preflight',
    allowed_repo: packet.allowed_repo,
    allowed_cwd: packet.allowed_cwd,
    target_paths_checked: packet.allowed_target_paths,
    forbidden_paths_checked: packet.forbidden_paths,
    preimage_hash_status: hasText(targetMetadata.preimageSha256) ? 'recorded' : 'missing',
    expected_diff_status: hasText(packet.expected_diff_summary) ? 'recorded' : 'missing',
    rollback_strategy_status: hasText(packet.rollback_strategy) ? 'recorded' : 'missing',
    zero_write_assertion: true,
    receipt_status,
    stop_checks,
  };
}
