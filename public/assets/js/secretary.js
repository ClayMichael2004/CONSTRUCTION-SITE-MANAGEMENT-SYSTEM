// assets/js/secretary.js
const API = "/api/secretary";
const ROLES_API = "/api/roles";
const token = sessionStorage.getItem('token') || '';
const role = sessionStorage.getItem('role') || '';
let userSiteId = sessionStorage.getItem('siteId') || localStorage.getItem('site') || '';
let userSiteName = sessionStorage.getItem('siteName') || '';

if (!token ||  role!=="secretary") {
  window.location.href = '/login.html';
}


// ✅ Optional backend verification
async function verifySecretary() {
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    if (!res.ok || data.role !== "secretary") {
      alert("Access denied — invalid session.");
      window.location.href = "login.html";
    }
  } catch (err) {
    console.error("Verification error:", err);
    window.location.href = "login.html";
  }
}

verifySecretary();

function decodeJwtPayload(t) {
  try {
    const payload = t.split('.')[1];
    const json = atob(payload.replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch (e) {
    return null;
  }
}

if (!userSiteId && token) {
  const payload = decodeJwtPayload(token);
  if (payload) {
    userSiteId = payload.siteId || payload.site_id || payload.site || '';
    if (userSiteId) sessionStorage.setItem('siteId', userSiteId);
  }
}

function authHeaders() {
  return token ? { "Content-Type": "application/json", "Authorization": "Bearer " + token } : { "Content-Type": "application/json" };
}

async function resolveSiteNameIfNeeded() {
  if (userSiteName) return userSiteName;
  if (!userSiteId) return null;
  try {
    const res = await fetch('/api/sites', { headers: authHeaders() });
    if (!res.ok) {
      userSiteName = String(userSiteId);
      sessionStorage.setItem('siteName', userSiteName);
      return userSiteName;
    }
    const sites = await res.json();
    const found = sites.find(s => String(s.id) === String(userSiteId));
    if (found) { userSiteName = found.name; sessionStorage.setItem('siteName', userSiteName); return userSiteName; }
    userSiteName = String(userSiteId); sessionStorage.setItem('siteName', userSiteName); return userSiteName;
  } catch (err) {
    userSiteName = String(userSiteId); sessionStorage.setItem('siteName', userSiteName); return userSiteName;
  }
}

function showMessage(el, text, type = 'error') {
  el.textContent = text;
  el.className = 'form-message ' + (type === 'success' ? 'success' : 'error');
  setTimeout(() => { el.textContent = ''; }, 4500);
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// navigation
document.getElementById('navWorkers').addEventListener('click', () => showSection('workers'));
document.getElementById('navAttendance').addEventListener('click', () => showSection('attendance'));
document.getElementById('navInventory').addEventListener('click', () => showSection('inventory'));
document.getElementById('navPayments').addEventListener('click', () => showSection('payments'));
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token'); localStorage.removeItem('role'); localStorage.removeItem('site'); localStorage.removeItem('siteId'); localStorage.removeItem('siteName'); localStorage.removeItem('name');
  window.location.href = '/login.html';
});

async function adaptUI() {
  document.getElementById('sidebarName').textContent = localStorage.getItem('name') || '';
  const sidebarSite = document.getElementById('sidebarSite');

  const siteName = await resolveSiteNameIfNeeded();
  if (siteName) {
    sidebarSite.textContent = `Site: ${siteName}`;
  } else {
    sidebarSite.textContent = 'No site assigned';
  }

  if (role === 'secretary') {
    const siteInputs = document.querySelectorAll('#workerSiteInput, #inventorySiteInput');
    siteInputs.forEach(i => { if (i) i.style.display = 'none'; });

    ['workersControls','attendanceControls','inventoryControls','paymentsControls'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div class="muted">Site: <strong>${siteName || '—'}</strong></div>`;
    });

  } else {
    try {
      const res = await fetch('/api/sites', { headers: authHeaders() });
      if (!res.ok) throw new Error('no sites api');
      const list = await res.json();
      function makeSelect(id) {
        const sel = document.createElement('select');
        sel.id = id + 'Select';
        const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = 'All'; sel.appendChild(optAll);
        list.forEach(s => { const o = document.createElement('option'); o.value = s.name || s.id; o.textContent = s.name || s.id; sel.appendChild(o); });
        return sel;
      }
      document.getElementById('workersControls').appendChild(makeSelect('workersSite'));
      document.getElementById('attendanceControls').appendChild(makeSelect('attendanceSite'));
      document.getElementById('inventoryControls').appendChild(makeSelect('inventorySite'));
      document.getElementById('paymentsControls').appendChild(makeSelect('paymentsSite'));
    } catch (err) {
      ['workersControls','attendanceControls','inventoryControls','paymentsControls'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<label>Site: <input id="${id}Input" placeholder="Site name"/></label>`;
      });
    }
  }
}

async function fetchAuth(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/* ---------------- ROLES ---------------- */
async function loadRolesDropdown() {
  try {
    const { ok, body } = await fetchAuth(`${ROLES_API}`);
    if (!ok) return;
    const sel = document.getElementById('roleSelect');
    if (!sel) return;
    sel.innerHTML = `<option value="">Select Role</option>`;
    body.forEach(r => {
      const o = document.createElement('option');
      o.value = r.name;
      o.textContent = r.name;
      sel.appendChild(o);
    });
  } catch (err) {
    console.error('Failed to load roles', err);
  }
}


/* ---------------- WORKERS ---------------- */
async function loadWorkers() {
  let url = `${API}/workers`;
  const { ok, body } = await fetchAuth(url);
  if (!ok) return console.error('Failed to load workers', body);
  const tbody = document.querySelector('#workersTable tbody'); tbody.innerHTML = '';
  const select = document.querySelector('#attendanceForm select[name=worker_id]'); if (select) select.innerHTML = '';
  body.forEach(w => {
    const created = w.created_at ? new Date(w.created_at).toLocaleString() : '';
    tbody.innerHTML += `<tr><td>${w.full_name}</td><td>${w.phone}</td><td>${w.role || ''}</td><td>${w.site || ''}</td><td>${created}</td></tr>`;
    if (select) select.innerHTML += `<option value="${w.id}">${w.full_name} (${w.site || ''})</option>`;
  });
}

document.getElementById('workerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('workerMessage');
  const data = Object.fromEntries(new FormData(e.target));
  if (role === 'secretary') delete data.site;
  if (!data.full_name || !data.phone) return showMessage(msg, "Name and phone required");
  if (!data.role) return showMessage(msg, "Role is required");
  const { ok, body } = await fetchAuth(`${API}/workers`, { method: 'POST', body: JSON.stringify(data) });
  if (!ok) return showMessage(msg, body.error || body.msg || "Failed to register worker");
  showMessage(msg, "Worker registered", "success");
  e.target.reset();
  loadWorkers();
});

/* ---------------- ATTENDANCE ---------------- */
async function loadAttendance() {
  const { ok, body } = await fetchAuth(`${API}/attendance`);
  if (!ok) return console.error('Failed to load attendance', body);
  const tbody = document.querySelector('#attendanceTable tbody'); tbody.innerHTML = '';
  body.forEach(r => {
    tbody.innerHTML += `<tr><td>${r.full_name}</td><td>${r.site}</td><td>${r.phone}</td><td>${r.date}</td><td>${r.status}</td></tr>`;
  });
}

document.getElementById('attendanceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('attendanceMessage');
  const data = Object.fromEntries(new FormData(e.target));
  const today = new Date().toISOString().slice(0,10);
  if (data.date !== today) return showMessage(msg, "Attendance can only be marked for today's date");
  const { ok, body } = await fetchAuth(`${API}/attendance`, { method: 'POST', body: JSON.stringify(data) });
  if (!ok) return showMessage(msg, body.error || body.msg || "Failed to mark attendance");
  showMessage(msg, "Attendance marked", "success");
  e.target.reset();
  loadAttendance();
});

document.getElementById('printAttendance').addEventListener('click', () => {
  const html = document.getElementById('attendanceTable').outerHTML;
  const w = window.open("", "", "height=700,width=900");
  w.document.write("<html><head><title>Print</title></head><body>" + html + "</body></html>");
  w.document.close(); w.print();
});

/* ---------------- INVENTORY ---------------- */
async function loadInventory() {
  const { ok, body } = await fetchAuth(`${API}/inventory`);
  if (!ok) return console.error('Failed to load inventory', body);
  const tbody = document.querySelector('#inventoryTable tbody'); tbody.innerHTML = '';
  body.forEach(i => {
    tbody.innerHTML += `<tr><td>${i.item_name}</td><td>${i.quantity}</td><td>${i.site || ''}</td><td><button class="secondary" onclick="promptUpdateInventory(${i.id})">Update</button></td></tr>`;
  });
}

document.getElementById('inventoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('inventoryMessage');
  const data = Object.fromEntries(new FormData(e.target));
  if (role === 'secretary') delete data.site;
  if (!data.item_name || data.quantity == null) return showMessage(msg, "Item and quantity required");
  const { ok, body } = await fetchAuth(`${API}/inventory`, { method: 'POST', body: JSON.stringify(data) });
  if (!ok) return showMessage(msg, body.error || body.msg || "Failed to add inventory");
  showMessage(msg, "Inventory added", "success");
  e.target.reset();
  loadInventory();
});

window.promptUpdateInventory = async (id) => {
  const q = prompt("Enter new quantity:");
  if (q == null) return;
  const taken_by = prompt("Enter name of person taking the item:");
  if (taken_by == null) return;
  const { ok, body } = await fetchAuth(`${API}/inventory/${id}`, { method: 'PUT', body: JSON.stringify({ quantity: q, taken_by }) });
  if (!ok) return alert(body.error || body.msg || "Failed");
  loadInventory();
};

/* ---------------- PAYMENTS ---------------- */
async function loadPayments(period = "weekly") {
  const { ok, body } = await fetchAuth(`${API}/payments?period=${encodeURIComponent(period)}`);
  if (!ok) return console.error('Failed to load payments', body);
  const tbody = document.querySelector('#paymentsTable tbody'); tbody.innerHTML = '';
  body.forEach(p => {
    tbody.innerHTML += `<tr><td>${p.workerName}</td><td>${p.role || ''}</td><td>${p.phone}</td><td>${p.site}</td><td>${p.daysWorked}</td><td>${p.amount}</td></tr>`;
  });
}

document.getElementById('weeklyBtn').addEventListener('click', () => loadPayments('weekly'));
document.getElementById('monthlyBtn').addEventListener('click', () => loadPayments('monthly'));
document.getElementById('printPayments').addEventListener('click', () => {
  const html = document.getElementById('paymentsTable').outerHTML;
  const w = window.open("", "", "height=700,width=900");
  w.document.write("<html><head><title>Print</title></head><body>" + html + "</body></html>");
  w.document.close(); w.print();
});

/* ---------------- INIT ---------------- */
(async function init() {
  await adaptUI();
  await loadRolesDropdown();
  await loadWorkers();
  await loadAttendance();
  await loadInventory();
  await loadPayments('weekly');
})();


document.addEventListener('DOMContentLoaded', ()=>{
  loadRolesDropdown();
});