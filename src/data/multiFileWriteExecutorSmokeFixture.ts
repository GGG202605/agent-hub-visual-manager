export const multiFileWriteExecutorSmokeFixture = {
  fixtureId: 'DemoScenario057-multi-file-selected-path-write-smoke',
  executorMode: 'selected_path_write',
  writeScope: 'two_approved_fixture_files_only',
  mutationExpectation: 'approved_files_only',
  stageRecoverySmoke: 'DemoScenario059r-unstage-verified',
  commitExecutorSmoke: 'DemoScenario002-controlled-commit',
  stagePermission: false,
  commitPermission: false,
  pushPermission: false,
} as const;
