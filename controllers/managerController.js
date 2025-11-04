const db = require('../config/db');

function getSiteIdFromReqUser(user) {
  // support variations: site_id, siteId, site
  return user?.site_id || user?.siteId || user?.site || null;
}

function ensureSiteName(siteId, cb) {
  // Retrieve site name for a numeric site id; if not found, return null
  db.query('SELECT name FROM sites WHERE id = ?', [siteId], (err, rows) => {
    if (err) return cb(err);
    const siteName = (rows && rows[0] && rows[0].name) ? rows[0].name : null;
    cb(null, siteName);
  });
}

// ---------------- DASHBOARD ----------------
exports.getDashboard = (req, res) => {
  try {
    const managerName = req.user?.name || req.user?.email || 'Manager';
    const siteId = getSiteIdFromReqUser(req.user);
    if (!siteId) return res.status(400).json({ msg: "Manager has no site assigned" });

    ensureSiteName(siteId, (err, siteName) => {
      if (err) {
        console.error("Dashboard site lookup error:", err);
        return res.status(500).json({ msg: "DB error" });
      }

      const site = { id: siteId, name: siteName || `Site ${siteId}` };

      // total workers (match by site_id OR textual site)
      const countSql = "SELECT COUNT(*) AS totalWorkers FROM workers WHERE site_id = ? OR site = ?";
      db.query(countSql, [siteId, siteName], (err2, cntRows) => {
        if (err2) {
          console.error("Dashboard count error:", err2);
          return res.status(500).json({ msg: "DB error" });
        }
        const totalWorkers = (cntRows && cntRows[0] && cntRows[0].totalWorkers) || 0;

        const today = new Date().toISOString().slice(0,10);

        // total present today (match either site_id or site)
        const attSql = `
          SELECT COUNT(DISTINCT a.worker_id) AS totalPresent
          FROM attendance a
          JOIN workers w ON a.worker_id = w.id
          WHERE (w.site_id = ? OR w.site = ?) AND DATE(a.date) = ? AND a.status = 'Present'
        `;
        db.query(attSql, [siteId, siteName, today], (err3, attRows) => {
          if (err3) {
            console.error("Dashboard attendance error:", err3);
            return res.status(500).json({ msg: "DB error" });
          }
          const totalPresent = (attRows && attRows[0] && attRows[0].totalPresent) || 0;

          // pending payments (match either site_id or site)
          const paySql = `
            SELECT COUNT(p.id) AS pendingPayments
            FROM payments p
            JOIN workers w ON p.worker_id = w.id
            WHERE (w.site_id = ? OR w.site = ?) AND (p.status = 'Pending' OR p.status IS NULL)
          `;
          db.query(paySql, [siteId, siteName], (err4, payRows) => {
            if (err4) {
              console.error("Dashboard payments error:", err4);
              return res.status(500).json({ msg: "DB error" });
            }
            const pendingPayments = (payRows && payRows[0] && payRows[0].pendingPayments) || 0;

            return res.json({
              manager: { name: managerName },
              site,
              totalWorkers,
              totalPresent,
              pendingPayments
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
};

// ---------------- WORKERS ----------------
exports.getWorkers = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) {
      console.error("Get workers site lookup error:", err);
      return res.status(500).json({ msg: "DB error" });
    }

    const sql = "SELECT id, full_name, role, phone, site, site_id, created_at FROM workers WHERE site_id = ? OR site = ? ORDER BY full_name ASC";
    db.query(sql, [siteId, siteName], (err2, results) => {
      if (err2) {
        console.error("Get workers error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      res.json(results || []);
    });
  });
};

// ================== GET ATTENDANCE ==================
exports.getAttendance = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  const { date } = req.query; // optional filter

  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) {
      console.error("Get attendance site lookup error:", err);
      return res.status(500).json({ msg: "DB error" });
    }

    // Join workers and attendance, filter by worker's site (site_id or text), optional date
    let sql = `
      SELECT 
        a.id,
        w.id AS worker_id,
        w.full_name AS worker_name,
        w.role,
        w.phone,
        a.date,
        a.status
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE (w.site_id = ? OR w.site = ?)
    `;
    const params = [siteId, siteName];

    if (date) {
      sql += " AND DATE(a.date) = ?";
      params.push(date);
    }

    sql += " ORDER BY a.date DESC, w.full_name ASC";

    db.query(sql, params, (err2, results) => {
      if (err2) {
        console.error("Get attendance error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }

      // Deduplicate: keep one row per worker per date (in case of accidental duplicate entries)
      const seen = new Set();
      const unique = [];
      for (const r of results) {
        const key = `${r.worker_id}::${r.date}`; // unique per worker per date
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(r);
        }
      }

      res.json(unique);
    });
  });
};

// ================== GET PAYMENTS ==================
exports.getPayments = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  // optional period filter: ?start=YYYY-MM-DD&end=YYYY-MM-DD
  const { start, end } = req.query;

  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) {
      console.error("Get payments site lookup error:", err);
      return res.status(500).json({ msg: "DB error" });
    }

    // Aggregate attendance into days_worked per worker (distinct dates) to avoid duplicates
    // Use worker.daily_pay to compute amount (your DB column is daily_pay)
    let sql = `
      SELECT 
        w.id AS worker_id,
        w.full_name AS worker_name,
        w.role,
        w.phone,
        COUNT(DISTINCT a.date) AS days_worked,
        (COUNT(DISTINCT a.date) * COALESCE(w.daily_pay, 0)) AS amount
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.id
      WHERE (w.site_id = ? OR w.site = ?)
    `;
    const params = [siteId, siteName];

    if (start && end) {
      sql += " AND a.date BETWEEN ? AND ?";
      params.push(start, end);
    }

    sql += `
      GROUP BY w.id, w.full_name, w.role, w.phone, w.daily_pay
      ORDER BY w.full_name ASC
    `;

    db.query(sql, params, (err2, results) => {
      if (err2) {
        console.error("Get payments error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }

      // Augment each row with a status field by checking payments table for an approved payment covering the period if period provided.
      // If no period provided, leave status as 'Pending' (UI can treat it as summary to create payments)
      if (!start || !end) {
        const withStatus = results.map(r => ({ ...r, status: 'Pending' }));
        return res.json(withStatus);
      }

      // If start/end provided, check payments table per worker for a payment that matches period exactly
      const workerIds = results.map(r => r.worker_id);
      if (workerIds.length === 0) return res.json(results.map(r => ({ ...r, status: 'Pending' })));

      // Build query to fetch payments for these workers and exact period
      const placeholders = workerIds.map(() => '?').join(',');
      const paySql = `
        SELECT worker_id, status
        FROM payments
        WHERE worker_id IN (${placeholders})
          AND period_start = ? AND period_end = ?
      `;
      db.query(paySql, [...workerIds, start, end], (err3, payRows) => {
        if (err3) {
          console.error("Get payments - check payments error:", err3);
          return res.status(500).json({ msg: "DB error" });
        }
        const statusMap = {};
        for (const p of (payRows || [])) statusMap[p.worker_id] = p.status || 'Pending';
        const out = results.map(r => ({ ...r, status: statusMap[r.worker_id] || 'Pending' }));
        res.json(out);
      });
    });
  });
};

// ---------------- MARK PAYMENT PAID ----------------
exports.markPaymentPaid = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const paymentId = req.params.id;
  const managerName = req.user?.name || req.user?.email || 'Manager';

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const checkSql = `
      SELECT p.id FROM payments p
      JOIN workers w ON p.worker_id = w.id
      WHERE p.id = ? AND (w.site_id = ? OR w.site = ?)
    `;
    db.query(checkSql, [paymentId, siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Check payment error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      if (!rows || rows.length === 0) return res.status(403).json({ msg: "Forbidden or payment not found" });

      const updateSql = `UPDATE payments SET status = 'Approved', approved_by = ?, approved_at = NOW() WHERE id = ?`;
      db.query(updateSql, [managerName, paymentId], (err3) => {
        if (err3) {
          console.error("Mark payment paid error:", err3);
          return res.status(500).json({ msg: "DB error" });
        }
        db.query("SELECT * FROM payments WHERE id = ?", [paymentId], (err4, updated) => {
          if (err4) {
            console.error("Fetch updated payment error:", err4);
            return res.status(500).json({ msg: "DB error" });
          }
          res.json({ msg: "Payment approved", payment: (updated && updated[0]) || null });
        });
      });
    });
  });
};

// ================== MARK ALL PAID ==================
// Expects body: { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD" }
// This will create a payment row per worker covering the given period and mark as Approved.
exports.markAllPaid = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  const { period_start, period_end } = req.body || {};
  const managerName = req.user?.name || req.user?.email || 'Manager';

  if (!siteId) return res.status(400).json({ msg: "No site assigned" });
  if (!period_start || !period_end) return res.status(400).json({ msg: "period_start and period_end are required" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    // Aggregate attendance per worker in the period
    const aggSql = `
      SELECT 
        w.id AS worker_id,
        w.role,
        COALESCE(w.site, ?) AS site_text,
        COUNT(DISTINCT a.date) AS days_worked,
        (COUNT(DISTINCT a.date) * COALESCE(w.daily_pay,0)) AS amount
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.id AND a.date BETWEEN ? AND ?
      WHERE (w.site_id = ? OR w.site = ?)
      GROUP BY w.id, w.role, w.site, w.daily_pay
      HAVING days_worked > 0
    `;
    db.query(aggSql, [siteName, period_start, period_end, siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Mark all paid - aggregate error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }

      if (!rows || rows.length === 0) {
        return res.json({ msg: "No attendance found for period; nothing to mark." });
      }

      // Insert payment for each worker (Approved)
      const insertSql = `
        INSERT INTO payments 
          (worker_id, role, site, period_start, period_end, days_worked, amount, status, approved_by, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, NOW())
      `;

      // Use series to avoid overwhelming DB
      const tasks = rows.map(r => {
        return new Promise((resolve, reject) => {
          db.query(insertSql, [
            r.worker_id,
            r.role || null,
            r.site_text || siteName || '',
            period_start,
            period_end,
            r.days_worked,
            r.amount,
            managerName
          ], (err3) => {
            if (err3) return reject(err3);
            resolve();
          });
        });
      });

      Promise.all(tasks)
        .then(() => res.json({ msg: "All workers marked as paid for the period", count: rows.length }))
        .catch((insErr) => {
          console.error("Mark all paid - insert error:", insErr);
          res.status(500).json({ msg: "Error inserting payments" });
        });
    });
  });
};

// ---------------- INVENTORY ----------------
exports.getInventory = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT id, item_name, quantity, taken_by, site, updated_at
      FROM inventory
      WHERE site_id = ? OR site = ?
      ORDER BY item_name ASC
    `;
    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get inventory error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      res.json(rows || []);
    });
  });
};

// ---------------- REPORTS ----------------
exports.getReports = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT 
        w.id AS worker_id, 
        w.full_name,
        COUNT(DISTINCT a.id) AS attendance_days,
        SUM(CASE WHEN p.status = 'Approved' THEN p.amount ELSE 0 END) AS total_paid,
        SUM(CASE WHEN p.status = 'Pending' OR p.status IS NULL THEN 1 ELSE 0 END) AS pending_payments
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.id
      LEFT JOIN payments p ON p.worker_id = w.id
      WHERE (w.site_id = ? OR w.site = ?)
      GROUP BY w.id
      ORDER BY w.full_name ASC
    `;
    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get reports error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      const summary = {
        totalWorkers: rows.length,
        totalPaid: rows.reduce((s, r) => s + Number(r.total_paid || 0), 0),
        totalPendingPayments: rows.reduce((s, r) => s + Number(r.pending_payments || 0), 0),
        perWorker: rows
      };
      res.json(summary);
    });
  });
};
