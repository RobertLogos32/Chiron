import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const loadConfig = (overrides = {}) => spawnSync(process.execPath, [
  '--input-type=module', '-e',
  "import { env } from './dist/config/env.js'; console.log(env.jwtExpiresIn);",
], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: {
    ...process.env,
    PORT: '3000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/chiron_config_tests',
    JWT_SECRET: 'test-only-secret-never-use-in-production',
    JWT_EXPIRES_IN: '7d',
    ...overrides,
  },
  encoding: 'utf8',
  timeout: 5000,
});

test.each([
  ['PORT', '0'],
  ['MONGODB_URI', ''],
  ['MONGODB_URI', 'https://example.com'],
  ['JWT_SECRET', ''],
  ['JWT_EXPIRES_IN', 'invalid'],
  ['JWT_EXPIRES_IN', '0'],
])('invalid %s=%s fails before startup', (key, value) => {
  const result = loadConfig({ [key]: value });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(key);
});

test.each([['7d', 604800], ['2h', 7200], ['900', 900]])(
  'JWT_EXPIRES_IN=%s is interpreted in seconds', (value, expected) => {
    const result = loadConfig({ JWT_EXPIRES_IN: value });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(String(expected));
  },
);
