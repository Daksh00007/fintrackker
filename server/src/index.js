import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '../../client');

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(clientDir));

const dataFilePath = path.resolve(__dirname, '../data/app-data.json');
let users = [];
let transactionsByUser = new Map();
let categoriesByUser = new Map();
let budgetsByUser = new Map();

const defaultCategories = [
  { id: 1, name: 'Food' },
  { id: 2, name: 'Travel' },
  { id: 3, name: 'Bills' },
  { id: 4, name: 'Salary' }
];

function getOrCreateUserStore(userId) {
  if (!transactionsByUser.has(userId)) {
    transactionsByUser.set(userId, []);
  }
  if (!categoriesByUser.has(userId)) {
    categoriesByUser.set(userId, defaultCategories.map((category) => ({ ...category })));
  }
  if (!budgetsByUser.has(userId)) {
    budgetsByUser.set(userId, []);
  }
  return {
    transactions: transactionsByUser.get(userId),
    categories: categoriesByUser.get(userId),
    budgets: budgetsByUser.get(userId)
  };
}

async function loadState() {
  try {
    const fileContent = await fs.readFile(dataFilePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    users = parsed.users || [];
    transactionsByUser = new Map(parsed.transactionsByUser || []);
    categoriesByUser = new Map(parsed.categoriesByUser || []);
    budgetsByUser = new Map(parsed.budgetsByUser || []);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
      await fs.writeFile(dataFilePath, JSON.stringify({
        users: [],
        transactionsByUser: [],
        categoriesByUser: [],
        budgetsByUser: []
      }, null, 2));
      return;
    }
    throw error;
  }
}

async function persistState() {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
  const payload = {
    users,
    transactionsByUser: Array.from(transactionsByUser.entries()),
    categoriesByUser: Array.from(categoriesByUser.entries()),
    budgetsByUser: Array.from(budgetsByUser.entries())
  };
  await fs.writeFile(dataFilePath, JSON.stringify(payload, null, 2));
}

await loadState();

function getUserIdFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const user = users.find((candidate) => candidate.token === token);
  return user ? user.id : null;
}

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  const existing = users.find((user) => user.email === email);
  if (existing) {
    return res.status(409).json({ error: 'User already exists' });
  }
  const user = {
    id: Date.now(),
    name,
    email,
    password,
    token: `token-${Date.now()}`
  };
  users.push(user);
  getOrCreateUserStore(user.id);
  await persistState();
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, token: user.token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const user = users.find((candidate) => candidate.email === email && candidate.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  user.token = `token-${Date.now()}`;
  getOrCreateUserStore(user.id);
  await persistState();
  res.json({ user: { id: user.id, name: user.name, email: user.email }, token: user.token });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/categories', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  res.json(store.categories);
});

app.post('/api/categories', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  const store = getOrCreateUserStore(userId);
  const category = { id: Date.now(), name };
  store.categories.push(category);
  await persistState();
  res.status(201).json(category);
});

app.get('/api/transactions', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const { type, categoryId, startDate, endDate } = req.query;
  let result = [...store.transactions];

  if (type) {
    result = result.filter((tx) => tx.type === type);
  }
  if (categoryId) {
    result = result.filter((tx) => tx.categoryId === Number(categoryId));
  }
  if (startDate) {
    result = result.filter((tx) => tx.date >= startDate);
  }
  if (endDate) {
    result = result.filter((tx) => tx.date <= endDate);
  }

  res.json(result);
});

app.post('/api/transactions', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { categoryId, amount, type, date, description } = req.body;
  if (!categoryId || !amount || !type || !date) {
    return res.status(400).json({ error: 'categoryId, amount, type, and date are required' });
  }
  const store = getOrCreateUserStore(userId);
  const transaction = {
    id: Date.now(),
    categoryId,
    amount: Number(amount),
    type,
    date,
    description: description || ''
  };
  store.transactions.push(transaction);
  await persistState();
  res.status(201).json(transaction);
});

app.put('/api/transactions/:id', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const id = Number(req.params.id);
  const index = store.transactions.findIndex((tx) => tx.id === id);
  if (index === -1) return res.status(404).json({ error: 'Transaction not found' });
  store.transactions[index] = { ...store.transactions[index], ...req.body, id };
  await persistState();
  res.json(store.transactions[index]);
});

app.delete('/api/transactions/:id', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const id = Number(req.params.id);
  const index = store.transactions.findIndex((tx) => tx.id === id);
  if (index === -1) return res.status(404).json({ error: 'Transaction not found' });
  store.transactions.splice(index, 1);
  await persistState();
  res.status(204).send();
});

app.get('/api/budgets', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const budgetsWithStatus = store.budgets.map((budget) => {
    const spent = store.transactions.filter((tx) => tx.type === 'expense' && tx.categoryId === budget.categoryId).reduce((sum, tx) => sum + tx.amount, 0);
    return {
      ...budget,
      spent,
      remaining: budget.limitAmount - spent,
      overBudget: spent > budget.limitAmount
    };
  });
  res.json(budgetsWithStatus);
});

app.post('/api/budgets', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { categoryId, limitAmount, month } = req.body;
  if (!categoryId || !limitAmount || !month) {
    return res.status(400).json({ error: 'categoryId, limitAmount, and month are required' });
  }
  const store = getOrCreateUserStore(userId);
  const budget = { id: Date.now(), categoryId: Number(categoryId), limitAmount: Number(limitAmount), month };
  store.budgets.push(budget);
  await persistState();
  res.status(201).json(budget);
});

app.get('/api/dashboard/summary', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const income = store.transactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = store.transactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
  const savings = income - expenses;
  res.json({ income, expenses, savings });
});

app.get('/api/dashboard/category-wise', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const store = getOrCreateUserStore(userId);
  const summary = store.transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((acc, tx) => {
      const category = acc.find((item) => item.categoryId === tx.categoryId);
      if (category) {
        category.total += tx.amount;
      } else {
        acc.push({ categoryId: tx.categoryId, total: tx.amount });
      }
      return acc;
    }, []);
  res.json(summary);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

const startServer = () => {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

export { app, startServer };
