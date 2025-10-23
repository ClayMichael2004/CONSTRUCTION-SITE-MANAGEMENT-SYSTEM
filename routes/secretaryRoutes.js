const express= require('express');
const router=express.Router();
const secretaryController= require('../controllers/secretaryController');
const { protect } = require('../middleware/authMiddleware');

// Admin/manager can view across sites; secretaries are scoped by token.site
router.get('/roles', protect(['admin','manager','secretary']), secretaryController.getRoles);
router.get('/workers', protect(['admin','manager','secretary']), secretaryController.getWorkers);
router.post('/workers', protect(['secretary','admin']), secretaryController.registerWorker);

router.get('/attendance', protect(['admin','manager','secretary']), secretaryController.getAttendance);
router.post('/attendance', protect(['secretary']), secretaryController.markAttendance);

router.get('/inventory', protect(['admin','manager','secretary']), secretaryController.getInventory);
router.post('/inventory', protect(['secretary']), secretaryController.addInventory);
router.put('/inventory/:id', protect(['secretary']), secretaryController.updateInventory);

router.get('/payments', protect(['admin','manager','secretary']), secretaryController.getPayments);

module.exports= router;
