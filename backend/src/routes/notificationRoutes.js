const express = require('express');
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/subscribe', authenticateToken, notificationController.subscribe);

module.exports = router;
