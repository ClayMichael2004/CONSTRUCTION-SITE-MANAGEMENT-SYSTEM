// controllers/managerController.js
const db = require('../config/db');

function getSiteIdFromReqUser(user) {
  // support variations: site_id, siteId, site
  return user?.site_id || user?.siteId || user?.site || null;
}

exports.getDashboard = (req, res) => {
  try {
    const managerName = req.user?.name || req.user?.email || 'Manager';
    const siteId = getSiteIdFromReqUser(req.user);
    if (!siteId) {
      return res.status(400).json({ msg: "Manager has no site assigned" });
    }

    // Query site name and counts
    const siteSql = "SELECT id, name FROM sites WHERE id = ?";
    db.query(siteSql, [siteId], (err, siteRows) => {
      if (err) {
        console.error("Dashboard site lookup error:", err);
        return res.status(500).json({ msg: "DB error" });
      }
      const site = siteRows && siteRows.length ? { id: siteRows[0].id, name: siteRows[0].name } : { id: siteId, name: `Site ${siteId}` };

      // total workers
      const countSql = "SELECT COUNT(*) AS totalWorkers FROM workers WHERE site_id = ?";
      db.query(countSql, [siteId], (err2, cntRows) => {
        if (err2) {
          console.error("Dashboard count error:", err2);
          return res.status(500).json({ msg: "DB error" });
        }
        const totalWorkers = (cntRows && cntRows[0] && cntRows[0].totalWorkers) || 0;

        // today's attendance count (Present)
        const today = new Date().toISOString().slice(0,10);
        const attSql = `
          SELECT COUNT(a.id) AS totalPresent
          FROM attendance a
          JOIN workers w ON a.worker_id = w.id
          WHERE w.site_id = ? AND a.date = ? AND a.status = 'Present'
        `;
        db.query(attSql, [siteId, today], (err3, attRows) => {
          if (err3) {
            console.error("Dashboard attendance error:", err3);
            return res.status(500).json({ msg: "DB error" });
          }
          const totalPresent = (attRows && attRows[0] && attRows[0].totalPresent) || 0;

          // pending payments count
          const paySql = `
            SELECT COUNT(p.id) AS pendingPayments
            FROM payments p
            JOIN workers w ON p.worker_id = w.id
            WHERE w.site_id = ? AND p.status = 'Pending'
          `;
          db.query(paySql, [siteId], (err4, payRows) => {
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

exports.getWorkers = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `SELECT id, full_name, role, phone FROM workers WHERE site_id = ? ORDER BY full_name ASC`;
  db.query(sql, [siteId], (err, rows) => {
    if (err) {
      console.error("Get workers error:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    res.json(rows);
  });
};

exports.getAttendance = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `
    SELECT a.id, w.full_name AS worker_name, w.role, w.phone, a.date, a.status
    FROM attendance a
    JOIN workers w ON a.worker_id = w.id
    WHERE w.site_id = ?
    ORDER BY a.date DESC
  `;
  db.query(sql, [siteId], (err, rows) => {
    if (err) {
      console.error("Get attendance error:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    res.json(rows);
  });
};

exports.getPayments = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `
    SELECT p.id, w.full_name AS worker_name, p.role, p.days_worked, p.amount, p.status, p.approved_by, p.approved_at, p.period_start, p.period_end
    FROM payments p
    JOIN workers w ON p.worker_id = w.id
    WHERE w.site_id = ?
    ORDER BY p.id DESC
  `;
  db.query(sql, [siteId], (err, rows) => {
    if (err) {
      console.error("Get payments error:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    res.json(rows);
  });
};

exports.markPaymentPaid = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const paymentId = req.params.id;
  const managerName = req.user?.name || req.user?.email || 'Manager';

  // ensure payment belongs to this manager's site: join with workers
  const checkSql = `
    SELECT p.id FROM payments p
    JOIN workers w ON p.worker_id = w.id
    WHERE p.id = ? AND w.site_id = ?
  `;
  db.query(checkSql, [paymentId, siteId], (err, rows) => {
    if (err) {
      console.error("Check payment error:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    if (!rows || rows.length === 0) return res.status(403).json({ msg: "Forbidden or payment not found" });

    const updateSql = `UPDATE payments SET status = 'Approved', approved_by = ?, approved_at = NOW() WHERE id = ?`;
    db.query(updateSql, [managerName, paymentId], (err2) => {
      if (err2) {
        console.error("Mark payment paid error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      // Optionally return updated payment
      const fetchSql = `SELECT * FROM payments WHERE id = ?`;
      db.query(fetchSql, [paymentId], (err3, updated) => {
        if (err3) {
          console.error("Fetch updated payment error:", err3);
          return res.status(500).json({ msg: "DB error" });
        }
        res.json({ msg: "Payment approved", payment: (updated && updated[0]) || null });
      });
    });
  });
};

exports.getInventory = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `
    SELECT id, item_name, quantity, taken_by, site, updated_at
    FROM inventory
    WHERE site_id = ? OR site = ?
    ORDER BY item_name ASC
  `;
  // Some existing rows use site (string) instead of site_id — support both
  // We'll pass both the numeric id and the site name looked up from sites table
  db.query("SELECT name FROM sites WHERE id = ?", [siteId], (err, siteRows) => {
    if (err) {
      console.error("Site lookup for inventory:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    const siteName = (siteRows && siteRows[0] && siteRows[0].name) || null;
    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get inventory error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }
      res.json(rows);
    });
  });
};

exports.getReports = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `
    SELECT w.id AS worker_id, w.full_name,
           COUNT(DISTINCT a.id) AS attendance_days,
           SUM(CASE WHEN p.status = 'Approved' THEN p.amount ELSE 0 END) AS total_paid,
           SUM(CASE WHEN p.status = 'Pending' THEN 1 ELSE 0 END) AS pending_payments
    FROM workers w
    LEFT JOIN attendance a ON a.worker_id = w.id
    LEFT JOIN payments p ON p.worker_id = w.id
    WHERE w.site_id = ?
    GROUP BY w.id
    ORDER BY w.full_name ASC
  `;
  db.query(sql, [siteId], (err, rows) => {
    if (err) {
      console.error("Get reports error:", err);
      return res.status(500).json({ msg: "DB error" });
    }
    // Summarize totals for quick dashboard usage
    const summary = {
      totalWorkers: rows.length,
      totalPaid: rows.reduce((s, r) => s + Number(r.total_paid || 0), 0),
      totalPendingPayments: rows.reduce((s, r) => s + Number(r.pending_payments || 0), 0),
      perWorker: rows
    };
    res.json(summary);
  });
};
