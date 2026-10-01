const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    getContracts,
    getContractById,
    getContractCategories,
    createContract,
    updateContract,
    deleteContract,
    getDealers,
    getDealerSuggestions
} = require('../controllers/contracts.controller');

// Get all contracts with filtering and pagination
router.get('/', auth, getContracts);

// Distinct category_name values for filter dropdowns (must come before /:id)
router.get('/meta/categories', auth, getContractCategories);

// Dealers — aggregated view of contracts WHERE meril_db = 'YES'
router.get('/dealers/suggestions', auth, getDealerSuggestions);
router.get('/dealers', auth, getDealers);

// Get single contract by ID
router.get('/:id', auth, getContractById);

// Create new contract
router.post('/', auth, createContract);

// Update contract
router.put('/:id', auth, updateContract);

// Delete contract
router.delete('/:id', auth, deleteContract);

module.exports = router;
