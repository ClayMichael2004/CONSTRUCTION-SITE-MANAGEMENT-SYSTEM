const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const managerController = require('../controllers/managerController');

// Dashboard & data endpoints
router.get('/dashboard', protect(['manager']), managerController.getDashboard);
router.get('/workers', protect(['manager']), managerController.getWorkers);
router.get('/attendance', protect(['manager']), managerController.getAttendance);
router.get('/inventory', protect(['manager']), managerController.getInventory);
router.get('/payments', protect(['manager']), managerController.getPayments);
router.post('/payments/mark-paid', protect(['manager']), managerController.markPayment);
router.put("/payments/close-period",protect(['manager']), managerController.closePaymentPeriod);
router.get('/reports', protect(['manager']), managerController.getReports);


module.exports = router;
