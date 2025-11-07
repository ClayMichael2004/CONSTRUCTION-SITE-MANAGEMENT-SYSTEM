console.log("✅ manager.js loaded");

// ======== AUTH CHECK ========
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user"));

if (!token || !user) {
  console.warn("No token or user found — redirecting to login.");
  window.location.href = "login.html";
}

const headers = { Authorization: "Bearer " + token };

// ======== UI SETUP ========
document.getElementById("managerName").textContent = user.name || "Manager";
document.getElementById("managerSite").textContent = "Site: " + (user.siteName || "—");
document.getElementById("sidebarName").textContent = user.name || "Manager";
document.getElementById("sidebarSite").textContent = "Site: " + (user.siteName || "—");

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "login.html";
});

// ======== FETCH HELPER ========
async function getJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Fetch failed ${url}:`, text);
    throw new Error(text);
  }
  return res.json();
}

// ======== LOADERS ========

// DASHBOARD
async function loadDashboard() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/dashboard");
    document.getElementById("cardSiteName").textContent = data.site.name || user.siteName || "—";
    document.getElementById("cardTotalWorkers").textContent = data.totalWorkers || 0;
    document.getElementById("cardPresent").textContent = data.totalPresent || 0;
    document.getElementById("cardPending").textContent = data.pendingPayments || 0;
  } catch (e) {
    console.error("Dashboard load error:", e);
  }
}

// WORKERS
async function loadWorkers() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/workers");
    const tbody = document.querySelector("#workersTable tbody");
    tbody.innerHTML = data.map(
      w => `<tr><td>${w.full_name}</td><td>${w.role}</td><td>${w.phone}</td></tr>`
    ).join("");
  } catch (e) {
    console.error("Workers load error:", e);
  }
}

// ATTENDANCE
// Add date filter event listener
document.getElementById("attendanceFilterBtn")?.addEventListener("click", () => {
  const date = document.getElementById("attendanceDateFilter")?.value;
  loadAttendance(date);
});


async function loadAttendance(date = "") {
  try {
    let url = "http://localhost:5000/api/manager/attendance";
    if (date) url += `?date=${date}`;
    const data = await getJson(url);
    const tbody = document.querySelector("#attendanceTable tbody");
    if (!Array.isArray(data)) return (tbody.innerHTML = "<tr><td colspan='5'>No records found</td></tr>");
    tbody.innerHTML = data
      .map(
        a => `<tr><td>${a.worker_name}</td><td>${a.role}</td><td>${a.phone}</td><td>${new Date(
          a.date
        ).toLocaleDateString()}</td><td>${a.status}</td></tr>`
      )
      .join("");
  } catch (e) {
    console.error("Attendance load error:", e);
  }
}


// INVENTORY
async function loadInventory() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/inventory");
    const tbody = document.querySelector("#inventoryTable tbody");
    tbody.innerHTML = data.map(
      i => `<tr><td>${i.item_name}</td><td>${i.quantity}</td><td>${i.taken_by || "—"}</td><td>${i.site || "—"}</td><td>${new Date(i.updated_at).toLocaleString()}</td></tr>`
    ).join("");
  } catch (e) {
    console.error("Inventory load error:", e);
  }
}
// === PAYMENTS ===
async function loadPayments() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/payments");
    console.log("📦 Payments data:", data);

    const tbody = document.querySelector("#paymentsTable tbody");

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${p.worker_name}</td>
        <td>${p.role}</td>
        <td>${p.days_worked ?? '-'}</td>
        <td>${p.amount ?? '-'}</td>
        <td class="status ${p.status?.toLowerCase() || ''}">${p.status ?? 'Pending'}</td>
        <td>
          ${
            p.status === "Pending" || !p.payment_id
              ? `<button class="btn mark-paid" data-worker="${p.worker_id}">Mark Paid</button>`
              : "—"
          }
        </td>
      </tr>
    `).join("");

    // === Attach Mark Paid listeners ===
    tbody.querySelectorAll(".mark-paid").forEach(btn => {
      btn.addEventListener("click", () => {
        const workerId = btn.getAttribute("data-worker");
        console.log("🔍 Worker ID:", workerId);
        markPaymentAsPaid(workerId, btn);
      });
    });

  } catch (e) {
    console.error("Payments load error:", e);
  }
}

// === INDIVIDUAL MARK AS PAID (Attendance-based) ===
async function markPaymentAsPaid(workerId, btn) {
  try {
    const response = await fetch(`http://localhost:5000/api/manager/payments/mark-paid`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ worker_id: workerId }),
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(`❌ ${data.msg || "Mark paid failed"}`, "error");
      return;
    }

    showToast(`✅ ${data.msg} (${data.period_start} → ${data.period_end})`, "success");

    // Refresh both Payments and Reports
    loadPayments();
    loadReports();

  } catch (err) {
    console.error("Mark paid error:", err);
    showToast("❌ Network error marking payment", "error");
  }
}

document.getElementById("closePeriodBtn").addEventListener("click", async () => {
  if (!confirm("Are you sure you want to close the current payment period?")) return;

  try {
    const response = await fetch(`http://localhost:5000/api/manager/payments/close-period`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      }
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(`❌ ${data.msg || "Failed to close period"}`, "error");
      return;
    }

    showToast(`✅ ${data.msg} (${data.period_start} → ${data.period_end})`, "success");

    // Refresh both tables
    loadPayments();
    loadReports();

  } catch (err) {
    console.error("Close period error:", err);
    showToast("❌ Server error while closing period", "error");
  }
});


// === Simple Toast Notification ===
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    background: type === "error" ? "#ff4d4f" : "#4caf50",
    color: "white",
    padding: "10px 16px",
    borderRadius: "8px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    zIndex: 9999,
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}


// === EXPORT APPROVED PAYMENTS TO CSV ===
function exportApprovedToCSV() {
  const rows = [...document.querySelectorAll('#paymentsTable tbody tr')];
  const approved = rows.filter(r =>
    r.querySelector('.status')?.textContent.trim().toLowerCase() === 'approved'
  );

  if (approved.length === 0) {
    showToast('No approved payments found', 'info');
    return;
  }

  let csvContent = 'Worker Name,Days Worked,Amount,Status\n';
  approved.forEach(row => {
    const cols = row.querySelectorAll('td');
    const name = cols[0].textContent.trim();
    const days = cols[1].textContent.trim();
    const amount = cols[2].textContent.trim();
    const status = cols[3].textContent.trim();
    csvContent += `${name},${days},${amount},${status}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'approved_payments.csv';
  link.click();

  showToast('📄 CSV exported successfully', 'success');
}

// === EXPORT APPROVED PAYMENTS TO PDF ===
function exportApprovedToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const rows = [...document.querySelectorAll('#paymentsTable tbody tr')];
  const approved = rows.filter(r =>
    r.querySelector('.status')?.textContent.trim().toLowerCase() === 'approved'
  );

  if (approved.length === 0) {
    showToast('No approved payments found', 'info');
    return;
  }

  let y = 20;
  doc.setFontSize(14);
  doc.text('Approved Payments Report', 14, 15);

  doc.setFontSize(11);
  doc.text('Worker Name', 14, y);
  doc.text('Days', 80, y);
  doc.text('Amount', 110, y);
  doc.text('Status', 160, y);
  y += 6;

  approved.forEach(row => {
    const cols = row.querySelectorAll('td');
    const name = cols[0].textContent.trim();
    const days = cols[1].textContent.trim();
    const amount = cols[2].textContent.trim();
    const status = cols[3].textContent.trim();

    doc.text(name, 14, y);
    doc.text(days, 80, y);
    doc.text(amount, 110, y);
    doc.text(status, 160, y);
    y += 6;
  });

  doc.save('approved_payments.pdf');
  showToast('📘 PDF exported successfully', 'success');
}





// REPORTS
async function loadReports() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/reports");

    const summaryHtml = `
      <p><b>Total Workers:</b> ${data.totalWorkers}</p>
      <p><b>Total Paid:</b> KES ${data.totalPaid.toLocaleString()}</p>
      <p><b>Pending Payments:</b> ${data.totalPendingPayments}</p>
    `;

    // Generate payment history table
    const historyHtml = data.paymentHistory && data.paymentHistory.length
      ? `
        <h4>Payment History</h4>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Worker</th>
              <th>Amount (KES)</th>
              <th>Status</th>
              <th>Approved On</th>
              <th>Closed On</th>
            </tr>
          </thead>
          <tbody>
            ${data.paymentHistory.map(h => `
              <tr>
                <td>${h.id}</td>
                <td>${h.worker_name}</td>
                <td>${Number(h.amount).toLocaleString()}</td>
                <td>${h.status}</td>
                <td>${h.approved_at ? new Date(h.approved_at).toLocaleDateString() : '--'}</td>
                <td>${h.closed_at ? new Date(h.closed_at).toLocaleDateString() : '--'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : `<p>No payment history yet.</p>`;

    document.getElementById("reportsSummary").innerHTML = summaryHtml + historyHtml;

  } catch (e) {
    console.error("Reports load error:", e);
  }
}


// ======== NAVIGATION ========
const navs = document.querySelectorAll(".sidebar nav a");
const sections = document.querySelectorAll(".section");
navs.forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    navs.forEach(n => n.classList.remove("active"));
    link.classList.add("active");
    sections.forEach(s => s.classList.remove("active"));
    const id = link.id.replace("nav", "").toLowerCase();
    document.getElementById(id).classList.add("active");
    document.getElementById("pageTitle").textContent = link.textContent;
    switch (id) {
      case "dashboard": loadDashboard(); break;
      case "workers": loadWorkers(); break;
      case "attendance": loadAttendance(); break;
      case "inventory": loadInventory(); break;
      case "payments": loadPayments(); break;
      case "reports": loadReports(); break;
    }
  });
});

// ======== INITIAL LOAD ========
loadDashboard();
