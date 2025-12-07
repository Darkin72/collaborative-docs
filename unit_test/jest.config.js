module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../',
  roots: ['<rootDir>/unit_test'],
  moduleDirectories: ['node_modules', 'server/node_modules'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/server/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/unit_test/tsconfig.json'
    }]
  },
  testMatch: [
    '**/unit_test/**/*.test.ts'
  ],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
