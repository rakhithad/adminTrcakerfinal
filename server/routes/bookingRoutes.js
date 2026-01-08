const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware');

const {
  createPendingBooking,
  getPendingBookings,
  approveBooking,
  rejectBooking,
  createBooking,
  getBookings,
  updateBooking,
  getDashboardStats,
  getRecentBookings,
  getCustomerDeposits,
  updateInstalment,
  getSuppliersInfo,
  createSupplierPaymentSettlement,
  updatePendingBooking,
  recordSettlementPayment,
  getTransactions,
  createCancellation,
  getAvailableCreditNotes,
  createDateChangeBooking,
  createSupplierPayableSettlement,
  settleCustomerPayable,
  recordPassengerRefund,
  voidBooking,
  unvoidBooking,
  generateInvoice,
  updateAccountingMonth,
  updateCommissionAmount,
  getCustomerCreditNotes,
  getAttentionBookings,
  getOverdueBookings,
  writeOffBookingBalance,
  reverseAmendment,
  getAgentCommissions,
  updateCommissionMonth
} = require('../controllers/bookingController');


router.post('/pending', authenticateToken, createPendingBooking);
router.get('/pending', authenticateToken,authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getPendingBookings);
router.put('/pending/:id', authenticateToken,authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), updatePendingBooking);
router.post('/pending/:id/approve', authenticateToken,authorizeRole(['ADMIN', 'SUPER_ADMIN']), approveBooking);
router.post('/pending/:id/reject', authenticateToken,authorizeRole(['ADMIN', 'SUPER_ADMIN']), rejectBooking);
router.post('/', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), createBooking);
router.get('/', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getBookings);

router.get('/dashboard/stats', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']),  getDashboardStats);
router.get('/dashboard/attention-bookings',authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getAttentionBookings);
router.get('/dashboard/overdue-bookings',authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getOverdueBookings);

router.get('/dashboard/recent', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getRecentBookings);
router.get('/customer-deposits', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getCustomerDeposits);
router.patch('/instalments/:id', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), updateInstalment);
router.get('/suppliers-info', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getSuppliersInfo);
router.post('/suppliers/settlements', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), createSupplierPaymentSettlement);
router.post('/:bookingId/record-settlement-payment', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), recordSettlementPayment);
router.get('/transactions', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getTransactions);
router.post('/:id/cancel', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), createCancellation);
router.put('/:id', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateBooking);
router.get('/credit-notes/available/:supplier', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getAvailableCreditNotes);
router.post('/:id/date-change', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), createDateChangeBooking);
router.post('/supplier-payable/settle', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), createSupplierPayableSettlement);
router.post('/customer-payable/:id/settle', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), settleCustomerPayable);
router.post('/cancellations/:id/record-refund', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), recordPassengerRefund);
router.post('/:id/void', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), voidBooking);
router.post('/:id/unvoid', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), unvoidBooking);

router.post('/:id/invoice', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), generateInvoice);
router.put('/:id/accounting-month', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateAccountingMonth);
router.put('/:id/commission-amount', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), updateCommissionAmount);

router.get('/credit-notes/customer', authenticateToken, authorizeRole(['CONSULTANT','MANAGEMENT','ADMIN', 'SUPER_ADMIN']), getCustomerCreditNotes);

router.post('/:id/write-off', authenticateToken, writeOffBookingBalance);
router.post('/amendments/:amendmentId/reverse', authenticateToken, reverseAmendment);
router.get('/commissions/agent', authenticateToken, getAgentCommissions);
router.patch('/commissions/:id/month', authenticateToken, updateCommissionMonth);

module.exports = router;