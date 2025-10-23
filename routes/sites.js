const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const sitesController = require("../controllers/sitesController");

router.get("/", protect(["admin"]), sitesController.getSites);
router.post("/", protect(["admin"]), sitesController.createSite);
router.put("/:id", protect(["admin"]), sitesController.updateSite);
router.delete("/:id", protect(["admin"]), sitesController.deleteSite);

module.exports = router;
