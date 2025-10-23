const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register new user
exports.register = async (req, res) => {
  const { name, email, phone, password, role, siteId } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ msg: "All fields are required" });
  }

  if (role === "secretary" && !siteId) {
    return res.status(400).json({ msg: "Site is required for secretaries" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO users (name, email, phone, password, role, site_id) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, phone, hashedPassword, role, siteId || null],
      (err) => {
        if (err) return res.status(500).json({ msg: err.message });
        res.status(201).json({ msg: "User registered successfully" });
      }
    );
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};


// Login
exports.login = (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (results.length === 0) return res.status(401).json({ msg: "Invalid credentials" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ msg: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, role: user.role, siteId: user.site_id },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // return token, role, name, site
    res.json({ token, role: user.role, name: user.name, siteId: user.site_id });
  });
};

// Get all users (admin)
exports.getUsers = (req, res) => {
  const sql = `
    SELECT u.id, u.name, u.email, u.phone, u.role, u.site_id, s.name AS site_name, u.created_at
    FROM users u
    LEFT JOIN sites s ON u.site_id = s.id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};

// Update user
exports.updateUser = (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, siteId } = req.body;

  db.query(
    "UPDATE users SET name=?, email=?, phone=?, role=?, site_id=? WHERE id=?",
    [name, email, phone, role, siteId || null, id],
    (err, result) => {
      if (err) return res.status(500).json({ msg: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ msg: "User not found" });
      res.json({ msg: "User updated successfully" });
    }
  );
};

// Reset password
exports.resetPassword = async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) return res.status(400).json({ msg: "New password is required" });

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  db.query(
    "UPDATE users SET password=? WHERE id=?",
    [hashedPassword, id],
    (err, result) => {
      if (err) return res.status(500).json({ msg: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ msg: "User not found" });
      res.json({ msg: "Password reset successfully" });
    }
  );
};

// Delete user
exports.deleteUser = (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM users WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: "User not found" });
    }
    res.json({ msg: "User deleted successfully" });
  });
};
