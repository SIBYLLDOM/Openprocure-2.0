const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getUsers, createUser, updateUser, resetUserPassword, generateResetLink,
  deactivateUser, deleteUserPermanently, updateMyProfile, changeMyPassword, getMyProfile,
} = require('../controllers/userManagement.controller');

// Self-service routes (any authenticated user) — must be before /:id
router.get('/me', auth, getMyProfile);
router.put('/me/profile', auth, updateMyProfile);
router.put('/me/password', auth, changeMyPassword);

// Admin / monitor routes
router.get('/', auth, getUsers);
router.post('/', auth, createUser);
router.put('/:id', auth, updateUser);
router.put('/:id/reset-password', auth, resetUserPassword);
router.post('/:id/reset-link', auth, generateResetLink);
router.delete('/:id/permanent', auth, deleteUserPermanently);
router.delete('/:id', auth, deactivateUser);

module.exports = router;
