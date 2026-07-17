import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFile = path.resolve(__dirname, '../data/app-data.json');

let server;

function request(path, options = {}) {
  const port = server.address().port;
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

test('health endpoint returns ok', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { status: 'ok' });
});

test('login returns a valid token for an existing user', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Login User', email: 'login@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);

  const loginResponse = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'login@example.com', password: 'secret' })
  });
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.user.email, 'login@example.com');
  assert.ok(loginBody.token);
});

test('can create and list categories', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const createResponse = await request('/api/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ name: 'Utilities' })
  });
  assert.equal(createResponse.status, 201);

  const listResponse = await request('/api/categories', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(listResponse.status, 200);
  const body = await listResponse.json();
  assert.ok(body.some((category) => category.name === 'Utilities'));
});

test('can create and list transactions', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test User 2', email: 'test2@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const createResponse = await request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ categoryId: 1, amount: 250, type: 'expense', date: '2026-07-15', description: 'Groceries' })
  });
  assert.equal(createResponse.status, 201);

  const listResponse = await request('/api/transactions', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(listResponse.status, 200);
  const body = await listResponse.json();
  assert.ok(body.some((tx) => tx.description === 'Groceries'));
});

test('dashboard summary returns totals', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Summary User', email: 'summary@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const response = await request('/api/dashboard/summary', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(typeof body.income === 'number');
  assert.ok(typeof body.expenses === 'number');
  assert.ok(typeof body.savings === 'number');
});

test('supports filtering transactions by type and category', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Filter User', email: 'filter@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const response = await request('/api/transactions?type=expense&categoryId=1', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.every((tx) => tx.type === 'expense' && tx.categoryId === 1));
});

test('can create budgets and expose remaining budget info', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Budget User', email: 'budget@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const createResponse = await request('/api/budgets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ categoryId: 1, limitAmount: 1000, month: '2026-07' })
  });
  assert.equal(createResponse.status, 201);

  const listResponse = await request('/api/budgets', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(listResponse.status, 200);
  const body = await listResponse.json();
  assert.ok(body.some((budget) => budget.month === '2026-07'));
});

test('different accounts do not share transaction data', async () => {
  const firstRegister = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', password: 'secret' })
  });
  assert.equal(firstRegister.status, 201);
  const firstBody = await firstRegister.json();

  const secondRegister = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Bob', email: 'bob@example.com', password: 'secret' })
  });
  assert.equal(secondRegister.status, 201);
  const secondBody = await secondRegister.json();

  const firstTransaction = await request('/api/transactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${firstBody.token}`
    },
    body: JSON.stringify({ categoryId: 1, amount: 100, type: 'expense', date: '2026-07-15', description: 'Coffee' })
  });
  assert.equal(firstTransaction.status, 201);

  const secondTransaction = await request('/api/transactions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secondBody.token}`
    },
    body: JSON.stringify({ categoryId: 2, amount: 200, type: 'income', date: '2026-07-15', description: 'Bonus' })
  });
  assert.equal(secondTransaction.status, 201);

  const aliceTransactions = await request('/api/transactions', {
    headers: { authorization: `Bearer ${firstBody.token}` }
  });
  const aliceBody = await aliceTransactions.json();
  assert.equal(aliceBody.length, 1);
  assert.equal(aliceBody[0].description, 'Coffee');

  const bobTransactions = await request('/api/transactions', {
    headers: { authorization: `Bearer ${secondBody.token}` }
  });
  const bobBody = await bobTransactions.json();
  assert.equal(bobBody.length, 1);
  assert.equal(bobBody[0].description, 'Bonus');
});

test('dashboard category-wise returns expense breakdown', async () => {
  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Breakdown User', email: 'breakdown@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);
  const auth = await registerResponse.json();

  const response = await request('/api/dashboard/category-wise', {
    headers: { authorization: `Bearer ${auth.token}` }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body));
});

test('register persists users to disk', async () => {
  await fs.rm(dataFile, { force: true });

  const registerResponse = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Persistent User', email: 'persist@example.com', password: 'secret' })
  });
  assert.equal(registerResponse.status, 201);

  const stored = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.ok(stored.users.some((user) => user.email === 'persist@example.com'));
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
