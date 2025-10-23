const bcrypt = require('bcrypt');
const db = require('../config/db');

// Create secretary
exports.createSecretary = async (full_name, email, password, site_id, callback) => {
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.query(
            "INSERT INTO secretaries (full_name, email, password, site_id) VALUES (?,?,?,?)",
            [full_name, email, hashed, site_id],
            callback
        );
    } catch (err) {
        callback(err, null);
    }
};

// Find secretary by email
exports.findByEmail = (email, callback) => {
    db.query("SELECT * FROM secretaries WHERE email=?", [email], callback);
};
