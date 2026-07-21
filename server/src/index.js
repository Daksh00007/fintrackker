import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDb, query, run } from './db.js';

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

await initDb();

async function getUserIdFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const rows = await query('SELECT id FROM users WHERE token = ? LIMIT 1', [token]);
  return rows[0]?.id ?? null;
}

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const token = `token-${Date.now()}`;
    const result = await run('INSERT INTO users (name, email, password, token) VALUES (?, ?, ?, ?)', [name, email, password, token]);
    const userId = result.insertId;
    const defaultCategories = ['Food', 'Travel', 'Bills', 'Salary'];
    for (const categoryName of defaultCategories) {
      await run('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, categoryName]);
    }
    res.status(201).json({ user: { id: userId, name, email }, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const users = await query('SELECT id, name, email, password FROM users WHERE email = ? AND password = ?', [email, password]);
    const user = users[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = `token-${Date.now()}`;
    await run('UPDATE users SET token = ? WHERE id = ?', [token, user.id]);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/categories', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const categories = await query('SELECT id, name FROM categories WHERE user_id = ? ORDER BY id', [userId]);
    if (categories.length === 0) {
      const defaultCategories = ['Food', 'Travel', 'Bills', 'Salary'];
      for (const categoryName of defaultCategories) {
        await run('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, categoryName]);
      }
      const seededCategories = await query('SELECT id, name FROM categories WHERE user_id = ? ORDER BY id', [userId]);
      return res.json(seededCategories);
    }
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    const result = await run('INSERT INTO categories (user_id, name) VALUES (?, ?)', [userId, name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create category' });
  }
});

app.get('/api/transactions', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { type, categoryId, startDate, endDate } = req.query;
  const clauses = ['user_id = ?'];
  const values = [userId];

  if (type) {
    clauses.push('type = ?');
    values.push(type);
  }
  if (categoryId) {
    clauses.push('category_id = ?');
    values.push(Number(categoryId));
  }
  if (startDate) {
    clauses.push('date >= ?');
    values.push(startDate);
  }
  if (endDate) {
    clauses.push('date <= ?');
    values.push(endDate);
  }

  const sql = `SELECT id, category_id AS categoryId, amount, type, date, description FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY date DESC, id DESC`;
  const result = await query(sql, values);
  res.json(result);
});

app.post('/api/transactions', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { categoryId, amount, type, date, description } = req.body;
  if (!categoryId || !amount || !type || !date) {
    return res.status(400).json({ error: 'categoryId, amount, type, and date are required' });
  }
  try {
    const result = await run('INSERT INTO transactions (user_id, category_id, amount, type, date, description) VALUES (?, ?, ?, ?, ?, ?)', [userId, Number(categoryId), Number(amount), type, date, description || '']);
    res.status(201).json({ id: result.insertId, categoryId: Number(categoryId), amount: Number(amount), type, date, description: description || '' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = Number(req.params.id);
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (key === 'id') continue;
    fields.push(`${key === 'categoryId' ? 'category_id' : key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No update fields provided' });
  }
  values.push(id, userId);
  try {
    const result = await run(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Transaction not found' });
    const rows = await query('SELECT id, category_id AS categoryId, amount, type, date, description FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const id = Number(req.params.id);
  try {
    const result = await run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.get('/api/budgets', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const budgets = await query('SELECT id, category_id AS categoryId, limit_amount AS limitAmount, month FROM budgets WHERE user_id = ?', [userId]);
    const transactions = await query('SELECT category_id AS categoryId, amount, type FROM transactions WHERE user_id = ? AND type = ?', [userId, 'expense']);
    const budgetsWithStatus = budgets.map((budget) => {
      const spent = transactions.filter((tx) => tx.categoryId === budget.categoryId).reduce((sum, tx) => sum + Number(tx.amount), 0);
      return {
        ...budget,
        spent,
        remaining: Number(budget.limitAmount) - spent,
        overBudget: spent > Number(budget.limitAmount)
      };
    });
    res.json(budgetsWithStatus);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

app.post('/api/budgets', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { categoryId, limitAmount, month } = req.body;
  if (!categoryId || !limitAmount || !month) {
    return res.status(400).json({ error: 'categoryId, limitAmount, and month are required' });
  }
  try {
    const result = await run('INSERT INTO budgets (user_id, category_id, limit_amount, month) VALUES (?, ?, ?, ?)', [userId, Number(categoryId), Number(limitAmount), month]);
    res.status(201).json({ id: result.insertId, categoryId: Number(categoryId), limitAmount: Number(limitAmount), month });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const rows = await query('SELECT type, amount FROM transactions WHERE user_id = ?', [userId]);
    const income = rows.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount), 0);
    const expenses = rows.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount), 0);
    res.json({ income, expenses, savings: income - expenses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

app.get('/api/dashboard/category-wise', async (req, res) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const rows = await query('SELECT category_id AS categoryId, amount FROM transactions WHERE user_id = ? AND type = ?', [userId, 'expense']);
    const summary = rows.reduce((acc, tx) => {
      const category = acc.find((item) => item.categoryId === tx.categoryId);
      if (category) {
        category.total += Number(tx.amount);
      } else {
        acc.push({ categoryId: tx.categoryId, total: Number(tx.amount) });
      }
      return acc;
    }, []);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category-wise summary' });
  }
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
