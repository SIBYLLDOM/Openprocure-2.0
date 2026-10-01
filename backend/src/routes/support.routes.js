const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  createTicket, getTickets, getTicket, updateTicketStatus, uploadMiddleware,
  exportTickets, exportTicketsPdf, mailTicketsPdf,
} = require('../controllers/support.controller');

router.post('/', auth, uploadMiddleware, createTicket);
router.get('/', auth, getTickets);
router.get('/export', auth, exportTickets);
router.get('/export-pdf', auth, exportTicketsPdf);
router.get('/mail-pdf', auth, mailTicketsPdf);
router.get('/:id', auth, getTicket);
router.put('/:id/status', auth, updateTicketStatus);

module.exports = router;
