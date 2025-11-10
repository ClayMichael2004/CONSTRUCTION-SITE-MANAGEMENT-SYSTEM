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

// ================== GET PAYMENTS (Split: Pending + Approved) ==================
exports.getPayments = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT 
        w.id AS worker_id,
        w.full_name AS worker_name,
        w.role,
        w.phone,
        COUNT(DISTINCT a.date) AS days_worked,
        (COUNT(DISTINCT a.date) * COALESCE(w.daily_pay, 0)) AS amount,
        COALESCE(p.status, 'Pending') AS status,
        p.id AS payment_id,
        p.approved_by,
        p.approved_at
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.id AND a.status = 'Present'
      LEFT JOIN payments p 
        ON p.worker_id = w.id
        AND p.period_closed = 0
      WHERE (w.site_id = ? OR w.site = ?)
      GROUP BY w.id, w.full_name, w.role, w.phone, w.daily_pay, p.status, p.id, p.approved_by, p.approved_at
      ORDER BY w.full_name ASC;
    `;

    db.query(sql, [siteId, siteName], (err2, results) => {
      if (err2) return res.status(500).json({ msg: "DB error" });

      // Split into two categories
      const pending = results.filter(r => r.status === 'Pending');
      const approved = results.filter(r => r.status === 'Approved');

      res.json({ pending, approved });
    });
  });
};


// ================== MARK PAYMENT ==================
exports.markPayment = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const workerId = req.body.worker_id;
  const managerName = req.user?.name || "Manager";

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const sql = `
      SELECT MIN(a.date) AS period_start, MAX(a.date) AS period_end,
             COUNT(DISTINCT a.date) AS days_worked, w.daily_pay, 
             (COUNT(DISTINCT a.date)*w.daily_pay) AS amount,
             w.role, w.site
      FROM attendance a
      JOIN workers w ON w.id = a.worker_id
      WHERE a.worker_id = ? AND a.status = 'Present';
    `;

    db.query(sql, [workerId], (err2, rows) => {
      if (err2 || !rows.length) return res.status(500).json({ msg: "No attendance records found" });
      const r = rows[0];

      const insert = `
        INSERT INTO payments 
        (worker_id, role, site, period_start, period_end, days_worked, amount, status, approved_by, approved_at, period_closed)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, NOW(), 0);
      `;

      db.query(insert, [workerId, r.role, r.site, r.period_start, r.period_end, r.days_worked, r.amount, managerName], (err3) => {
        if (err3) return res.status(500).json({ msg: "DB insert error" });

        db.query("DELETE FROM attendance WHERE worker_id = ?", [workerId], () => {
          res.json({ msg: "Payment approved and moved to right side", ...r });
        });
      });
    });
  });
};


// ================== CLOSE PAYMENT PERIOD ==================
exports.closePaymentPeriod = (req, res) => {
  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  ensureSiteName(siteId, (err, siteName) => {
    if (err) return res.status(500).json({ msg: "DB error" });

    const update = `
      UPDATE payments p
      JOIN workers w ON w.id = p.worker_id
      SET p.period_closed = 1, p.closed_at = NOW()
      WHERE (w.site_id = ? OR w.site = ?) AND p.period_closed = 0;
    `;

    db.query(update, [siteId, siteName], (err2, result) => {
      if (err2) return res.status(500).json({ msg: "DB error updating payments" });
      res.json({ msg: `✅ ${result.affectedRows} payments moved to reports.` });
    });
  });
};


// ================== CONFIRM PAYMENT (SEND SMS) ==================
exports.confirmPayment = (req, res) => {
  const { payment_id } = req.body;
  if (!payment_id) return res.status(400).json({ msg: "payment_id is required" });

  const siteId = getSiteIdFromReqUser(req.user);
  if (!siteId) return res.status(400).json({ msg: "No site assigned" });

  const sql = `
    SELECT p.*, w.full_name, w.phone, w.id AS worker_id
    FROM payments p
    JOIN workers w ON w.id = p.worker_id
    WHERE p.id = ?;
  `;

  db.query(sql, [payment_id], async (err, rows) => {
    if (err) return res.status(500).json({ msg: "DB error" });
    if (!rows.length) return res.status(404).json({ msg: "Payment not found" });

    const payment = rows[0];
    if (!payment.worker_id) return res.status(400).json({ msg: "Worker not found" });

    const { sendPaymentSMS } = require('../utils/smsService');
   const workerInfo = {
  id: payment.worker_id,
  full_name: payment.full_name,
  phone: payment.phone,
};

const smsResult = await sendPaymentSMS(
  workerInfo,
  payment.amount,
  payment.period_start,
  payment.period_end
);


    if (!smsResult.success)
      return res.status(500).json({ msg: "Payment confirmed, but SMS failed: " + smsResult.message });

    // Update payment status to "Approved" if not already
    db.query(`UPDATE payments SET status='Approved', approved_at=NOW() WHERE id=?`, [payment.id], (err2) => {
      if (err2) console.error('Failed to update payment status after SMS:', err2);
      res.json({ msg: "✅ Payment confirmed and SMS sent successfully" });
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
        COALESCE(SUM(CASE WHEN p.status = 'Approved' THEN p.amount ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN p.status = 'Pending' OR p.status IS NULL THEN 1 ELSE 0 END), 0) AS pending_payments
      FROM workers w
      LEFT JOIN attendance a ON a.worker_id = w.id
      LEFT JOIN payments p ON p.worker_id = w.id
      WHERE (w.site_id = ? OR w.site = ?)
      GROUP BY w.id, w.full_name
      ORDER BY w.full_name ASC
    `;

    db.query(sql, [siteId, siteName], (err2, rows) => {
      if (err2) {
        console.error("Get reports error:", err2);
        return res.status(500).json({ msg: "DB error" });
      }

      // ✅ Also include payment history for closed periods
      const historySql = `
        SELECT 
          p.id, w.full_name AS worker_name, p.amount, p.status,
          p.period_start, p.period_end, p.closed_at
        FROM payments p
        JOIN workers w ON p.worker_id = w.id
        WHERE p.period_closed = TRUE
          AND (w.site_id = ? OR w.site = ?)
        ORDER BY p.closed_at DESC
      `;

      db.query(historySql, [siteId, siteName], (err3, history) => {
        if (err3) {
          console.error("Get payment history error:", err3);
          return res.status(500).json({ msg: "DB error" });
        }

        const summary = {
          totalWorkers: rows.length,
          totalPaid: rows.reduce((s, r) => s + Number(r.total_paid || 0), 0),
          totalPendingPayments: rows.reduce((s, r) => s + Number(r.pending_payments || 0), 0),
          perWorker: rows,
          paymentHistory: history
        };

        res.json(summary);
      });
    });
  });
};
