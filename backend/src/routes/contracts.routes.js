const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    getContracts,
    getContractById,
    createContract,
    updateContract,
    deleteContract
} = require('../controllers/contracts.controller');

// Get all contracts with filtering and pagination
router.get('/', auth, getContracts);

// Get single contract by ID
router.get('/:id', auth, getContractById);

// Create new contract
router.post('/', auth, createContract);

// Update contract
router.put('/:id', auth, updateContract);

// Delete contract
router.delete('/:id', auth, deleteContract);

module.exports = router;
