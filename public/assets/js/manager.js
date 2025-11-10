console.log("✅ manager.js loaded");

// ======== AUTH CHECK ========
const token = sessionStorage.getItem("token");
const user = JSON.parse(sessionStorage.getItem("user"));

if (!token || !user ||user.role !=="manager") {
  console.warn("No token or user found — redirecting to login.");
  window.location.href = "login.html";
}

// Role mismatch guard
if (user.role !== "manager") {
  alert("Unauthorized access. Redirecting...");
  window.location.href = "login.html";
}

const headers = { Authorization: "Bearer " + token };

// ✅ Optional backend verification
async function verifyManager() {
  try {
    const res = await fetch("/api/auth/me", { headers });
    const data = await res.json();
    if (!res.ok || data.role !== "manager") {
      alert("Access denied — invalid session.");
      window.location.href = "login.html";
    }
  } catch (err) {
    console.error("Verification error:", err);
    window.location.href = "login.html";
  }
}

verifyManager();

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
    const res = await fetch("http://localhost:5000/api/manager/payments", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (!res.ok) throw new Error("Failed to load payments");

    const { pending, approved } = await res.json();

    const pendingList = document.getElementById("pendingList");
    const approvedList = document.getElementById("approvedList");

    // Render pending payments
    pendingList.innerHTML = pending.map(p => `
      <li>
        ${p.worker_name} - ${p.role} (${p.days_worked} days, KES ${p.amount})
        <button class="btn mark-paid" data-id="${p.worker_id}">Mark Paid</button>
      </li>
    `).join("");

    // Render approved payments
    approvedList.innerHTML = approved.map(p => `
      <li>
        ${p.worker_name} - ${p.role} (${p.days_worked} days, KES ${p.amount})
        <button class="btn confirm" data-id="${p.payment_id}">Confirm (SMS)</button>
      </li>
    `).join("");

    // Mark paid buttons
    document.querySelectorAll(".mark-paid").forEach(b => {
      b.onclick = () => markPaid(b.dataset.id);
    });

    // Confirm (SMS) buttons
    document.querySelectorAll(".confirm").forEach(b => {
      b.onclick = async () => {
        const paymentId = b.dataset.id;
        try {
          const res = await fetch("http://localhost:5000/api/manager/payments/confirm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({ payment_id: paymentId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.msg || "Error confirming payment");
          showToast(data.msg, "success");
          loadPayments();
        } catch (err) {
          console.error(err);
          showToast(err.message, "error");
        }
      };
    });

  } catch (err) {
    console.error("Load payments error:", err);
    showToast("Failed to load payments", "error");
  }
}

// === Mark Payment ===
async function markPaid(workerId) {
  try {
    const res = await fetch("http://localhost:5000/api/manager/payments/mark-paid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ worker_id: workerId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Error marking payment");
    showToast(data.msg, "success");
    loadPayments();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
}

// === Close Payment Period ===
document.getElementById("closePeriodBtn").onclick = async () => {
  if (!confirm("Close current period?")) return;
  try {
    const res = await fetch("http://localhost:5000/api/manager/payments/close-period", {
      method: "PUT",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || "Error closing period");
    showToast(data.msg, "success");
    loadPayments();
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
};

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
