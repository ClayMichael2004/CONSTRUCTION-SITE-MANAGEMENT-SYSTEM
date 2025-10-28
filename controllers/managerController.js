const db = require('../config/db');

//  Dashboard
exports.getDashboard = async (req, res) => {
  try {
    const managerId = req.user.id;

    // Get manager + site info
    const [manager] = await db.query('SELECT name, site_id FROM users WHERE id = ?', [managerId]);
    const [site] = await db.query('SELECT * FROM sites WHERE id = ?', [manager.site_id]);

    const [workerCount] = await db.query('SELECT COUNT(*) AS count FROM workers WHERE site_id = ?', [manager.site_id]);

    res.json({
      manager,
      site,
      workerCount: workerCount[0].count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error loading dashboard' });
  }
};

// 👷 Workers List
exports.getWorkers = async (req, res) => {
  try {
    const managerId = req.user.id;
    const [manager] = await db.query('SELECT site_id FROM users WHERE id = ?', [managerId]);
    const [workers] = await db.query('SELECT id, name, phone, position FROM workers WHERE site_id = ?', [manager.site_id]);
    res.json(workers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error loading workers' });
  }
};

// 🗓 Attendance Records
exports.getAttendance = async (req, res) => {
  try {
    const managerId = req.user.id;
    const [manager] = await db.query('SELECT site_id FROM users WHERE id = ?', [managerId]);
    const [records] = await db.query(`
      SELECT a.id, w.name AS worker_name, a.date, a.status 
      FROM attendance a 
      JOIN workers w ON a.worker_id = w.id 
      WHERE w.site_id = ? 
      ORDER BY a.date DESC
    `, [manager.site_id]);
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error loading attendance' });
  }
};

// 💵 Payments
exports.getPayments = async (req, res) => {
  try {
    const managerId = req.user.id;
    const [manager] = await db.query('SELECT site_id FROM users WHERE id = ?', [managerId]);
    const [payments] = await db.query(`
      SELECT p.id, w.name AS worker_name, p.amount, p.status 
      FROM payments p 
      JOIN workers w ON p.worker_id = w.id 
      WHERE w.site_id = ? 
      ORDER BY p.id DESC
    `, [manager.site_id]);
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error loading payments' });
  }
};

// ✅ Mark as Paid
exports.markPaymentPaid = async (req, res) => {
  try {
    const paymentId = req.params.id;
    await db.query('UPDATE payments SET status = "Paid" WHERE id = ?', [paymentId]);
    res.json({ msg: 'Payment marked as paid' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error updating payment' });
  }
};

// 📊 Reports Summary
exports.getReports = async (req, res) => {
  try {
    const managerId = req.user.id;
    const [manager] = await db.query('SELECT site_id FROM users WHERE id = ?', [managerId]);

    const [paid] = await db.query(`
      SELECT COUNT(*) AS total FROM payments p
      JOIN workers w ON p.worker_id = w.id
      WHERE w.site_id = ? AND p.status = 'Paid'
    `, [manager.site_id]);

    const [pending] = await db.query(`
      SELECT COUNT(*) AS total FROM payments p
      JOIN workers w ON p.worker_id = w.id
      WHERE w.site_id = ? AND p.status = 'Pending'
    `, [manager.site_id]);

    res.json({
      paid: paid[0].total,
      pending: pending[0].total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Error loading reports' });
  }
};
