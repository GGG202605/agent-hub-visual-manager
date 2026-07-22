import { describe, expect, it } from 'vitest';
import {
  AGENT_ROLE_CONTRACTS,
  COORDINATION_CONTRACT_VERSION,
  evaluateRunCompletion,
  getAgentRoleContract,
  normalizeAgentCode,
} from '../coordinationContract';

describe('coordination contract', () => {
  it('defines one versioned contract for eight unique roles', () => {
    expect(COORDINATION_CONTRACT_VERSION).toBe('1.0.0');
    expect(AGENT_ROLE_CONTRACTS).toHaveLength(8);
    expect(new Set(AGENT_ROLE_CONTRACTS.map((role) => role.code)).size).toBe(8);
  });

  it('keeps the executor deterministic and human approval outside PRO', () => {
    expect(getAgentRoleContract('EXECUTOR')?.runtime).toBe('deterministic_service');
    expect(getAgentRoleContract('PRO')?.prohibited).toContain('代替用户授权');
  });

  it('normalizes legacy role aliases without creating a second contract', () => {
    expect(normalizeAgentCode('AG-ARCH')).toBe('PRO');
    expect(normalizeAgentCode('AG-CODE')).toBe('AG-DEV');
    expect(normalizeAgentCode('unknown')).toBeNull();
  });

  it('blocks completion without accepted tasks, verified artifacts, approvals and clean review', () => {
    const blocked = evaluateRunCompletion({
      taskStatuses: ['accepted', 'reviewing'],
      artifactCount: 0,
      artifactsVerified: false,
      approvalsSatisfied: false,
      highFindings: 0,
      mediumFindings: 1,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons).toEqual([
      'tasks_incomplete',
      'artifacts_missing',
      'artifacts_unverified',
      'approvals_missing',
      'review_findings_open',
    ]);
  });

  it('allows completion only when all gates are satisfied', () => {
    expect(
      evaluateRunCompletion({
        taskStatuses: ['accepted'],
        artifactCount: 1,
        artifactsVerified: true,
        approvalsSatisfied: true,
        highFindings: 0,
        mediumFindings: 0,
      }),
    ).toEqual({ allowed: true, reasons: [] });
  });
});
