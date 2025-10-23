const express=require('express');
const { register, login, getUsers, deleteUser, updateUser, resetPassword } = require('../controllers/authController');
const {protect}=require('../middleware/authMiddleware');

const router= express.Router();


router.post('/register', protect(['admin']), register);
router.post('/login', login);

router.get('/users', protect(['admin']), getUsers);
router.delete('/users/:id', protect(['admin']), deleteUser);
router.put('/users/:id', protect(['admin']), updateUser);
router.put('/users/:id/reset-password', protect(['admin']), resetPassword);

module.exports= router;