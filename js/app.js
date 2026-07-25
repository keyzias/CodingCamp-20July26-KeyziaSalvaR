/**
 * Expense & Budget Visualizer
 * Vanilla JS — no frameworks
 * Features: CRUD, localStorage, Chart.js pie chart,
 *   dark/light mode, custom categories, monthly summary,
 *   sort by amount/category, spending limit highlight
 */

'use strict';

/* =============================================
   Constants & Storage Keys
   ============================================= */
const STORAGE_KEYS = {
  TRANSACTIONS: 'evb_transactions',
  CATEGORIES:   'evb_categories',
  THEME:        'evb_theme',
  LIMIT:        'evb_limit',
};

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

/* Category colours for the pie chart */
const CATEGORY_COLORS = {
  Food:      '#22c55e',
  Transport: '#3b82f6',
  Fun:       '#f97316',
};
const FALLBACK_COLORS = [
  '#a855f7', '#ec4899', '#14b8a6', '#eab308',
  '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16',
];

/* =============================================
   State
   ============================================= */
let transactions  = [];
let customCategories = [];
let spendingLimit = 0;
let sortMode      = 'date-desc';
let viewYear      = new Date().getFullYear();
let viewMonth     = new Date().getMonth(); // 0-indexed
let chartInstance = null;

/* =============================================
   DOM References
   ============================================= */
const $ = id => document.getElementById(id);

const dom = {
  form:              $('transaction-form'),
  itemName:          $('item-name'),
  amount:            $('amount'),
  category:          $('category'),
  limitInput:        $('spending-limit'),
  totalBalance:      $('total-balance'),
  txList:            $('transaction-list'),
  noTransactions:    $('no-transactions'),
  noChartData:       $('no-chart-data'),
  chartCanvas:       $('spending-chart'),
  sortSelect:        $('sort-select'),
  themeToggle:       $('theme-toggle'),
  themeIcon:         $('theme-icon'),
  limitAlert:        $('limit-alert'),
  limitDisplay:      $('limit-display'),
  monthLabel:        $('current-month-label'),
  monthlyTotal:      $('monthly-total-amount'),
  prevMonth:         $('prev-month'),
  nextMonth:         $('next-month'),
  addCategoryBtn:    $('add-category-btn'),
  modal:             $('custom-category-modal'),
  modalCancel:       $('modal-cancel'),
  modalConfirm:      $('modal-confirm'),
  customCatInput:    $('custom-category-input'),
  errorName:         $('error-name'),
  errorAmount:       $('error-amount'),
  errorCategory:     $('error-category'),
  errorCustomCat:    $('error-custom-category'),
};

/* =============================================
   LocalStorage Helpers
   ============================================= */
function loadFromStorage() {
  try {
    transactions     = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) || [];
    customCategories = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES))   || [];
    spendingLimit    = parseFloat(localStorage.getItem(STORAGE_KEYS.LIMIT))        || 0;
  } catch {
    transactions     = [];
    customCategories = [];
    spendingLimit    = 0;
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(customCategories));
}

function saveLimit() {
  localStorage.setItem(STORAGE_KEYS.LIMIT, spendingLimit);
}

/* =============================================
   Theme
   ============================================= */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || preferred);
}

dom.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* =============================================
   Category Helpers
   ============================================= */
function getAllCategories() {
  return [...DEFAULT_CATEGORIES, ...customCategories];
}

function getCategoryColor(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  // Deterministic colour from fallback palette
  const idx = getAllCategories().indexOf(category) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[Math.max(idx, 0)];
}

function populateCategorySelect() {
  // Keep default placeholder + defaults, add custom ones
  const select = dom.category;
  // Remove any options beyond defaults
  while (select.options.length > DEFAULT_CATEGORIES.length + 1) {
    select.remove(select.options.length - 1);
  }
  customCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

/* =============================================
   Custom Category Modal
   ============================================= */
function openModal() {
  dom.customCatInput.value = '';
  dom.errorCustomCat.textContent = '';
  dom.modal.classList.remove('hidden');
  dom.customCatInput.focus();
}

function closeModal() {
  dom.modal.classList.add('hidden');
}

dom.addCategoryBtn.addEventListener('click', openModal);
dom.modalCancel.addEventListener('click', closeModal);

dom.modal.addEventListener('click', e => {
  if (e.target === dom.modal) closeModal();
});

dom.modal.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

dom.modalConfirm.addEventListener('click', () => {
  const name = dom.customCatInput.value.trim();
  if (!name) {
    dom.errorCustomCat.textContent = 'Category name cannot be empty.';
    dom.customCatInput.focus();
    return;
  }
  if (getAllCategories().map(c => c.toLowerCase()).includes(name.toLowerCase())) {
    dom.errorCustomCat.textContent = 'This category already exists.';
    dom.customCatInput.focus();
    return;
  }
  customCategories.push(name);
  saveCategories();
  populateCategorySelect();
  // Select the new category automatically
  dom.category.value = name;
  closeModal();
});

dom.customCatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') dom.modalConfirm.click();
});

/* =============================================
   Form Validation
   ============================================= */
function clearErrors() {
  [dom.errorName, dom.errorAmount, dom.errorCategory].forEach(el => el.textContent = '');
  [dom.itemName, dom.amount, dom.category].forEach(el => el.classList.remove('invalid'));
}

function validateForm() {
  let valid = true;

  const name   = dom.itemName.value.trim();
  const amount = dom.amount.value.trim();
  const cat    = dom.category.value;

  if (!name) {
    dom.errorName.textContent = 'Item name is required.';
    dom.itemName.classList.add('invalid');
    valid = false;
  }

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    dom.errorAmount.textContent = 'Enter a valid amount greater than 0.';
    dom.amount.classList.add('invalid');
    valid = false;
  }

  if (!cat) {
    dom.errorCategory.textContent = 'Please select a category.';
    dom.category.classList.add('invalid');
    valid = false;
  }

  return valid;
}

/* =============================================
   Add Transaction
   ============================================= */
dom.form.addEventListener('submit', e => {
  e.preventDefault();
  clearErrors();

  if (!validateForm()) return;

  // Update spending limit if provided
  const limitVal = parseFloat(dom.limitInput.value);
  if (!isNaN(limitVal) && limitVal > 0) {
    spendingLimit = limitVal;
    saveLimit();
  }

  const tx = {
    id:       crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    name:     dom.itemName.value.trim(),
    amount:   parseFloat(parseFloat(dom.amount.value).toFixed(2)),
    category: dom.category.value,
    date:     new Date().toISOString(),
  };

  transactions.unshift(tx); // newest first in storage
  saveTransactions();

  dom.form.reset();
  dom.limitInput.value = spendingLimit > 0 ? spendingLimit : '';

  renderAll();
  dom.itemName.focus();
});

/* =============================================
   Delete Transaction
   ============================================= */
function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveTransactions();
  renderAll();
}

/* =============================================
   Sorting
   ============================================= */
dom.sortSelect.addEventListener('change', () => {
  sortMode = dom.sortSelect.value;
  renderTransactionList();
});

function getSortedTransactions(list) {
  const copy = [...list];
  switch (sortMode) {
    case 'date-asc':
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    case 'date-desc':
    default:
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

/* =============================================
   Total Balance
   ============================================= */
function getTotalBalance() {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

function renderBalance() {
  dom.totalBalance.textContent = formatCurrency(getTotalBalance());
}

/* =============================================
   Spending Limit Alert
   ============================================= */
function renderLimitAlert() {
  if (spendingLimit > 0 && getTotalBalance() > spendingLimit) {
    dom.limitDisplay.textContent = formatCurrency(spendingLimit);
    dom.limitAlert.classList.remove('hidden');
  } else {
    dom.limitAlert.classList.add('hidden');
  }
}

/* =============================================
   Monthly Summary
   ============================================= */
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function renderMonthlySummary() {
  dom.monthLabel.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  const total = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);

  dom.monthlyTotal.textContent = formatCurrency(total);
}

dom.prevMonth.addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderMonthlySummary();
});

dom.nextMonth.addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderMonthlySummary();
});

/* =============================================
   Transaction List Render
   ============================================= */
function formatCurrency(value) {
  return 'Rp ' + value.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderTransactionList() {
  const sorted = getSortedTransactions(transactions);

  if (sorted.length === 0) {
    dom.txList.innerHTML = '';
    dom.noTransactions.classList.remove('hidden');
    return;
  }

  dom.noTransactions.classList.add('hidden');

  dom.txList.innerHTML = sorted.map(tx => {
    const overLimit = spendingLimit > 0 && tx.amount > spendingLimit;
    return `
      <li class="transaction-item${overLimit ? ' over-limit' : ''}" data-id="${tx.id}">
        <div class="tx-info">
          <span class="tx-name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</span>
          <span class="tx-amount">${formatCurrency(tx.amount)}</span>
          <div class="tx-meta">
            <span class="tx-category" style="background-color:${getCategoryColor(tx.category)}22;color:${getCategoryColor(tx.category)};border-color:${getCategoryColor(tx.category)}66">${escapeHtml(tx.category)}</span>
            <span class="tx-date">${formatDate(tx.date)}</span>
          </div>
        </div>
        <button class="btn-delete" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.name)}">Delete</button>
      </li>
    `.trim();
  }).join('');

  // Delegate delete clicks
  dom.txList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =============================================
   Pie Chart
   ============================================= */
function buildChartData() {
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels     = Object.keys(totals);
  const data       = labels.map(l => totals[l]);
  const colors     = labels.map(l => getCategoryColor(l));
  const colorsHalf = colors.map(c => c + 'cc'); // slight transparency for borders

  return { labels, data, colors, colorsHalf };
}

function renderChart() {
  const { labels, data, colors, colorsHalf } = buildChartData();

  if (data.length === 0) {
    dom.noChartData.classList.remove('hidden');
    dom.chartCanvas.classList.add('hidden');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  dom.noChartData.classList.add('hidden');
  dom.chartCanvas.classList.remove('hidden');

  if (chartInstance) {
    chartInstance.data.labels           = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.data.datasets[0].borderColor      = colorsHalf;
    chartInstance.update('active');
    return;
  }

  chartInstance = new Chart(dom.chartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor:      colorsHalf,
        borderWidth: 2,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getComputedStyle(document.documentElement)
              .getPropertyValue('--text-secondary').trim() || '#555',
            padding: 12,
            font: { size: 12, family: 'Segoe UI, system-ui, sans-serif' },
            boxWidth: 14,
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* Update chart legend colours when theme changes */
function updateChartTheme() {
  if (!chartInstance) return;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--text-secondary').trim() || '#555';
  chartInstance.options.plugins.legend.labels.color = color;
  chartInstance.update('none');
}

/* =============================================
   Master Render
   ============================================= */
function renderAll() {
  renderBalance();
  renderLimitAlert();
  renderTransactionList();
  renderChart();
  renderMonthlySummary();
}

/* =============================================
   Watch theme changes to update chart colours
   ============================================= */
const themeObserver = new MutationObserver(() => {
  updateChartTheme();
});
themeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

/* =============================================
   Initialise
   ============================================= */
function init() {
  loadFromStorage();
  initTheme();
  populateCategorySelect();

  // Restore limit input
  if (spendingLimit > 0) dom.limitInput.value = spendingLimit;

  // Restore sort preference
  dom.sortSelect.value = sortMode;

  renderAll();
}

init();
