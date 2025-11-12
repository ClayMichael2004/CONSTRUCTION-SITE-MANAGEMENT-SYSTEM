// assets/js/reports.js
const token = sessionStorage.getItem("token");
const role = sessionStorage.getItem("role");

if (!token || role !== "admin") {
  alert("Unauthorized access");
  window.location.href = "login.html";
}

function logout() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

/* Sidebar behavior */
const sections = {
  btnAttendance: "cardAttendance",
  btnPayments: "cardPayments",
  btnWorkers: "cardWorkers",
  btnInventory: "cardInventory"
};
Object.keys(sections).forEach(btnId => {
  document.getElementById(btnId).addEventListener("click", () => {
    document.querySelectorAll(".reports-sidebar button").forEach(b => b.classList.remove("active"));
    document.getElementById(btnId).classList.add("active");
    document.querySelectorAll(".report-card").forEach(c => c.classList.remove("active"));
    document.getElementById(sections[btnId]).classList.add("active");
  });
});

function authHeaders() {
  return { "Authorization": `Bearer ${token}` };
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(()=>"");
    throw new Error(`HTTP ${res.status} ${body}`);
  }
  return res.json();
}

/* Load sites for dropdowns */
async function loadSitesInto(selectIds = []) {
  try {
    const sites = await fetchJSON("/api/sites");
    selectIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = `<option value="">All</option>`;
      sites.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        el.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("Failed to load sites:", err);
  }
}

/* Helpers to render tables */
function renderTable(tableId, headers, rows, footerHTML = "") {
  const table = document.getElementById(tableId);
  const empty = document.getElementById(tableId.replace("Table", "Empty"));
  if (!rows || rows.length === 0) {
    table.style.display = "none";
    if (empty) empty.style.display = "block";
    return;
  }
  table.style.display = "";
  if (empty) empty.style.display = "none";

  table.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = headers.map(h => `<td>${r[h] ?? ""}</td>`).join("");
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  if (footerHTML) {
    const tfoot = document.createElement("tfoot");
    tfoot.innerHTML = footerHTML;
    table.appendChild(tfoot);
  }
}

/* Load functions */
async function loadAttendance() {
  try {
    const site = document.getElementById("attendanceSite").value;
    const from = document.getElementById("attendanceFrom").value;
    const to = document.getElementById("attendanceTo").value;
    const status = document.getElementById("attendanceStatus")?.value || "";

    const url = new URL("/api/reports/attendance", window.location.origin);
    if (site) url.searchParams.append("site", site);
    if (from) url.searchParams.append("from", from);
    if (to) url.searchParams.append("to", to);
    if (status) url.searchParams.append("status", status);

    const data = await fetchJSON(url);
    const rows = data.map(r => ({
      "Worker": r.worker_name,
      "Role": r.role,
      "Phone": r.phone,
      "Site": r.site_name,
      "Date": r.date ? new Date(r.date).toLocaleDateString() : "",
      "Status": r.status
    }));
    renderTable("attendanceTable", ["Worker","Role","Phone","Site","Date","Status"], rows);
  } catch (err) {
    console.error("Failed to load attendance:", err);
    const e = document.getElementById("attendanceEmpty");
    e.textContent = "Failed to load report";
    e.style.display = "block";
  }
}

async function loadPayments() {
  try {
    const site = document.getElementById("paymentsSite").value;
    const from = document.getElementById("paymentsFrom").value;
    const to = document.getElementById("paymentsTo").value;
    const role = document.getElementById("paymentsRole")?.value || "";

    const url = new URL("/api/reports/payments", window.location.origin);
    if (site) url.searchParams.append("site", site);
    if (from) url.searchParams.append("from", from);
    if (to) url.searchParams.append("to", to);
    if (role) url.searchParams.append("role", role);

    const data = await fetchJSON(url);
    const rows = data.results.map(r => ({
      "Worker": r.worker_name,
      "Role": r.role,
      "Phone": r.phone,
      "Site": r.site_name,
      "Days Worked": r.days_worked ?? "",
      "Amount": r.amount ?? "",
      "Status": r.status ?? ""
    }));

    const total = data.total?.toFixed(2) ?? "0.00";
    renderTable(
      "paymentsTable",
      ["Worker","Role","Phone","Site","Days Worked","Amount","Status"],
      rows,
      `<tr><td colspan='7' style='text-align:right;font-weight:bold'>Total Payable: ${total}</td></tr>`
    );
  } catch (err) {
    console.error("Failed to load payments:", err);
    const e = document.getElementById("paymentsEmpty");
    e.textContent = "Failed to load report";
    e.style.display = "block";
  }
}

async function loadWorkers() {
  try {
    const site = document.getElementById("workersSite").value;
    const from = document.getElementById("workersFrom").value;
    const to = document.getElementById("workersTo").value;
    const url = new URL("/api/reports/workers", window.location.origin);
    if (site) url.searchParams.append("site", site);
    if (from) url.searchParams.append("from", from);
    if (to) url.searchParams.append("to", to);

    const data = await fetchJSON(url);
    const rows = data.map(r => ({
      "ID": r.id,
      "Name": r.full_name,
      "Role": r.role,
      "Phone": r.phone,
      "Site": r.site_name,
      "Registered": r.created_at ? new Date(r.created_at).toLocaleString() : ""
    }));
    renderTable("workersTable", ["ID","Name","Role","Phone","Site","Registered"], rows);
  } catch (err) {
    console.error("Failed to load workers:", err);
    const e = document.getElementById("workersEmpty");
    e.textContent = "Failed to load report";
    e.style.display = "block";
  }
}

async function loadInventory() {
  try {
    const site = document.getElementById("inventorySite").value;
    const url = new URL("/api/reports/inventory", window.location.origin);
    if (site) url.searchParams.append("site", site);

    const data = await fetchJSON(url);
    const rows = data.map(r => ({
      "Item": r.item_name,
      "Site": r.site_name,
      "Total Quantity": r.total_quantity ?? r.quantity,
      "Last Updated": r.last_updated
        ? new Date(r.last_updated).toLocaleString()
        : r.updated_at
        ? new Date(r.updated_at).toLocaleString()
        : ""
    }));
    renderTable("inventoryTable", ["Item","Site","Total Quantity","Last Updated"], rows);
  } catch (err) {
    console.error("Failed to load inventory:", err);
    const e = document.getElementById("inventoryEmpty");
    e.textContent = "Failed to load report";
    e.style.display = "block";
  }
}

/* Init */
(async function init() {
  await loadSitesInto(["attendanceSite","paymentsSite","workersSite","inventorySite"]);
  loadAttendance(); // default view
})();
