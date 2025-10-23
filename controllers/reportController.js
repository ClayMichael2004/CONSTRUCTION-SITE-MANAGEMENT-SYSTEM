// controllers/reportController.js
const db = require("../config/db");

// ✅ ATTENDANCE REPORT
exports.getAttendanceReport = (req, res) => {
  const { site, from, to, role } = req.query;

  let sql = `
    SELECT 
      a.id,
      w.full_name AS worker_name,
      w.role,
      w.phone,
      w.site AS site_name,
      a.date,
      a.status
    FROM attendance a
    JOIN workers w ON a.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (site) {
  sql += " AND LOWER(w.site) LIKE ?";
  params.push('%' + site.toLowerCase() + '%');
}

  if (role) { sql += " AND w.role = ?"; params.push(role); }
  if (from) { sql += " AND a.date >= ?"; params.push(from); }
  if (to) { sql += " AND a.date <= ?"; params.push(to); }

  sql += " ORDER BY a.date DESC";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};


// ✅ PAYMENTS REPORT
exports.getPaymentsReport = (req, res) => {
  const { site, from, to, role } = req.query;

  let sql = `
    SELECT 
      w.full_name AS worker_name, 
      w.role, 
      w.phone, 
      w.site AS site_name,
      p.days_worked, 
      p.amount, 
      p.status,
      p.period_start,
      p.period_end
    FROM payments p
    LEFT JOIN workers w ON p.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (site) {
  sql += " AND LOWER(w.site) LIKE ?";
  params.push('%' + site.toLowerCase() + '%');
}

  if (role) { sql += " AND w.role = ?"; params.push(role); }
  if (from) { sql += " AND p.period_start >= ?"; params.push(from); }
  if (to) { sql += " AND p.period_end <= ?"; params.push(to); }

  sql += " ORDER BY p.period_end DESC";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });

    const total = results.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    res.json({ results, total });
  });
};


// ✅ REGISTERED WORKERS REPORT
exports.getWorkersReport = (req, res) => {
  const { site, role, from, to } = req.query;
  let sql = `
    SELECT 
      w.id, 
      w.full_name, 
      w.role, 
      w.phone, 
      w.site AS site_name, 
      w.daily_pay,
      w.created_at
    FROM workers w
    WHERE 1=1
  `;
  const params = [];

 if (site) {
  sql += " AND LOWER(w.site) LIKE ?";
  params.push('%' + site.toLowerCase() + '%');
}

  if (role) { sql += " AND w.role = ?"; params.push(role); }
  if (from) { sql += " AND DATE(w.created_at) >= ?"; params.push(from); }
  if (to) { sql += " AND DATE(w.created_at) <= ?"; params.push(to); }

  sql += " ORDER BY w.full_name ASC";

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};


// ✅ INVENTORY REPORT
exports.getInventoryReport = (req, res) => {
  const { site } = req.query;
  const params = [];
  let sql;

  if (site) {
    // Case-insensitive, partial site matching
    sql = `
      SELECT 
        i.item_name,
        i.quantity AS total_quantity,
        i.site AS site_name,
        i.taken_by,
        i.updated_at AS last_updated
      FROM inventory i
      WHERE LOWER(i.site) LIKE ?
      ORDER BY i.item_name;
    `;
    params.push('%' + site.toLowerCase() + '%');
  } else {
    // Default view: group all items and show totals
    sql = `
      SELECT 
        i.item_name,
        SUM(i.quantity) AS total_quantity,
        GROUP_CONCAT(DISTINCT i.site SEPARATOR ', ') AS site_name,
        MAX(i.updated_at) AS last_updated
      FROM inventory i
      GROUP BY i.item_name
      ORDER BY i.item_name;
    `;
  }

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};
