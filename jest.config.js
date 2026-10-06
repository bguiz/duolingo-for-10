/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false, isolatedModules: true }] },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/server.ts'], // server.ts is process bootstrap (listen/env), exercised by running the app
  coverageThreshold: { global: { statements: 80, branches: 80, functions: 80, lines: 80 } },
};
