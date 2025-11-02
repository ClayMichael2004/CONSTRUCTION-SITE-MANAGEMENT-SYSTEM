// controllers/managerController.js
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
          SELECT COUNT(a.id) AS totalPresent
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

// ---------------- ATTENDANCE ----------------
exports.getAttendance = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT a.id, w.full_name AS worker_name, w.role, w.phone, a.date, a.status
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
      WHERE w.site_id = ? OR w.site = ?
      ORDER BY a.date DESC
    `;
    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get attendance error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      res.json(rows || []);
    });
  });
};

// ---------------- PAYMENTS ----------------
exports.getPayments = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT 
        p.id,
        w.full_name AS worker_name,
        COALESCE(w.role, p.role) AS role,
        p.days_worked,
        p.amount,
        COALESCE(p.status, 'Pending') AS status,
        p.approved_by,
        p.approved_at,
        p.period_start,
        p.period_end
      FROM payments p
      JOIN workers w ON p.worker_id = w.id
      WHERE w.site_id = ? OR w.site = ?
      ORDER BY p.id DESC
    `;
    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get payments error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      res.json(rows || []);
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
