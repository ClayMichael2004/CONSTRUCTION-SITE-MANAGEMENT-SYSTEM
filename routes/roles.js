const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const rolesController = require("../controllers/rolesController");

router.get("/", protect(["admin", "secretary"]), rolesController.getRoles);
router.post("/", protect(["admin"]), rolesController.createRole);
router.put("/:id", protect(["admin"]), rolesController.updateRole);
router.delete("/:id", protect(["admin"]), rolesController.deleteRole);

module.exports = router;
