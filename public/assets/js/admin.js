const role = sessionStorage.getItem("role");
const token = sessionStorage.getItem("token");

if (role !== "admin") {
  alert("Unauthorized access. Redirecting...");
  window.location.href = "login.html";
}

function logout() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

// Fetch all users
async function loadUsers() {
  try {
    const res = await fetch("/api/auth/users", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const users = await res.json();
    const tbody = document.querySelector("#userTable tbody");
    tbody.innerHTML = "";

    users.forEach(user => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.id}</td>
        <td>${user.name}</td>
        <td>${user.email}</td>
        <td>${user.phone || "-"}</td>
        <td>${user.role}</td>
        <td>${user.site_name|| "-"}</td>
        <td>${new Date(user.created_at).toLocaleString()}</td>
        <td>
          <button class="action-btn edit" onclick="editUser(${user.id}, '${user.name}', '${user.email}', '${user.phone || ""}', '${user.role}', ${user.site_id || 'null'})">Edit</button>
          <button class="action-btn reset" onclick="resetUserPassword(${user.id})">Reset Password</button>
          <button class="action-btn delete" onclick="deleteUser(${user.id})">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading users:", err);
  }
}

async function loadSitesForEdit(selectedId = "") {
  try {
    const res = await fetch("/api/sites", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const sites = await res.json();
    const siteSelect = document.getElementById("editSite");
    siteSelect.innerHTML = '<option value="">-- Select Site --</option>';
    sites.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id == selectedId) opt.selected = true;
      siteSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading sites:", err);
  }
}


// --- Edit User ---
function editUser(id, name, email, phone, role, siteId) {
  document.getElementById("editUserId").value = id;
  document.getElementById("editName").value = name;
  document.getElementById("editEmail").value = email;
  document.getElementById("editPhone").value = phone;
  document.getElementById("editRole").value = role;
  loadSitesForEdit(siteId);
  document.getElementById("editModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
}

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("editUserId").value;
  const name = document.getElementById("editName").value;
  const email = document.getElementById("editEmail").value;
  const phone = document.getElementById("editPhone").value;
  const role = document.getElementById("editRole").value;
  const siteId=document.getElementById("editSite").value;

  const res = await fetch(`/api/auth/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ name, email, phone, role, siteId })
  });

  const data = await res.json();
  alert(data.msg);
  closeEditModal();
  loadUsers();
});

// --- Reset Password ---
function resetUserPassword(id) {
  document.getElementById("resetUserId").value = id;
  document.getElementById("resetModal").style.display = "flex";
}

function closeResetModal() {
  document.getElementById("resetModal").style.display = "none";
}

document.getElementById("resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("resetUserId").value;
  const newPassword = document.getElementById("newPassword").value;

  const res = await fetch(`/api/auth/users/${id}/reset-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ newPassword })
  });

  const data = await res.json();
  alert(data.msg);
  closeResetModal();
  loadUsers();
});

// --- Delete User ---
async function deleteUser(id) {
  if (!confirm("Are you sure you want to delete this user?")) return;

  const res = await fetch(`/api/auth/users/${id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` }
  });

  const data = await res.json();
  alert(data.msg);
  loadUsers();
}

// Load users on page load
loadUsers();
