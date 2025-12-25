// server/routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const { getTransactions, generateTransactionReportPdf } = require('../controllers/transactionController');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware.js');

router.get('/', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getTransactions);
router.post('/summary-pdf', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), generateTransactionReportPdf);

module.exports = router;