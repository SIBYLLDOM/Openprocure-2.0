const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
    getIncidents,
    getIncidentById,
    createIncident,
    updateIncident,
    deleteIncident
} = require('../controllers/incidents.controller');

// Get all incidents with filtering and pagination
router.get('/', auth, getIncidents);

// Get single incident by ID
router.get('/:id', auth, getIncidentById);

// Create new incident
router.post('/', auth, createIncident);

// Update incident
router.put('/:id', auth, updateIncident);

// Delete incident
router.delete('/:id', auth, deleteIncident);

module.exports = router;
