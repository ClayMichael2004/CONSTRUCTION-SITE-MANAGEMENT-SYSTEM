// routes/reports.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getAttendanceReport,
  getPaymentsReport,
  getWorkersReport,
  getInventoryReport
} = require("../controllers/reportController");

// only admin can access reports (adjust roles array if you want managers to view too)
router.get("/attendance", protect(["admin"]), getAttendanceReport);
router.get("/payments",   protect(["admin"]), getPaymentsReport);
router.get("/workers",    protect(["admin"]), getWorkersReport);
router.get("/inventory",  protect(["admin"]), getInventoryReport);



module.exports = router;
