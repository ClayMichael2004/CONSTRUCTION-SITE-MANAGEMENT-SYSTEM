console.log("✅ manager.js loaded");

// ======== AUTH CHECK ========
const token = localStorage.getItem("token");
let user = null;

// Parse user safely
try {
  user = JSON.parse(localStorage.getItem("user"));
} catch (e) {
  console.warn("Failed to parse user:", e);
}

// If no token or user, redirect
if (!token || !user) {
  console.warn("No token or user found — redirecting to login.");
  window.location.href = "login.html";
}

// Debug logs
console.log("🔑 Token:", token);
console.log("👤 Manager info:", user);

// Set up headers for all fetch requests
const headers = { Authorization: "Bearer " + token };

// ======== UI SETUP ========
document.getElementById("managerName").textContent = user?.name || "Manager";
document.getElementById("managerSite").textContent = "Site: " + (user?.siteName || "—");
document.getElementById("sidebarName").textContent = user?.name || "Manager";
document.getElementById("sidebarSite").textContent = "Site: " + (user?.siteName || "—");

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
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
    document.getElementById("cardSiteName").textContent = data.site?.name || user?.siteName || "—";
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
    if (!Array.isArray(data)) return (tbody.innerHTML = "<tr><td colspan='3'>No data found</td></tr>");
    tbody.innerHTML = data
      .map(w => `<tr><td>${w.full_name}</td><td>${w.role}</td><td>${w.phone}</td></tr>`)
      .join("");
  } catch (e) {
    console.error("Workers load error:", e);
  }
}

// ATTENDANCE
async function loadAttendance() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/attendance");
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
    if (!Array.isArray(data)) return (tbody.innerHTML = "<tr><td colspan='5'>No data</td></tr>");
    tbody.innerHTML = data
      .map(
        i => `<tr><td>${i.item_name}</td><td>${i.quantity}</td><td>${i.taken_by || "—"}</td><td>${
          i.site || "—"
        }</td><td>${new Date(i.updated_at).toLocaleString()}</td></tr>`
      )
      .join("");
  } catch (e) {
    console.error("Inventory load error:", e);
  }
}

// PAYMENTS
async function loadPayments() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/payments");
    const tbody = document.querySelector("#paymentsTable tbody");
    if (!Array.isArray(data)) return (tbody.innerHTML = "<tr><td colspan='6'>No data</td></tr>");
    tbody.innerHTML = data
      .map(
        p => `
      <tr>
        <td>${p.worker_name}</td>
        <td>${p.role}</td>
        <td>${p.days_worked}</td>
        <td>${p.amount}</td>
        <td>${p.status}</td>
        <td>${
          p.status === "Pending"
            ? `<button class="btn mark-paid" data-id="${p.id}">Mark Paid</button>`
            : "—"
        }</td>
      </tr>`
      )
      .join("");

    document.querySelectorAll(".mark-paid").forEach(btn => {
      btn.addEventListener("click", async () => {
        try {
          await fetch(`http://localhost:5000/api/manager/payments/${btn.dataset.id}/mark-paid`, {
            method: "PUT",
            headers
          });
          await loadPayments();
          await loadDashboard();
        } catch (err) {
          console.error("Mark paid error:", err);
        }
      });
    });
  } catch (e) {
    console.error("Payments load error:", e);
  }
}

// REPORTS
async function loadReports() {
  try {
    const data = await getJson("http://localhost:5000/api/manager/reports");
    const html = `
      <p><b>Total Workers:</b> ${data.totalWorkers}</p>
      <p><b>Total Paid:</b> ${data.totalPaid}</p>
      <p><b>Pending Payments:</b> ${data.totalPendingPayments}</p>
    `;
    document.getElementById("reportsSummary").innerHTML = html;
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
      case "dashboard":
        loadDashboard();
        break;
      case "workers":
        loadWorkers();
        break;
      case "attendance":
        loadAttendance();
        break;
      case "inventory":
        loadInventory();
        break;
      case "payments":
        loadPayments();
        break;
      case "reports":
        loadReports();
        break;
    }
  });
});

// ======== INITIAL LOAD ========
loadDashboard();
