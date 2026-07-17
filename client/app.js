const apiBase = '/api';

const summaryGrid = document.getElementById('summaryGrid');
const transactionsList = document.getElementById('transactionsList');
const recentTransactionsList = document.getElementById('recentTransactionsList');
const budgetsList = document.getElementById('budgetsList');
const budgetSummaryList = document.getElementById('budgetSummaryList');
const categoryChart = document.getElementById('categoryChart');
const categoryGraph = document.getElementById('categoryGraph');
const savingsGraph = document.getElementById('savingsGraph');
const transactionForm = document.getElementById('transactionForm');
const budgetForm = document.getElementById('budgetForm');
const filterForm = document.getElementById('filterForm');
const transactionCategory = document.getElementById('transactionCategory');
const budgetCategory = document.getElementById('budgetCategory');
const filterCategory = filterForm.elements.categoryId;
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const toggleButtons = document.querySelectorAll('.toggle-btn');
const navButtons = document.querySelectorAll('.nav-link');
const viewSections = document.querySelectorAll('.view-section');
const overviewOnlyWidgets = document.querySelectorAll('.overview-only-widget, .overview-only-panel');
const logoutBtn = document.getElementById('logoutBtn');
const addTransactionFab = document.getElementById('addTransactionFab');
const transactionModal = document.getElementById('transactionModal');
const closeTransactionModal = document.getElementById('closeTransactionModal');
let authMode = 'login';
let editingTransactionId = null;

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

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
}

function openTransactionModal() {
  if (!transactionModal || !transactionForm) return;
  transactionForm.reset();
  transactionModal.classList.remove('hidden');
  transactionModal.setAttribute('aria-hidden', 'false');
}

function closeTransactionModalView() {
  if (!transactionModal || !transactionForm) return;
  transactionModal.classList.add('hidden');
  transactionModal.setAttribute('aria-hidden', 'true');
}

function showLogin(message = '') {
  loginMessage.textContent = message;
  loginView.hidden = false;
  appView.hidden = true;
}

function setAuthMode(mode) {
  authMode = mode;
  const nameField = loginForm.elements.name;
  nameField.hidden = mode === 'login';
  nameField.required = mode === 'register';
  authSubmitBtn.textContent = mode === 'login' ? 'Login' : 'Create account';
  document.querySelector('.auth-hero .eyebrow').textContent = mode === 'login' ? 'Welcome back' : 'Start fresh';
  document.querySelector('.auth-hero h1').textContent = mode === 'login' ? 'FinTrackker' : 'Create your account';
  document.querySelector('.auth-hero .hero-copy').textContent = mode === 'login'
    ? 'Take control of your income, expenses, and savings with a calm, clear dashboard.'
    : 'Join FinTrackker to track every dollar, build budgets, and stay on top of your goals.';
  toggleButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
}

async function loadCategories() {
  const categories = await getJson('/categories');
  [transactionCategory, budgetCategory, filterCategory].forEach((select) => {
    if (!select) return;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = select === filterCategory ? 'All categories' : 'Select category';
    select.appendChild(placeholder);
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
  });
}

async function loadSummary() {
  const summary = await getJson('/dashboard/summary');
  summaryGrid.innerHTML = [
    ['Income', summary.income],
    ['Expenses', summary.expenses],
    ['Savings', summary.savings]
  ].map(([label, value]) => `<div class="summary-card"><span>${label}</span><strong>$${value.toFixed(2)}</strong></div>`).join('');
}

async function loadTransactions(params = {}) {
  if (!transactionsList) return;
  const query = new URLSearchParams(params).toString();
  const transactions = await getJson(`/transactions${query ? `?${query}` : ''}`);
  transactionsList.innerHTML = transactions.length
    ? transactions.map((transaction) => `
        <div class="list-item">
          <div>
            <strong>${transaction.description || 'Untitled transaction'}</strong>
            <div class="meta">${transaction.date} • Category ${transaction.categoryId}</div>
            ${editingTransactionId === transaction.id ? `
              <div class="inline-edit">
                <input type="number" min="0" step="0.01" value="${transaction.amount}" id="editAmount${transaction.id}" />
                <select id="editType${transaction.id}">
                  <option value="income" ${transaction.type === 'income' ? 'selected' : ''}>Income</option>
                  <option value="expense" ${transaction.type === 'expense' ? 'selected' : ''}>Expense</option>
                </select>
                <input type="date" value="${transaction.date}" id="editDate${transaction.id}" />
                <input type="text" value="${transaction.description || ''}" id="editDescription${transaction.id}" />
                <button type="button" data-action="save" data-id="${transaction.id}">Save</button>
                <button type="button" data-action="cancel" data-id="${transaction.id}">Cancel</button>
              </div>
            ` : ''}
          </div>
          <div style="text-align:right">
            <span class="badge ${transaction.type}">${transaction.type}</span>
            <div><strong>$${Number(transaction.amount).toFixed(2)}</strong></div>
            ${editingTransactionId !== transaction.id ? `
              <div class="transaction-actions">
                <button type="button" data-action="edit" data-id="${transaction.id}">Edit</button>
                <button type="button" data-action="delete" data-id="${transaction.id}">Delete</button>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')
    : '<div class="list-item">No transactions yet.</div>';
}

async function loadRecentTransactions() {
  if (!recentTransactionsList) return;
  const transactions = await getJson('/transactions');
  const recent = [...transactions]
    .sort((left, right) => new Date(right.date) - new Date(left.date) || right.id - left.id)
    .slice(0, 5);

  recentTransactionsList.innerHTML = recent.length
    ? recent.map((transaction) => `
        <div class="list-item">
          <div>
            <strong>${transaction.description || 'Untitled transaction'}</strong>
            <div class="meta">${transaction.date} • Category ${transaction.categoryId}</div>
          </div>
          <div style="text-align:right">
            <span class="badge ${transaction.type}">${transaction.type}</span>
            <div><strong>$${Number(transaction.amount).toFixed(2)}</strong></div>
          </div>
        </div>
      `).join('')
    : '<div class="list-item">No recent transactions yet.</div>';
}

async function loadBudgets() {
  const budgets = await getJson('/budgets');
  const budgetMarkup = budgets.length
    ? budgets.map((budget) => `
        <div class="list-item">
          <div>
            <strong>Category ${budget.categoryId}</strong>
            <div class="meta">Limit $${Number(budget.limitAmount).toFixed(2)} • Month ${budget.month}</div>
          </div>
          <div style="text-align:right">
            <div>Spent $${Number(budget.spent || 0).toFixed(2)}</div>
            <div class="meta">Remaining $${Number(budget.remaining || 0).toFixed(2)}</div>
          </div>
        </div>
      `).join('')
    : '<div class="list-item">No budgets set.</div>';

  budgetsList.innerHTML = budgetMarkup;
  if (budgetSummaryList) {
    budgetSummaryList.innerHTML = budgets.length
      ? budgets.map((budget) => `
          <div class="list-item budget-summary-item">
            <div>
              <strong>Budget ${budget.categoryId}</strong>
              <div class="meta">${budget.month}</div>
            </div>
            <div class="budget-pill">$${Number(budget.limitAmount).toFixed(2)}</div>
          </div>
        `).join('')
      : '<div class="list-item">No budgets set.</div>';
  }
}

async function loadSavingsGraph() {
  if (!savingsGraph) return;
  const transactions = await getJson('/transactions');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const monthTotals = transactions.reduce((acc, tx) => {
    const month = tx.date.slice(0, 7);
    if (!acc[month]) acc[month] = { income: 0, expense: 0 };
    if (tx.type === 'income') acc[month].income += Number(tx.amount);
    if (tx.type === 'expense') acc[month].expense += Number(tx.amount);
    return acc;
  }, {});

  const currentSavings = (monthTotals[currentMonth]?.income || 0) - (monthTotals[currentMonth]?.expense || 0);
  const previousSavings = (monthTotals[previousMonth]?.income || 0) - (monthTotals[previousMonth]?.expense || 0);

  const maxValue = Math.max(Math.abs(currentSavings), Math.abs(previousSavings), 1);
  const currentHeight = Math.max(8, (currentSavings / maxValue) * 100);
  const previousHeight = Math.max(8, (previousSavings / maxValue) * 100);

  savingsGraph.innerHTML = `
    <div class="savings-bars">
      <div class="savings-bar-block">
        <div class="savings-bar ${previousSavings >= 0 ? 'positive' : 'negative'}" style="height:${Math.min(100, Math.abs(previousHeight))}%"></div>
        <span>${previousMonth}</span>
      </div>
      <div class="savings-bar-block">
        <div class="savings-bar ${currentSavings >= 0 ? 'positive' : 'negative'}" style="height:${Math.min(100, Math.abs(currentHeight))}%"></div>
        <span>${currentMonth}</span>
      </div>
    </div>
    <div class="savings-caption">Prev month: $${previousSavings.toFixed(2)} • This month: $${currentSavings.toFixed(2)}</div>
  `;
}

async function loadCategoryChart() {
  if (!categoryChart || !categoryGraph) return;
  const [breakdown, categories] = await Promise.all([
    getJson('/dashboard/category-wise'),
    getJson('/categories')
  ]);

  const categoryById = Object.fromEntries(categories.map((category) => [category.id, category.name]));

  categoryChart.innerHTML = breakdown.length
    ? breakdown.map((item) => `<div class="list-item"><span>${categoryById[item.categoryId] || `Category ${item.categoryId}`}</span><strong>$${Number(item.total).toFixed(2)}</strong></div>`).join('')
    : '<div class="list-item">No expense data yet.</div>';

  if (!breakdown.length) {
    categoryGraph.innerHTML = '<div class="graph-empty">No expense data yet.</div>';
    return;
  }

  const maxValue = Math.max(...breakdown.map((item) => Number(item.total) || 0), 1);
  categoryGraph.innerHTML = breakdown.map((item) => {
    const percent = Math.max(12, (Number(item.total) / maxValue) * 100);
    return `
      <div class="graph-row">
        <div class="graph-label">${categoryById[item.categoryId] || `Category ${item.categoryId}`}</div>
        <div class="graph-box">
          <div class="graph-bar" style="width:${percent}%"></div>
        </div>
        <strong>$${Number(item.total).toFixed(2)}</strong>
      </div>
    `;
  }).join('');
}

async function submitTransaction(payload) {
  await postJson('/transactions', payload);
  if (transactionForm) transactionForm.reset();
  closeTransactionModalView();
  await Promise.all([loadSummary(), loadTransactions(), loadBudgets(), loadCategoryChart(), loadRecentTransactions(), loadSavingsGraph()]);
}

if (transactionForm) {
  transactionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(transactionForm));
    payload.amount = Number(payload.amount);
    payload.categoryId = Number(payload.categoryId);
    await submitTransaction(payload);
  });
}

if (addTransactionFab) {
  addTransactionFab.addEventListener('click', openTransactionModal);
}

if (closeTransactionModal) {
  closeTransactionModal.addEventListener('click', closeTransactionModalView);
}

if (transactionModal) {
  transactionModal.addEventListener('click', (event) => {
    if (event.target === transactionModal) closeTransactionModalView();
  });
}

transactionsList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'edit') {
    editingTransactionId = Number(id);
    await loadTransactions();
    return;
  }
  if (action === 'cancel') {
    editingTransactionId = null;
    await loadTransactions();
    return;
  }
  if (action === 'delete') {
    await deleteJson(`/transactions/${id}`);
    editingTransactionId = null;
    await Promise.all([loadSummary(), loadTransactions(), loadBudgets(), loadCategoryChart(), loadRecentTransactions(), loadSavingsGraph()]);
    return;
  }
  if (action === 'save') {
    const payload = {
      amount: Number(document.getElementById(`editAmount${id}`).value),
      type: document.getElementById(`editType${id}`).value,
      date: document.getElementById(`editDate${id}`).value,
      description: document.getElementById(`editDescription${id}`).value
    };
    await putJson(`/transactions/${id}`, payload);
    editingTransactionId = null;
    await Promise.all([loadSummary(), loadTransactions(), loadBudgets(), loadCategoryChart(), loadRecentTransactions(), loadSavingsGraph()]);
  }
});

budgetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(budgetForm));
  payload.limitAmount = Number(payload.limitAmount);
  payload.categoryId = Number(payload.categoryId);
  await postJson('/budgets', payload);
  budgetForm.reset();
  await loadBudgets();
});

filterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(filterForm));
  const params = {};
  if (payload.type) params.type = payload.type;
  if (payload.categoryId) params.categoryId = payload.categoryId;
  if (payload.startDate) params.startDate = payload.startDate;
  if (payload.endDate) params.endDate = payload.endDate;
  await loadTransactions(params);
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));
  if (data.email && data.password && (authMode === 'login' || data.name)) {
    const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
    const payload = authMode === 'register'
      ? { name: data.name, email: data.email, password: data.password }
      : { email: data.email, password: data.password };
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      showLogin(result.error || (authMode === 'register' ? 'Registration failed.' : 'Login failed.'));
      return;
    }
    localStorage.setItem('fintrackker-token', result.token);
    showApp();
    await loadCategories();
    await Promise.all([loadSummary(), loadTransactions(), loadBudgets(), loadCategoryChart(), loadRecentTransactions(), loadSavingsGraph()]);
    loginForm.reset();
  } else {
    showLogin(authMode === 'login' ? 'Please enter your credentials.' : 'Please enter your name, email, and password.');
  }
});

toggleButtons.forEach((button) => {
  button.addEventListener('click', () => setAuthMode(button.dataset.mode));
});

function toggleOverviewOnlyContent(viewName) {
  overviewOnlyWidgets.forEach((element) => {
    element.style.display = viewName === 'overview' ? '' : 'none';
  });
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    navButtons.forEach((item) => item.classList.toggle('active', item === button));
    viewSections.forEach((section) => {
      section.classList.toggle('active', section.id === `view-${button.dataset.view}`);
    });
    toggleOverviewOnlyContent(button.dataset.view);
  });
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('fintrackker-token');
  showLogin('You have been logged out.');
  loginForm.reset();
});

(async () => {
  setAuthMode('login');
  toggleOverviewOnlyContent('overview');
  showLogin();
})();
