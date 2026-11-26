import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import jwt from 'jsonwebtoken';
import User from '../dist/models/user.model.js';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/chiron_unit_tests';
process.env.JWT_SECRET = 'test-only-secret-never-use-in-production';
process.env.JWT_EXPIRES_IN = '7d';
const { default: app } = await import('../dist/app.js');

let server;
let baseUrl;

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

const request = async (path, { method = 'GET', body, rawBody, headers = {} } = {}) => {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(3000),
  });
  return { status: response.status, body: await response.json() };
};

describe('HTTP routing and error handling', () => {
  test('health responds without being blocked by middleware', async () => {
    const result = await request('/health');
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(new Date(result.body.timestamp).toISOString()).toBe(result.body.timestamp);
  });

  test('unknown routes respond with a JSON 404', async () => {
    expect(await request('/does-not-exist')).toMatchObject({
      status: 404, body: { code: 'NOT_FOUND' },
    });
  });

  test('malformed JSON returns 400 without being logged as a server failure', async () => {
    const logger = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await request('/login', { method: 'POST', rawBody: '{' })).toMatchObject({
      status: 400, body: { code: 'INVALID_JSON' },
    });
    expect(logger).not.toHaveBeenCalled();
  });

  test('oversized JSON returns 413 rather than 500', async () => {
    expect(await request('/login', { method: 'POST', body: { text: 'x'.repeat(110000) } }))
      .toMatchObject({ status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});

describe('mounted authentication routes', () => {
  test.each(['/register', '/login'])('%s validates an empty body', async path => {
    expect(await request(path, { method: 'POST', body: {} }))
      .toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR' } });
  });

  test('registration normalizes input and returns a usable token without the password', async () => {
    const user = new User({ name: 'Test User', email: 'test@example.com', password: 'stored-hash' });
    const create = jest.spyOn(User, 'create').mockResolvedValue(user);
    const result = await request('/register', {
      method: 'POST', body: { name: ' Test User ', email: ' TEST@example.com ', password: 'Password123!' },
    });
    expect(result.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ name: 'Test User', email: 'test@example.com', password: 'Password123!' });
    expect(result.body.data.user).not.toHaveProperty('password');
    const token = jwt.verify(result.body.token, process.env.JWT_SECRET);
    expect(token.id).toBe(user.id);
    expect(token.exp - token.iat).toBe(7 * 86400);
  });

  test('duplicate email remains a 409', async () => {
    jest.spyOn(User, 'create').mockRejectedValue({ code: 11000 });
    expect(await request('/register', {
      method: 'POST', body: { name: 'Test User', email: 'test@example.com', password: 'Password123!' },
    })).toMatchObject({ status: 409, body: { code: 'EMAIL_ALREADY_EXISTS' } });
  });

  test('login returns a signed token for valid credentials', async () => {
    const user = { id: '507f1f77bcf86cd799439011', comparePassword: jest.fn().mockResolvedValue(true) };
    jest.spyOn(User, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const result = await request('/login', {
      method: 'POST', body: { email: 'test@example.com', password: 'Password123!' },
    });
    expect(result.status).toBe(200);
    expect(jwt.verify(result.body.token, process.env.JWT_SECRET).id).toBe(user.id);
    expect(user.comparePassword).toHaveBeenCalledWith('Password123!');
  });

  test('unknown credentials return 401', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    expect(await request('/login', {
      method: 'POST', body: { email: 'missing@example.com', password: 'Password123!' },
    })).toMatchObject({ status: 401, body: { code: 'INVALIDE_CREDENTIAL' } });
  });

  test('unexpected failures remain 500 and do not disclose internals', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(User, 'findOne').mockImplementation(() => { throw new Error('private database details'); });
    const result = await request('/login', {
      method: 'POST', body: { email: 'test@example.com', password: 'Password123!' },
    });
    expect(result).toEqual({ status: 500, body: {
      status: 'error', code: 'INTERNAL_ERROR', message: 'Errore interno del server',
    } });
  });

  test.each([['PATCH', '/me'], ['PATCH', '/me/password'], ['DELETE', '/me']])(
    '%s %s requires the gateway user ID', async (method, path) => {
      expect(await request(path, { method, body: {} }))
        .toMatchObject({ status: 401, body: { code: 'MISSING_USER_ID' } });
    },
  );

  test('an invalid user ID returns 404 without querying MongoDB', async () => {
    const update = jest.spyOn(User, 'findByIdAndUpdate');
    expect(await request('/me', {
      method: 'PATCH', body: { name: 'Updated User' }, headers: { 'X-User-Id': 'invalid' },
    })).toMatchObject({ status: 404, body: { code: 'USER_NOT_FOUND' } });
    expect(update).not.toHaveBeenCalled();
  });

  test.each(['123456', 12345678, undefined])('rejects an invalid new password: %s', async newPassword => {
    const find = jest.spyOn(User, 'findById');
    expect(await request('/me/password', {
      method: 'PATCH', body: { currentPassword: 'Password123!', newPassword },
      headers: { 'X-User-Id': '507f1f77bcf86cd799439011' },
    })).toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR' } });
    expect(find).not.toHaveBeenCalled();
  });
});
