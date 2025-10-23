const db = require("../config/db");

// Get all roles
exports.getRoles = (req, res) => {
  db.query("SELECT * FROM roles", (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};

// Create role
exports.createRole = (req, res) => {
  const { name, amount } = req.body;
  if (!name || !amount) return res.status(400).json({ msg: "All fields are required" });

  db.query("INSERT INTO roles (name, amount) VALUES (?, ?)", [name, amount], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.status(201).json({ msg: "Role created successfully", id: result.insertId });
  });
};

// Update role
exports.updateRole = (req, res) => {
  const { id } = req.params;
  const { name, amount } = req.body;
  if (!name || !amount) return res.status(400).json({ msg: "All fields are required" });

  db.query("UPDATE roles SET name = ?, amount = ? WHERE id = ?", [name, amount, id], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ msg: "Role not found" });
    res.json({ msg: "Role updated successfully" });
  });
};

// Delete role
exports.deleteRole = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM roles WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ msg: "Role not found" });
    res.json({ msg: "Role deleted successfully" });
  });
};
