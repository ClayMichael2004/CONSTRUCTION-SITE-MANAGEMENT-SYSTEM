const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const managerController = require('../controllers/managerController');

router.get('/dashboard', protect(['manager']), managerController.getDashboard);
router.get('/workers', protect(['manager']), managerController.getWorkers);
router.get('/attendance', protect(['manager']), managerController.getAttendance);
router.get('/payments', protect(['manager']), managerController.getPayments);
router.put('/payments/:id/mark-paid', protect(['manager']), managerController.markPaymentPaid);
router.get('/reports', protect(['manager']), managerController.getReports);

module.exports = router;
