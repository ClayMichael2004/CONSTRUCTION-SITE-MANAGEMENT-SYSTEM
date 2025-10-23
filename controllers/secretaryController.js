// controllers/secretaryController.js
// NOTE: expects req.db (set in server.js middleware) and req.user (from auth middleware)

function getSiteNameFromUser(req, cb) {
  // cb(err, siteNameOrNull)
  if (req.user?.site) return cb(null, req.user.site);
  if (req.user?.siteName) return cb(null, req.user.siteName);

  const siteId = req.user?.siteId || req.user?.site_id || null;
  if (!siteId) return cb(null, null);

  req.db.query("SELECT name FROM sites WHERE id = ?", [siteId], (err, rows) => {
    if (err) return cb(err);
    if (!rows || rows.length === 0) return cb(null, null);
    cb(null, rows[0].name);
  });
}

// ---------------- ROLES ----------------
// Returns distinct roles from workers table (so no new roles table required)
exports.getRoles = (req, res) => {
  req.db.query(
    "SELECT DISTINCT role FROM workers WHERE role IS NOT NULL AND role <> '' ORDER BY role ASC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      // normalise to array of { name: 'Mason' } objects for easy client use
      const out = rows.map(r => ({ name: r.role }));
      res.json(out);
    }
  );
};

// ---------------- WORKERS ----------------
exports.getWorkers = (req, res) => {
  const role = req.user?.role;
  const siteQuery = req.query.site;

  const runQuery = (siteFilter) => {
    let query = "SELECT * FROM workers";
    const params = [];
    if (siteFilter) {
      query += " WHERE site = ?";
      params.push(siteFilter);
    }
    query += " ORDER BY id DESC";
    req.db.query(query, params, (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.sqlMessage || "DB error" });
      }
      res.json(results);
    });
  };

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });
      runQuery(siteName);
    });
  } else {
    runQuery(siteQuery || null);
  }
};

exports.registerWorker = (req, res) => {
  const { full_name, phone, site, role: workerRole } = req.body;
  const callerRole = req.user?.role;

  if (!full_name || !phone)
    return res.status(400).json({ error: "Name and phone required" });
  if (!workerRole)
    return res.status(400).json({ error: "Worker role/expertise is required" });

  // Step 1: Fetch role pay from roles table
  req.db.query("SELECT amount FROM roles WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [workerRole], (err, results) => {
    if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
    if (results.length === 0) return res.status(400).json({ error: "Invalid role" });

    const roleAmount = results[0].amount;

    const insertWorker = (finalSite) => {
      if (!finalSite) return res.status(400).json({ error: "Site is required" });

      // Step 2: Save worker along with daily pay
      req.db.query(
        "INSERT INTO workers (full_name, role, phone, site, daily_pay) VALUES (?,?,?,?,?)",
        [full_name, workerRole, phone, finalSite, roleAmount],
        (err) => {
          if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
          res.json({ message: "Worker registered successfully" });
        }
      );
    };

    // Step 3: Determine site based on user role
    if (callerRole === "secretary") {
      getSiteNameFromUser(req, (err, siteName) => {
        if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
        if (!siteName)
          return res.status(400).json({ error: "Secretary has no site assigned" });
        insertWorker(siteName);
      });
    } else {
      insertWorker(site || null);
    }
  });
};


// ---------------- ATTENDANCE ----------------
exports.getAttendance = (req, res) => {
  const role = req.user?.role;
  const siteQuery = req.query.site;

  const buildAndRun = (siteFilter) => {
    let query = `
      SELECT a.id, w.full_name, w.site, w.phone, a.date, a.status
      FROM attendance a
      JOIN workers w ON a.worker_id = w.id
    `;
    const params = [];
    if (siteFilter) {
      query += " WHERE w.site = ?";
      params.push(siteFilter);
    }
    query += " ORDER BY a.date DESC";
    req.db.query(query, params, (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      res.json(results);
    });
  };

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });
      buildAndRun(siteName);
    });
  } else {
    buildAndRun(siteQuery || null);
  }
};

exports.markAttendance = (req, res) => {
  const { worker_id, date, status } = req.body;
  if (!worker_id || !date || !status) 
    return res.status(400).json({ error: "All fields required" });

  const today = new Date().toISOString().slice(0, 10);
  if (date !== today) 
    return res.status(400).json({ error: "Attendance can only be marked for today's date" });

  const role = req.user?.role;

  // Helper: Mark attendance and handle payment update
  const insertAttendance = (workerRole, workerSite, dailyPay) => {
    req.db.query(
      "SELECT id FROM attendance WHERE worker_id=? AND date=?",
      [worker_id, today],
      (err, rows2) => {
        if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
        if (rows2.length > 0)
          return res.status(400).json({ error: "Attendance already marked for this worker today" });

        // ✅ Insert attendance record
        req.db.query(
          "INSERT INTO attendance (worker_id, date, status) VALUES (?,?,?)",
          [worker_id, today, status],
          (err) => {
            if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });

            // ✅ After marking attendance, handle payments
            if (status === "Present") {
              // Check if there's an existing payment record for today
              const paymentCheck = `
                SELECT id FROM payments 
                WHERE worker_id = ? AND period_start = CURDATE()
              `;
              req.db.query(paymentCheck, [worker_id], (err, rows3) => {
                if (err) console.error("Payment check error:", err);

                if (rows3.length === 0) {
                  // No payment for today → insert new one
                  const insertPayment = `
                    INSERT INTO payments 
                      (worker_id, role, site, period_start, period_end, days_worked, amount, status)
                    VALUES (?, ?, ?, CURDATE(), CURDATE(), 1, ?, 'Pending')
                  `;
                  req.db.query(
                    insertPayment,
                    [worker_id, workerRole, workerSite, dailyPay],
                    (err2) => {
                      if (err2) console.error("Payment insert error:", err2);
                    }
                  );
                } else {
                  // Payment exists → update it
                  const updatePayment = `
                    UPDATE payments
                    SET days_worked = days_worked + 1,
                        amount = amount + ?
                    WHERE worker_id = ? AND period_start = CURDATE()
                  `;
                  req.db.query(updatePayment, [dailyPay, worker_id], (err3) => {
                    if (err3) console.error("Payment update error:", err3);
                  });
                }
              });
            }

            res.json({ message: "Attendance marked successfully" });
          }
        );
      }
    );
  };

  // ✅ If secretary → confirm site match first
  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });

      req.db.query("SELECT * FROM workers WHERE id=?", [worker_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
        if (!rows || rows.length === 0) return res.status(404).json({ error: "Worker not found" });

        const worker = rows[0];
        if (worker.site !== siteName)
          return res.status(403).json({ error: "Unauthorized: worker belongs to another site" });

        insertAttendance(worker.role, worker.site, worker.daily_pay);
      });
    });
  } else {
    // ✅ For admin or manager
    req.db.query("SELECT * FROM workers WHERE id=?", [worker_id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Worker not found" });

      const worker = rows[0];
      insertAttendance(worker.role, worker.site, worker.daily_pay);
    });
  }
};


// ---------------- INVENTORY ----------------
exports.getInventory = (req, res) => {
  const role = req.user?.role;
  const siteQuery = req.query.site;

  const run = (siteFilter) => {
    let query = "SELECT * FROM inventory";
    const params = [];
    if (siteFilter) {
      query += " WHERE site = ?";
      params.push(siteFilter);
    }
    query += " ORDER BY id DESC";
    req.db.query(query, params, (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      res.json(results);
    });
  };

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });
      run(siteName);
    });
  } else {
    run(siteQuery || null);
  }
};

exports.addInventory = (req, res) => {
  const { item_name, quantity, site } = req.body;
  const role = req.user?.role;

  if (!item_name || quantity == null) return res.status(400).json({ error: "All fields required" });

  const insertInv = (finalSite) => {
    if (!finalSite) return res.status(400).json({ error: "Site is required" });
    req.db.query("INSERT INTO inventory (item_name, quantity, site) VALUES (?,?,?)", [item_name, quantity, finalSite], (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      res.json({ message: "Inventory added" });
    });
  };

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });
      insertInv(siteName);
    });
  } else {
    insertInv(site || null);
  }
};

exports.updateInventory = (req, res) => {
  const { id } = req.params;
  const { quantity, taken_by } = req.body;
  const role = req.user?.role;

  if (quantity == null) return res.status(400).json({ error: "Quantity required" });

  // helper to check if taken_by column exists (safe if schema differs)
  function checkTakenByColumn(cb) {
    req.db.query(
      "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory' AND COLUMN_NAME = 'taken_by'",
      (err, rows) => {
        if (err) return cb(err);
        cb(null, rows && rows[0] && rows[0].c > 0);
      }
    );
  }

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName) return res.status(400).json({ error: "Secretary has no site assigned" });

      checkTakenByColumn((err2, hasTakenBy) => {
        if (err2) return res.status(500).json({ error: err2.sqlMessage || "DB error" });

        if (hasTakenBy && taken_by != null) {
          req.db.query("UPDATE inventory SET quantity=?, taken_by=? WHERE id=? AND site=?", [quantity, taken_by, id, siteName], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found or unauthorized" });
            res.json({ message: "Inventory updated" });
          });
        } else {
          req.db.query("UPDATE inventory SET quantity=? WHERE id=? AND site=?", [quantity, id, siteName], (err, result) => {
            if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
            if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found or unauthorized" });
            res.json({ message: "Inventory updated" });
          });
        }
      });
    });
  } else {
    // admin/manager branch
    checkTakenByColumn((err2, hasTakenBy) => {
      if (err2) return res.status(500).json({ error: err2.sqlMessage || "DB error" });

      if (hasTakenBy && taken_by != null) {
        req.db.query("UPDATE inventory SET quantity=?, taken_by=? WHERE id=?", [quantity, taken_by, id], (err, result) => {
          if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
          if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found" });
          res.json({ message: "Inventory updated" });
        });
      } else {
        req.db.query("UPDATE inventory SET quantity=? WHERE id=?", [quantity, id], (err, result) => {
          if (err) return res.status(500).json({ error: err.sqlMessage || "DB error" });
          if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found" });
          res.json({ message: "Inventory updated" });
        });
      }
    });
  }
};

// ---------------- PAYMENTS ----------------
exports.getPayments = (req, res) => {
  const role = req.user?.role;
  const siteQuery = req.query.site;
  const period = req.query.period || 'weekly';

  let startDate = '';
  let endDate = new Date().toISOString().slice(0, 10);

  if (period === 'weekly') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().slice(0, 10);
  } else if (period === 'monthly') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    startDate = d.toISOString().slice(0, 10);
  }

  const run = (siteFilter) => {
    let query = `
      SELECT 
        w.id AS worker_id,
        w.full_name AS workerName,
        w.role AS role,
        w.phone,
        w.site,
        w.daily_pay,
        COUNT(a.id) AS daysWorked,
        (COUNT(a.id) * w.daily_pay) AS amount
      FROM workers w
      LEFT JOIN attendance a 
        ON w.id = a.worker_id 
        AND a.date BETWEEN ? AND ? 
        AND a.status = 'Present'
    `;
    const params = [startDate, endDate];

    if (siteFilter) {
      query += " WHERE w.site = ?";
      params.push(siteFilter);
    }

    query += " GROUP BY w.id ORDER BY w.full_name ASC";

    req.db.query(query, params, (err, results) => {
      if (err)
        return res.status(500).json({ error: err.sqlMessage || "DB error" });
      res.json(results);
    });
  };

  if (role === "secretary") {
    getSiteNameFromUser(req, (err, siteName) => {
      if (err)
        return res.status(500).json({ error: err.sqlMessage || "DB error" });
      if (!siteName)
        return res
          .status(400)
          .json({ error: "Secretary has no site assigned" });
      run(siteName);
    });
  } else {
    run(siteQuery || null);
  }
};
