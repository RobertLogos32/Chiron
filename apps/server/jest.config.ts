/** @jest-config-loader esbuild-register */
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.mjs'],
  transform: {},
  clearMocks: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['dist/**/*.js', '!dist/index.js'],
};

export default config;
