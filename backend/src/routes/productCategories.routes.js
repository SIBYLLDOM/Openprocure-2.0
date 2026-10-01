const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/productCategories.controller');

router.get('/',     auth, getCategories);
router.post('/',    auth, createCategory);
router.put('/:id',  auth, updateCategory);
router.delete('/:id', auth, deleteCategory);

module.exports = router;
