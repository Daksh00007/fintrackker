import { useEffect, useMemo, useState } from 'react';

const apiBase = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('fintrackker-token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function getJson(url) {
  const response = await fetch(`${apiBase}${url}`, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(`${apiBase}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

async function putJson(url, payload) {
  const response = await fetch(`${apiBase}${url}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

async function deleteJson(url) {
  const response = await fetch(`${apiBase}${url}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }
}

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem('fintrackker-token')));
  const [activeView, setActiveView] = useState('overview');
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, savings: 0 });
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [filters, setFilters] = useState({ type: '', categoryId: '', startDate: '', endDate: '' });
  const [transactionDraft, setTransactionDraft] = useState({ type: 'income', categoryId: '', amount: '', date: '', description: '' });
  const [budgetDraft, setBudgetDraft] = useState({ categoryId: '', limitAmount: '', month: '' });
  const [loginForm, setLoginForm] = useState({ name: '', email: '', password: '' });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ amount: '', type: 'expense', date: '', description: '' });
  const [showModal, setShowModal] = useState(false);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const previousMonth = useMemo(() => {
    const now = new Date();
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const loadData = async () => {
      try {
        const [cats, summaryData, txns, budgetData, breakdown] = await Promise.all([
          getJson('/categories'),
          getJson('/dashboard/summary'),
          getJson('/transactions'),
          getJson('/budgets'),
          getJson('/dashboard/category-wise')
        ]);
        setCategories(cats);
        setSummary(summaryData);
        setTransactions(txns);
        setBudgets(budgetData);
        setCategoryBreakdown(breakdown);
      } catch {
        setAuthMessage('Unable to load dashboard data.');
      }
    };
    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const params = {};
    if (filters.type) params.type = filters.type;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    const query = new URLSearchParams(params).toString();
    getJson(`/transactions${query ? `?${query}` : ''}`)
      .then(setTransactions)
      .catch(() => setAuthMessage('Unable to fetch filtered transactions.'));
  }, [filters, isAuthenticated]);

  const recentTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id).slice(0, 5);
  }, [transactions]);

  const savingsByMonth = useMemo(() => {
    const totals = transactions.reduce((acc, tx) => {
      const month = tx.date.slice(0, 7);
      if (!acc[month]) acc[month] = { income: 0, expense: 0 };
      if (tx.type === 'income') acc[month].income += Number(tx.amount);
      if (tx.type === 'expense') acc[month].expense += Number(tx.amount);
      return acc;
    }, {});

    const currentSavings = (totals[currentMonth]?.income || 0) - (totals[currentMonth]?.expense || 0);
    const previousSavings = (totals[previousMonth]?.income || 0) - (totals[previousMonth]?.expense || 0);
    return { currentSavings, previousSavings };
  }, [currentMonth, previousMonth, transactions]);

  const categoryById = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category.name])), [categories]);

  const monthlyTrendData = useMemo(() => {
    const now = new Date();
    const months = [...Array(6)].map((_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return {
        month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleString(undefined, { month: 'short', year: 'numeric' }),
        income: 0,
        expense: 0,
        savings: 0
      };
    });
    const monthIndex = Object.fromEntries(months.map((item, index) => [item.month, index]));
    transactions.forEach((tx) => {
      const month = typeof tx.date === 'string' ? tx.date.slice(0, 7) : '';
      const index = monthIndex[month];
      if (index === undefined) return;
      if (tx.type === 'income') months[index].income += Number(tx.amount);
      if (tx.type === 'expense') months[index].expense += Number(tx.amount);
    });
    return months.map((item) => ({ ...item, savings: item.income - item.expense }));
  }, [transactions]);

  const trendMax = useMemo(() => {
    return Math.max(1, ...monthlyTrendData.map((item) => Math.max(item.income, item.expense, 1)));
  }, [monthlyTrendData]);

  const reportCategoryData = useMemo(() => {
    return [...categoryBreakdown]
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, 5)
      .map((item) => ({ ...item, name: categoryById[item.categoryId] || `Category ${item.categoryId}` }));
  }, [categoryBreakdown, categoryById]);

  const reportBudgetData = useMemo(() => {
    return budgets.map((budget) => ({
      ...budget,
      name: categoryById[budget.categoryId] || `Category ${budget.categoryId}`
    }));
  }, [budgets, categoryById]);

  const reportBudgetSummary = useMemo(() => ({
    total: reportBudgetData.length,
    over: reportBudgetData.filter((b) => b.overBudget).length
  }), [reportBudgetData]);

  const computeBudgetAlerts = (budgetList) => {
    if (!budgetList || !budgetList.length) return [];
    return budgetList
      .filter((b) => Number(b.spent || 0) > Number(b.limitAmount || 0))
      .map((b) => ({
        id: b.id,
        categoryId: b.categoryId,
        message: `${categoryById[b.categoryId] || `Category ${b.categoryId}`} is over budget by $${(Number(b.spent || 0) - Number(b.limitAmount || 0)).toFixed(2)} for ${b.month}`
      }));
  };

  useEffect(() => {
    setAlerts(computeBudgetAlerts(budgets));
  }, [budgets, categoryById]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login' ? { email: loginForm.email, password: loginForm.password } : { name: loginForm.name, email: loginForm.email, password: loginForm.password };
      const result = await postJson(endpoint, payload);
      localStorage.setItem('fintrackker-token', result.token);
      setIsAuthenticated(true);
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fintrackker-token');
    setIsAuthenticated(false);
    setAuthMessage('');
  };

  const handleTransactionUpdate = async () => {
    const [summaryData, txns, budgetData, breakdown] = await Promise.all([
      getJson('/dashboard/summary'),
      getJson('/transactions'),
      getJson('/budgets'),
      getJson('/dashboard/category-wise')
    ]);
    setSummary(summaryData);
    setTransactions(txns);
    setBudgets(budgetData);
    setCategoryBreakdown(breakdown);
  };

  const handleCreateTransaction = async (event) => {
    event.preventDefault();
    try {
      await postJson('/transactions', {
        ...transactionDraft,
        amount: Number(transactionDraft.amount),
        categoryId: Number(transactionDraft.categoryId),
        date: transactionDraft.date,
        description: transactionDraft.description
      });
      setShowModal(false);
      setTransactionDraft({ type: 'income', categoryId: '', amount: '', date: '', description: '' });
      await handleTransactionUpdate();
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const handleCreateBudget = async (event) => {
    event.preventDefault();
    try {
      await postJson('/budgets', {
        categoryId: Number(budgetDraft.categoryId),
        limitAmount: Number(budgetDraft.limitAmount),
        month: budgetDraft.month
      });
      setBudgetDraft({ categoryId: '', limitAmount: '', month: '' });
      const budgetData = await getJson('/budgets');
      setBudgets(budgetData);
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await deleteJson(`/transactions/${id}`);
      const [summaryData, txns, budgetData, breakdown] = await Promise.all([getJson('/dashboard/summary'), getJson('/transactions'), getJson('/budgets'), getJson('/dashboard/category-wise')]);
      setSummary(summaryData);
      setTransactions(txns);
      setBudgets(budgetData);
      setCategoryBreakdown(breakdown);
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  const startEditing = (transaction) => {
    setEditingId(transaction.id);
    // Normalize date for date input (YYYY-MM-DD) if an ISO string is provided
    const normalizedDate = typeof transaction.date === 'string' && transaction.date.length >= 10 ? transaction.date.slice(0, 10) : transaction.date;
    setEditDraft({ amount: transaction.amount, type: transaction.type, date: normalizedDate, description: transaction.description || '' });
  };

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  const handleSaveEdit = async (id) => {
    try {
      await putJson(`/transactions/${id}`, {
        amount: Number(editDraft.amount),
        type: editDraft.type,
        date: editDraft.date,
        description: editDraft.description
      });
      setEditingId(null);
      const [summaryData, txns, budgetData, breakdown] = await Promise.all([getJson('/dashboard/summary'), getJson('/transactions'), getJson('/budgets'), getJson('/dashboard/category-wise')]);
      setSummary(summaryData);
      setTransactions(txns);
      setBudgets(budgetData);
      setCategoryBreakdown(breakdown);
    } catch (error) {
      setAuthMessage(error.message);
    }
  };

  return (
    <div className="app-shell">
      {!isAuthenticated ? (
        <section className="login-card">
          <div className="auth-hero">
            <p className="eyebrow">Welcome back</p>
            <h1>{authMode === 'login' ? 'FinTrackker' : 'Create your account'}</h1>
            <p className="hero-copy">{authMode === 'login' ? 'Take control of your income, expenses, and savings with a calm, clear dashboard.' : 'Join FinTrackker to track every dollar, build budgets, and stay on top of your goals.'}</p>
          </div>
          <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
            <button type="button" className={`toggle-btn ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={`toggle-btn ${authMode === 'register' ? 'active' : ''}`} onClick={() => setAuthMode('register')}>Register</button>
          </div>
          <form onSubmit={handleAuthSubmit} className="stacked-form auth-form">
            {authMode === 'register' && (
              <label>
                Name
                <input value={loginForm.name} onChange={(event) => setLoginForm({ ...loginForm, name: event.target.value })} type="text" placeholder="Your name" />
              </label>
            )}
            <label>
              Email
              <input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} type="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} type="password" placeholder="Enter password" required />
            </label>
            <button type="submit">{authMode === 'login' ? 'Login' : 'Create account'}</button>
          </form>
          <p className="message">{authMessage}</p>
        </section>
      ) : (
        <div className="dashboard-shell">
          <aside className="sidebar">
            <div>
              <p className="eyebrow">FinTrackker</p>
              <h2>Menu</h2>
              <nav className="nav-links">
                {['overview', 'transactions', 'budgets', 'reports'].map((view) => (
                  <button key={view} type="button" className={`nav-link ${activeView === view ? 'active' : ''}`} onClick={() => setActiveView(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>
                ))}
              </nav>
            </div>
            <div className="account-card">
              <button type="button" onClick={handleLogout} className="logout-btn">Logout</button>
            </div>
          </aside>

          <div className="dashboard-main">
            <header className="hero">
              <div>
                <p className="eyebrow">Personal Finance Tracker</p>
                <h1>Understand where your money goes.</h1>
                <p className="hero-copy">Track income, expenses, budgets, and spending patterns in one place.</p>
              </div>
              <div className="summary-grid overview-only-widget">
                <div className="summary-card"><span>Income</span><strong>${summary.income.toFixed(2)}</strong></div>
                <div className="summary-card"><span>Expenses</span><strong>${summary.expenses.toFixed(2)}</strong></div>
                <div className="summary-card"><span>Savings</span><strong>${summary.savings.toFixed(2)}</strong></div>
              </div>
            </header>

            {alerts.length ? (
              <section className="panel alerts-panel overview-only-panel">
                <h2>Budget alerts</h2>
                <div className="alerts">
                  {alerts.map((a) => (
                    <div key={a.id} className="alert-item">
                      <strong>Overspent:</strong> {a.message}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <main className="content-grid">
              {activeView === 'overview' && (
                <div id="view-overview" className="view-section active">
                  <section className="panel overview-only-panel">
                    <h2>Spending by category</h2>
                    <div className="chart">
                      {categoryBreakdown.length ? (() => {
                        const sorted = [...categoryBreakdown].sort((a, b) => Number(b.total) - Number(a.total));
                        const maxValue = Math.max(...sorted.map((i) => Number(i.total) || 0), 1);
                        return (
                          <div id="categoryGraph" className="graph-bars" aria-label="Spending graph">
                            {sorted.map((item) => {
                              const percent = (Number(item.total) / maxValue) * 100;
                              return (
                                <div key={`row-${item.categoryId}`} className="graph-row">
                                  <div className="graph-label">{categoryById[item.categoryId] || `Category ${item.categoryId}`}</div>
                                  <div className="graph-box">
                                    <div className="graph-bar" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
                                  </div>
                                  <strong>${Number(item.total).toFixed(2)}</strong>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })() : <div className="list-item">No expense data yet.</div>}
                    </div>
                  </section>
                  <section className="panel overview-only-panel">
                    <h2>Allocated budget</h2>
                    <div className="list-stack">
                      {budgets.length ? budgets.map((budget) => (
                        <div key={budget.id} className={`list-item ${budget.overBudget ? 'over-budget' : ''}`}>
                          <div>
                            <strong>{categoryById[budget.categoryId] || `Category ${budget.categoryId}`}</strong>
                            <div className="meta">Limit ${Number(budget.limitAmount).toFixed(2)} • Month {budget.month}</div>
                            <div className="meta">Spent ${Number(budget.spent || 0).toFixed(2)} • Remaining ${Number(budget.remaining || 0).toFixed(2)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {budget.overBudget ? (
                              <span className="budget-over">Over budget by ${Math.abs(Number(budget.remaining || 0)).toFixed(2)}</span>
                            ) : (
                              <span className="budget-pill">${Number(budget.limitAmount).toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      )) : <div className="list-item">No budgets set.</div>}
                    </div>
                  </section>
                  <section className="panel overview-only-panel">
                    <h2>Recent transactions</h2>
                    <div className="list-stack">
                      {recentTransactions.length ? recentTransactions.map((transaction) => (
                        <div key={transaction.id} className="list-item">
                          <div>
                            <strong>{transaction.description || 'Untitled transaction'}</strong>
                            <div className="meta">{formatDisplayDate(transaction.date)} • {categoryById[transaction.categoryId] || `Category ${transaction.categoryId}`}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className={`badge ${transaction.type}`}>{transaction.type}</span>
                            <div><strong>${Number(transaction.amount).toFixed(2)}</strong></div>
                          </div>
                        </div>
                      )) : <div className="list-item">No recent transactions yet.</div>}
                    </div>
                  </section>
                  <section className="panel overview-only-panel">
                    <h2>Savings trend</h2>
                    <div className="savings-graph">
                      <div className="savings-bars">
                        <div className="savings-bar-block">
                          <div className={`savings-bar ${savingsByMonth.previousSavings >= 0 ? 'positive' : 'negative'}`} style={{ height: `${Math.min(100, Math.max(0, Math.abs(savingsByMonth.previousSavings) / Math.max(1, Math.abs(savingsByMonth.currentSavings), Math.abs(savingsByMonth.previousSavings)) * 100))}%` }} />
                          <span>{previousMonth}</span>
                        </div>
                        <div className="savings-bar-block">
                          <div className={`savings-bar ${savingsByMonth.currentSavings >= 0 ? 'positive' : 'negative'}`} style={{ height: `${Math.min(100, Math.max(0, Math.abs(savingsByMonth.currentSavings) / Math.max(1, Math.abs(savingsByMonth.currentSavings), Math.abs(savingsByMonth.previousSavings)) * 100))}%` }} />
                          <span>{currentMonth}</span>
                        </div>
                      </div>
                      <div className="savings-caption">Prev month: ${savingsByMonth.previousSavings.toFixed(2)} • This month: ${savingsByMonth.currentSavings.toFixed(2)}</div>
                    </div>
                  </section>
                </div>
              )}

              {activeView === 'transactions' && (
                <section className="panel">
                  <div className="section-header">
                    <h2>Recent transactions</h2>
                    <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
                      <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
                        <option value="">All</option>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                      <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
                        <option value="">All categories</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <input value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} type="date" />
                      <input value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} type="date" />
                    </form>
                  </div>
                  <div className="list-stack">
                    {transactions.length ? transactions.map((transaction) => (
                      <div key={transaction.id} className="list-item">
                        <div>
                          <strong>{transaction.description || 'Untitled transaction'}</strong>
                          <div className="meta">{formatDisplayDate(transaction.date)} • {categoryById[transaction.categoryId] || `Category ${transaction.categoryId}`}</div>
                          {editingId === transaction.id ? (
                            <div className="inline-edit">
                              <input value={editDraft.amount} onChange={(event) => setEditDraft({ ...editDraft, amount: event.target.value })} type="number" min="0" step="0.01" />
                              <select value={editDraft.type} onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })}>
                                <option value="income">Income</option>
                                <option value="expense">Expense</option>
                              </select>
                              <input value={editDraft.date} onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })} type="date" />
                              <input value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} type="text" />
                              <button type="button" onClick={() => handleSaveEdit(transaction.id)}>Save</button>
                              <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                          ) : null}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`badge ${transaction.type}`}>{transaction.type}</span>
                          <div><strong>${Number(transaction.amount).toFixed(2)}</strong></div>
                          {editingId !== transaction.id ? (
                            <div className="transaction-actions">
                              <button type="button" onClick={() => startEditing(transaction)}>Edit</button>
                              <button type="button" onClick={() => handleDeleteTransaction(transaction.id)}>Delete</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )) : <div className="list-item">No transactions yet.</div>}
                  </div>
                </section>
              )}

              {activeView === 'budgets' && (
                <section className="panel">
                  <div className="section-header">
                    <h2>Budget overview</h2>
                    <form className="inline-form" onSubmit={handleCreateBudget}>
                      <select value={budgetDraft.categoryId} onChange={(event) => setBudgetDraft({ ...budgetDraft, categoryId: event.target.value })} required>
                        <option value="">Select category</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <input value={budgetDraft.limitAmount} onChange={(event) => setBudgetDraft({ ...budgetDraft, limitAmount: event.target.value })} type="number" min="0" step="0.01" placeholder="Limit" required />
                      <input value={budgetDraft.month} onChange={(event) => setBudgetDraft({ ...budgetDraft, month: event.target.value })} type="month" required />
                      <button type="submit">Save budget</button>
                    </form>
                  </div>
                  <div className="list-stack">
                    {budgets.length ? budgets.map((budget) => (
                      <div key={budget.id} className="list-item">
                        <div>
                          <strong>{categoryById[budget.categoryId] || `Category ${budget.categoryId}`}</strong>
                          <div className="meta">Limit ${Number(budget.limitAmount).toFixed(2)} • Month {budget.month}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div>Spent ${Number(budget.spent || 0).toFixed(2)}</div>
                          <div className="meta">Remaining ${Number(budget.remaining || 0).toFixed(2)}</div>
                        </div>
                      </div>
                    )) : <div className="list-item">No budgets set.</div>}
                  </div>
                </section>
              )}

              {activeView === 'reports' && (
                <section className="panel reports-grid">
                  <div className="section-header">
                    <div>
                      <h2>Reports</h2>
                      <p className="hero-copy">Monthly trends, spending patterns, and budget health in one place.</p>
                    </div>
                  </div>

                  <div className="report-summary-grid">
                    <div className="report-card">
                      <span>Months shown</span>
                      <strong>{monthlyTrendData.length}</strong>
                    </div>
                    <div className="report-card">
                      <span>Total budget plans</span>
                      <strong>{reportBudgetSummary.total}</strong>
                    </div>
                    <div className="report-card">
                      <span>Budgets over limit</span>
                      <strong>{reportBudgetSummary.over}</strong>
                    </div>
                    <div className="report-card">
                      <span>Categories tracked</span>
                      <strong>{reportCategoryData.length}</strong>
                    </div>
                  </div>

                  <div className="report-section">
                    <h3>Monthly income vs expenses</h3>
                    <div className="report-chart">
                      {monthlyTrendData.map((item) => (
                        <div key={item.month} className="report-row">
                          <div className="report-row-label">{item.label}</div>
                          <div className="report-row-bars">
                            <div className="report-bar-group">
                              <div className="report-bar report-bar-income" style={{ width: `${Math.round((item.income / trendMax) * 100)}%` }} />
                              <div className="report-bar-label">Income ${item.income.toFixed(0)}</div>
                            </div>
                            <div className="report-bar-group">
                              <div className="report-bar report-bar-expense" style={{ width: `${Math.round((item.expense / trendMax) * 100)}%` }} />
                              <div className="report-bar-label">Expense ${item.expense.toFixed(0)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="report-section">
                    <h3>Savings trend</h3>
                    <div className="savings-trend-grid">
                      {monthlyTrendData.map((item) => (
                        <div key={`save-${item.month}`} className="savings-card">
                          <div className="savings-label">{item.label}</div>
                          <div className={`savings-value ${item.savings >= 0 ? 'positive' : 'negative'}`}>${item.savings.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="report-section">
                    <h3>Top categories by expense</h3>
                    <div className="report-category-list">
                      {reportCategoryData.length ? reportCategoryData.map((item) => (
                        <div key={`cat-${item.categoryId}`} className="report-list-item">
                          <div>{item.name}</div>
                          <div>${Number(item.total).toFixed(2)}</div>
                        </div>
                      )) : <div className="list-item">No expense category data yet.</div>}
                    </div>
                  </div>

                  <div className="report-section">
                    <h3>Budget health</h3>
                    <div className="list-stack">
                      {reportBudgetData.length ? reportBudgetData.map((budget) => (
                        <div key={`budget-${budget.id}`} className={`list-item ${budget.overBudget ? 'over-budget' : ''}`}>
                          <div>
                            <strong>{budget.name}</strong>
                            <div className="meta">Limit ${Number(budget.limitAmount).toFixed(2)} • Month {budget.month}</div>
                            <div className="meta">Spent ${Number(budget.spent || 0).toFixed(2)} • Remaining ${Number(budget.remaining || 0).toFixed(2)}</div>
                          </div>
                          <div className="budget-pill">{budget.overBudget ? 'Over limit' : 'On track'}</div>
                        </div>
                      )) : <div className="list-item">No budgets set yet.</div>}
                    </div>
                  </div>
                </section>
              )}
            </main>

            <div className="fab-wrap overview-only-widget">
              <button type="button" className="fab-btn" onClick={() => setShowModal(true)}>+ Add transaction</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add transaction</h3>
              <button type="button" className="icon-btn" onClick={() => setShowModal(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleCreateTransaction} className="stacked-form">
              <label>
                Type
                <select value={transactionDraft.type} onChange={(event) => setTransactionDraft({ ...transactionDraft, type: event.target.value })} required>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <label>
                Category
                <select value={transactionDraft.categoryId} onChange={(event) => setTransactionDraft({ ...transactionDraft, categoryId: event.target.value })} required>
                  <option value="">Select category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>
                Amount
                <input value={transactionDraft.amount} onChange={(event) => setTransactionDraft({ ...transactionDraft, amount: event.target.value })} type="number" min="0" step="0.01" required />
              </label>
              <label>
                Date
                <input value={transactionDraft.date} onChange={(event) => setTransactionDraft({ ...transactionDraft, date: event.target.value })} type="date" required />
              </label>
              <label>
                Description
                <input value={transactionDraft.description} onChange={(event) => setTransactionDraft({ ...transactionDraft, description: event.target.value })} type="text" placeholder="Groceries, salary, etc." />
              </label>
              <button type="submit">Save transaction</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
