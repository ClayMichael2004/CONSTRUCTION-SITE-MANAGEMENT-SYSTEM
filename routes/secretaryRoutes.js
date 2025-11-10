const express = require('express');
const router = express.Router();
const secretaryController = require('../controllers/secretaryController');
const { protect } = require('../middleware/authMiddleware');

// === Shared (view-only) access ===
// Admins and Managers can view, Secretaries can also view their own site data
router.get('/roles', protect(['admin', 'manager', 'secretary']), secretaryController.getRoles);
router.get('/workers', protect(['admin', 'manager', 'secretary']), secretaryController.getWorkers);
router.get('/attendance', protect(['admin', 'manager', 'secretary']), secretaryController.getAttendance);
router.get('/inventory', protect(['admin', 'manager', 'secretary']), secretaryController.getInventory);
router.get('/payments', protect(['admin', 'manager', 'secretary']), secretaryController.getPayments);

// === Write (modify) access — Secretary only ===
router.post('/workers', protect(['secretary']), secretaryController.registerWorker);
router.post('/attendance', protect(['secretary']), secretaryController.markAttendance);
router.post('/inventory', protect(['secretary']), secretaryController.addInventory);
router.put('/inventory/:id', protect(['secretary']), secretaryController.updateInventory);

module.exports = router;
