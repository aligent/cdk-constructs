module.exports = {
  testEnvironment: 'node',
  rootDir: 'packages',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
