const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const managerController = require('../controllers/managerController');

router.get('/dashboard', authMiddleware(['manager']), managerController.getDashboard);
router.get('/workers', authMiddleware(['manager']), managerController.getWorkers);
router.get('/attendance', authMiddleware(['manager']), managerController.getAttendance);
router.get('/payments', authMiddleware(['manager']), managerController.getPayments);
router.put('/payments/:id/mark-paid', authMiddleware(['manager']), managerController.markPaymentPaid);
router.get('/reports', authMiddleware(['manager']), managerController.getReports);

module.exports = router;
