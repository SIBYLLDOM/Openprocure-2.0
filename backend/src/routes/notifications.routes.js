const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/notifications.controller');

// SSE stream authenticates from the query string (EventSource cannot send
// headers), so it must sit before/outside the auth middleware.
router.get('/stream', ctrl.stream);

router.get('/', auth, ctrl.list);
router.patch('/read-all', auth, ctrl.markAllRead);   // before /:id so it isn't swallowed
router.patch('/:id/read', auth, ctrl.markRead);

module.exports = router;
