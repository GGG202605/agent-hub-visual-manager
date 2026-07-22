import type { BasicAgentHubFixture, ImportedAgentHubProject } from '../types';

const fallbackProject = {
  projectId: 'unknown-fixture-project',
  projectName: 'Unknown Fixture Project',
  currentGoal: 'Unknown goal',
  currentPhase: 'unknown_phase',
  stableBaseline: 'fakecommit000000000000000000000000000000000000',
  buildStatus: 'unknown',
  repoStatus: 'unknown',
  commitGate: 'unknown',
};

export function parseBasicAgentHubFixture(fixture: BasicAgentHubFixture): ImportedAgentHubProject {
  const warnings: string[] = [];

  const project = {
    projectId: fixture.project.projectId ?? fallbackProject.projectId,
    projectName: fixture.project.projectName ?? fallbackProject.projectName,
    currentGoal: fixture.project.currentGoal ?? fallbackProject.currentGoal,
    currentPhase: fixture.project.currentPhase ?? fallbackProject.currentPhase,
    stableBaseline: fixture.project.stableBaseline ?? fallbackProject.stableBaseline,
    buildStatus: fixture.project.buildStatus ?? fallbackProject.buildStatus,
    repoStatus: fixture.project.repoStatus ?? fallbackProject.repoStatus,
    commitGate: fixture.project.commitGate ?? fallbackProject.commitGate,
  };

  for (const [key, value] of Object.entries(project)) {
    if (!value || value === 'unknown') {
      warnings.push(`missing_or_unknown_project_${key}`);
    }
  }

  if (fixture.agents.length === 0) {
    warnings.push('missing_agent_cards');
  }

  return {
    project,
    gates: fixture.gates,
    agents: fixture.agents,
    tasks: fixture.tasks,
    runs: fixture.runs,
    reviews: fixture.reviews,
    decisions: fixture.decisions,
    risks: fixture.risks,
    provenance: fixture.provenance,
    importStatus: {
      state: warnings.length > 0 ? 'partial' : 'ready',
      source: 'fixture',
      readMode: 'fixture',
      importedFiles: [],
      skippedFiles: [],
      blockedFiles: [],
      warnings,
      unsupportedFiles: [],
      lastImportedAt: null,
      readOnly: true,
      executionConnected: false,
      totalBytes: 0,
    },
  };
}
