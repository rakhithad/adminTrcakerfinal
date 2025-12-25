// server/routes/internalInvoiceRoutes.js
const express = require('express');
const router = express.Router();
const {
    getInternalInvoicingReport,
    createInternalInvoice,
    updateInternalInvoice,
    getInvoiceHistoryForBooking,
    downloadInvoicePdf,
    updateAccountingMonth,
    generateCommissionSummaryPdf
} = require('../controllers/internalInvoiceController');
const { updateCommissionAmount } = require('../controllers/bookingController');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware.js');

router.get('/', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getInternalInvoicingReport);
router.post('/', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), createInternalInvoice);
router.put('/accounting-month', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateAccountingMonth);
router.put('/:invoiceId', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateInternalInvoice);
router.get('/:recordType/:recordId/history', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getInvoiceHistoryForBooking);
router.get('/:invoiceId/pdf', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), downloadInvoicePdf);
router.put('/commission-amount', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateCommissionAmount);
router.post('/summary-pdf', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), generateCommissionSummaryPdf);


module.exports = router;