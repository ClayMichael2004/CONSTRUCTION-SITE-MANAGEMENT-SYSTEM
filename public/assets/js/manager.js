// assets/js/manager.js
const token = localStorage.getItem('token');
if (!token) window.location.href = '/login.html';

function authHeaders() {
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
  document.querySelector(`#nav${id[0].toUpperCase() + id.slice(1)}`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = document.querySelector(`#nav${id[0].toUpperCase() + id.slice(1)}`)?.textContent || 'Dashboard';
}

/* nav bindings */
document.getElementById('navDashboard').addEventListener('click', e => { e.preventDefault(); showSection('dashboard'); });
document.getElementById('navWorkers').addEventListener('click', e => { e.preventDefault(); showSection('workers'); loadWorkers(); });
document.getElementById('navAttendance').addEventListener('click', e => { e.preventDefault(); showSection('attendance'); loadAttendance(); });
document.getElementById('navInventory').addEventListener('click', e => { e.preventDefault(); showSection('inventory'); loadInventory(); });
document.getElementById('navPayments').addEventListener('click', e => { e.preventDefault(); showSection('payments'); loadPayments(); });
document.getElementById('navReports').addEventListener('click', e => { e.preventDefault(); showSection('reports'); loadReports(); });

document.getElementById('logoutBtn').addEventListener('click', (e) => { e.preventDefault(); localStorage.removeItem('token'); window.location.href = '/login.html'; });


async function fetchJson(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.msg || JSON.stringify(body) || `HTTP ${res.status}`);
  }
  return body;
}

/* Dashboard */
async function loadDashboard() {
  try {
    const data = await fetchJson('/api/manager/dashboard');
    document.getElementById('managerName').textContent = data.manager.name;
    document.getElementById('sidebarName').textContent = data.manager.name;
    document.getElementById('managerSite').textContent = `Site: ${data.site.name}`;
    document.getElementById('sidebarSite').textContent = data.site.name;
    document.getElementById('cardSiteName').textContent = data.site.name;
    document.getElementById('cardTotalWorkers').textContent = data.totalWorkers ?? 0;
    document.getElementById('cardPresent').textContent = data.totalPresent ?? 0;
    document.getElementById('cardPending').textContent = data.pendingPayments ?? 0;
  } catch (err) {
    console.error('Dashboard load error', err);
    // if token expired -> redirect to login
    if (String(err).toLowerCase().includes('invalid token') || String(err).toLowerCase().includes('no token')) {
      alert('Session expired. Please login again.');
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    }
  }
}

/* Workers */
async function loadWorkers() {
  try {
    const data = await fetchJson('/api/manager/workers');
    const tbody = document.querySelector('#workersTable tbody');
    tbody.innerHTML = '';
    (data || []).forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${w.full_name}</td><td>${w.role || ''}</td><td>${w.phone || ''}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadWorkers error', err);
  }
}

/* Attendance */
async function loadAttendance() {
  try {
    const data = await fetchJson('/api/manager/attendance');
    const tbody = document.querySelector('#attendanceTable tbody');
    tbody.innerHTML = '';
    (data || []).forEach(a => {
      const d = a.date ? new Date(a.date).toLocaleDateString() : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${a.worker_name}</td><td>${a.role || ''}</td><td>${a.phone || ''}</td><td>${d}</td><td>${a.status}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadAttendance error', err);
  }
}

/* Inventory */
async function loadInventory() {
  try {
    const data = await fetchJson('/api/manager/inventory');
    const tbody = document.querySelector('#inventoryTable tbody');
    tbody.innerHTML = '';
    (data || []).forEach(i => {
      const lu = i.updated_at ? new Date(i.updated_at).toLocaleString() : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i.item_name}</td><td>${i.quantity}</td><td>${i.taken_by || ''}</td><td>${i.site || ''}</td><td>${lu}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadInventory error', err);
  }
}

/* Payments */
async function loadPayments() {
  try {
    const data = await fetchJson('/api/manager/payments');
    const tbody = document.querySelector('#paymentsTable tbody');
    tbody.innerHTML = '';
    (data || []).forEach(p => {
      const tr = document.createElement('tr');
      const action = p.status === 'Pending' ? `<button class="btn small" onclick="approvePayment(${p.id})">Approve</button>` : `${p.status} <div class="muted-sm">By: ${p.approved_by || '—'}</div>`;
      tr.innerHTML = `<td>${p.worker_name}</td><td>${p.role || ''}</td><td>${p.days_worked ?? ''}</td><td>${p.amount ?? ''}</td><td>${p.status}</td><td>${action}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('loadPayments error', err);
  }
}

window.approvePayment = async function(id) {
  if (!confirm('Approve payment and mark as paid?')) return;
  try {
    const res = await fetchJson(`/api/manager/payments/${id}/mark-paid`, { method: 'PUT' });
    alert(res.msg || 'Payment approved');
    loadPayments();
    loadDashboard(); // update pending count
  } catch (err) {
    console.error('approvePayment error', err);
    alert('Failed to approve payment: ' + err.message);
  }
};

/* Reports */
async function loadReports() {
  try {
    const data = await fetchJson('/api/manager/reports');
    const container = document.getElementById('reportsSummary');
    container.innerHTML = `
      <p>Total Workers: <strong>${data.totalWorkers ?? 0}</strong></p>
      <p>Total Paid: <strong>${(data.totalPaid ?? 0).toFixed ? (data.totalPaid).toFixed(2) : data.totalPaid}</strong></p>
      <p>Pending Payments: <strong>${data.totalPendingPayments ?? 0}</strong></p>
    `;
  } catch (err) {
    console.error('loadReports error', err);
  }
}

/* init */
(async function init() {
  await loadDashboard();
  // keep dashboard visible by default
})();
