// server/routes/supplierReportRoutes.js
const express = require('express');
const router = express.Router();
const { generateSupplierReportPdf } = require('../controllers/supplierReportController');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');

router.post('/pdf', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), generateSupplierReportPdf);

module.exports = router;