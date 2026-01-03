import React, { useMemo, useState } from 'react';
import { FaCreditCard, FaHandHoldingUsd, FaMoneyBillWave, FaReceipt, FaUndo, FaExclamationCircle, FaEraser, FaSpinner } from 'react-icons/fa';
import { reverseAmendment } from '../api/api'; // NEW API IMPORT

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const buildPaymentHistory = (booking) => {
    if (!booking) return [];
    const history = [];

    // 1. Initial Payments
    (booking.initialPayments || []).forEach(payment => {
        let methodDisplay = payment.transactionMethod;
        let details = 'Initial payment';
        let icon = <FaHandHoldingUsd className="text-green-500" />;

        if (payment.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && payment.appliedCustomerCreditNoteUsage) {
            methodDisplay = 'Customer Credit';
            const creditNote = payment.appliedCustomerCreditNoteUsage.creditNote;
            const originalRefNo = creditNote?.generatedFromCancellation?.originalBooking?.refNo?.trim();
            details = `Used Note ID: ${creditNote.id} (from ${originalRefNo || 'N/A'})`;
            icon = <FaCreditCard className="text-blue-500" />;
        }

        history.push({
            id: `initial-${payment.id}`,
            date: payment.paymentDate,
            type: 'Initial Payment',
            method: methodDisplay.replace(/_/g, ' '),
            amount: parseFloat(payment.amount || 0),
            details: details,
            icon: icon,
        });
    });

    // 2. Instalments
    (booking.instalments || []).forEach(instalment => {
        (instalment.payments || []).forEach(payment => {
            history.push({
                id: `instalment-${payment.id}`,
                date: payment.paymentDate,
                type: 'Instalment Payment',
                method: payment.transactionMethod.replace(/_/g, ' '),
                amount: parseFloat(payment.amount || 0),
                details: `For instalment due ${formatDate(instalment.dueDate)}`,
                icon: <FaMoneyBillWave className="text-gray-500" />,
            });
        });
    });

    // 3. Cancellations & Refunds
    if (booking.cancellation) {
        const cancellation = booking.cancellation;
        if (cancellation.createdCustomerPayable) {
            (cancellation.createdCustomerPayable.settlements || []).forEach(settlement => {
                history.push({
                    id: `cp-settle-${settlement.id}`,
                    date: settlement.paymentDate,
                    type: 'Cancellation Debt Paid',
                    method: settlement.transactionMethod.replace(/_/g, ' '),
                    amount: parseFloat(settlement.amount || 0),
                    details: `Settled payable for ${cancellation.folderNo}`,
                    icon: <FaExclamationCircle className="text-orange-500" />,
                });
            });
        }
        if (cancellation.refundPayment) {
             history.push({
                id: 'refund-paid',
                date: cancellation.refundPayment.refundDate,
                type: 'Passenger Refund (Cash)',
                method: cancellation.refundPayment.transactionMethod.replace(/_/g, ' '),
                amount: -parseFloat(cancellation.refundPayment.amount || 0),
                details: `Refund processed for ${cancellation.folderNo}`,
                icon: <FaUndo className="text-red-500" />,
            });
        }
    }

    // 4. NEW: Amendments (Write-offs)
    (booking.amendments || []).forEach(amendment => {
        history.push({
            id: `amendment-${amendment.id}`,
            date: amendment.createdAt,
            type: amendment.type === 'WRITE_OFF' ? 'Write-Off' : 'Adjustment',
            method: 'ADJUST',
            amount: parseFloat(amendment.difference || 0),
            details: amendment.reason,
            icon: <FaEraser className={amendment.isReversed ? "text-gray-400" : "text-orange-500"} />,
            isAmendment: true,
            amendmentId: amendment.id,
            isReversed: amendment.isReversed
        });
    });

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    return history;
};

export default function PaymentHistoryPopup({ booking, onClose }) {
    const [isReversing, setIsReversing] = useState(null); // Track which amendment is reversing
    const paymentHistory = useMemo(() => buildPaymentHistory(booking), [booking]);

    if (!booking) return null;

    const handleReverse = async (amendmentId) => {
        if (!window.confirm("Are you sure you want to reverse this write-off? This will restore the previous balance.")) return;
        
        setIsReversing(amendmentId);
        try {
            await reverseAmendment(amendmentId);
            // Ideally, refresh the parent data here. 
            // Since we don't have a direct refetch here, usually the page reloads or onClose triggers a refresh.
            alert("Adjustment reversed successfully.");
            onClose(); 
        } catch (err) {
            alert(err.message || "Failed to reverse.");
        } finally {
            setIsReversing(null);
        }
    };

    const revenue = parseFloat(booking.revenue || 0);
    const received = parseFloat(booking.received || 0);
    const balance = parseFloat(booking.balance || 0);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">Booking Ledger & History</h3>
                        <p className="text-sm text-gray-500">
                            Ref: <span className="font-semibold text-blue-600">{booking.refNo}</span> | Passenger: <span className="font-semibold">{booking.paxName}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 border-t border-b py-4 bg-gray-50 rounded-lg px-4">
                    <div className="text-center">
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total Revenue</p>
                        <p className="text-lg font-bold text-gray-800">£{revenue.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total Received</p>
                        <p className="text-lg font-bold text-green-600">£{received.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-gray-500 uppercase font-semibold">Current Balance</p>
                        <p className={`text-lg font-bold ${balance > 0 ? 'text-red-600' : (balance < 0 ? 'text-blue-600' : 'text-green-600')}`}>
                            £{balance.toFixed(2)}
                        </p>
                    </div>
                </div>

                <div className="overflow-y-auto flex-grow">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method/Ref</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount (£)</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {paymentHistory.map((item) => (
                                <tr key={item.id} className={`${item.isAmendment ? 'bg-orange-50/30' : ''} ${item.isReversed ? 'opacity-40 line-through' : ''} hover:bg-gray-50`}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDate(item.date)}</td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center gap-2">
                                            {item.icon} <span>{item.type}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.method}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{item.details}</td>
                                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold text-right ${item.amount < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                                        {item.amount.toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {item.isAmendment && !item.isReversed && (
                                            <button 
                                                onClick={() => handleReverse(item.amendmentId)}
                                                disabled={isReversing === item.amendmentId}
                                                className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                                            >
                                                {isReversing === item.amendmentId ? <FaSpinner className="animate-spin" /> : 'Reverse'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}