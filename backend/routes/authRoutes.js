const express = require('express');
const router = express.Router();
const { registerPartner, getCaptcha, getCompanyTypes, updateCompanyTypes, login, getProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register-partner', registerPartner);
router.get('/captcha', getCaptcha);
router.get('/company-types', getCompanyTypes);
router.patch('/company-types', protect, updateCompanyTypes);
router.post('/login', login);
router.get('/me', protect, getProfile);

module.exports = router;
