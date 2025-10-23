const db = require("../config/db");

// Get all sites
exports.getSites = (req, res) => {
  db.query("SELECT * FROM sites", (err, results) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.json(results);
  });
};

// Create site
exports.createSite = (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ msg: "Site name is required" });

  db.query("INSERT INTO sites (name) VALUES (?)", [name], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    res.status(201).json({ msg: "Site created successfully", id: result.insertId });
  });
};

// Update site
exports.updateSite = (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ msg: "Site name is required" });

  db.query("UPDATE sites SET name = ? WHERE id = ?", [name, id], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ msg: "Site not found" });
    res.json({ msg: "Site updated successfully" });
  });
};

// Delete site
exports.deleteSite = (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM sites WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ msg: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ msg: "Site not found" });
    res.json({ msg: "Site deleted successfully" });
  });
};
