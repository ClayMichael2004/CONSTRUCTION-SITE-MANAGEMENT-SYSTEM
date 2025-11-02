const express = require('express');
const {
  register,
  login,
  getUsers,
  deleteUser,
  updateUser,
  resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// 🔐 Admin routes
router.post('/register', protect(['admin']), register);
router.get('/users', protect(['admin']), getUsers);
router.delete('/users/:id', protect(['admin']), deleteUser);
router.put('/users/:id', protect(['admin']), updateUser);
router.put('/users/:id/reset-password', protect(['admin']), resetPassword);

// 👥 Public login route
router.post('/login', login);

// ✅ NEW: Return current logged-in user info (manager, secretary, or admin)
router.get('/me', protect(), async (req, res) => {
  try {
    // req.user is set in authMiddleware (id, role, siteId, etc.)
    res.json(req.user);
  } catch (err) {
    console.error("Error fetching current user:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
