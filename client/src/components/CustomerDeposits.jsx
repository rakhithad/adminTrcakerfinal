import React, { useState, useEffect, useMemo } from 'react';
import { getCustomerDeposits, generateCustomerDepositReportPDF, recordSettlementPayment } from '../api/api';
import InstalmentPaymentPopup from './InstalmentPaymentPopup';
import FinalSettlementPopup from './FinalSettlementPopup';
import PaymentHistoryPopup from './PaymentHistoryPopup';
import WriteOffBalancePopup from './WriteOffBalancePopup'; // NEW IMPORT
import { FaSearch, FaExclamationCircle, FaCheckCircle, FaBan, FaMoneyBillWave, FaHandHoldingUsd, FaReceipt, FaDownload, FaSpinner, FaEraser } from 'react-icons/fa';
import SettleCustomerPayablePopup from '../components/SettleCustomerPayablePopup';
import RecordRefundPopup from '../components/RecordRefundPopup';

const ActionButton = ({ onClick, icon, children, color = 'blue' }) => {
    const colorClasses = {
        blue: 'bg-blue-600 hover:bg-blue-700 text-white',
        red: 'bg-red-600 hover:bg-red-700 text-white',
        green: 'bg-green-600 hover:bg-green-700 text-white',
        yellow: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        orange: 'bg-orange-600 hover:bg-orange-700 text-white', // Added orange
    };
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`flex items-center justify-center gap-1 w-full px-2 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-all duration-200 transform hover:scale-105 ${colorClasses[color]}`}
        >
            {icon}
            <span>{children}</span>
        </button>
    );
};

const StatusBadge = ({ children, color = 'gray' }) => {
    const colorClasses = {
        gray: 'bg-gray-100 text-gray-700',
        green: 'bg-green-100 text-green-800',
        red: 'bg-red-100 text-red-800',
        blue: 'bg-blue-100 text-blue-800',
        purple: 'bg-purple-100 text-purple-800'
    };
    return (
        <div className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${colorClasses[color]}`}>
            {children}
        </div>
    );
};

const getActionStatus = (booking) => {
    // 1. Check Cancellation Status first
    if (booking.bookingStatus === 'CANCELLED') {
        const cancellation = booking.cancellation;
        if (cancellation?.createdCustomerPayable?.pendingAmount > 0) return 'CUSTOMER_OWES';
        if (cancellation?.refundStatus === 'PAID') return 'REFUND_PAID';
        if (cancellation?.refundStatus === 'PENDING') return 'REFUND_PENDING';
        return 'CANCELLED_SETTLED';
    }

    // 2. Handle the Write-Off / Completed Logic
    const balance = parseFloat(booking.balance || 0);

    // If balance is basically zero, it's COMPLETED. No buttons should show.
    if (Math.abs(balance) < 0.01) {
        return 'COMPLETED';
    }

    // 3. Handle Active Debits/Credits
    if (balance > 0.01) {
        const hasPending = (booking.instalments || []).some(
            inst => ['PENDING', 'OVERDUE'].includes(inst.status)
        );
        return hasPending ? 'INSTALMENT_DUE' : 'FINAL_SETTLEMENT_DUE';
    }

    if (balance < -0.01) return 'OVERPAID';

    return 'COMPLETED';
};

const ActionCell = ({ booking, onAction, expanded, onToggleExpand }) => {
    const status = getActionStatus(booking);
    const permissions = booking._permissions || { canSettlePayments: false };

    // 1. If the booking is completed, show the badge and STOP.
    if (status === 'COMPLETED') {
        return <StatusBadge color="green"><FaCheckCircle /> Completed</StatusBadge>;
    }

    // Helper for Write-off link
    const WriteOffButton = () => (
        <button 
            onClick={() => onAction('writeOff', booking)}
            className="text-[10px] text-gray-400 hover:text-orange-600 underline font-medium block mx-auto mt-1"
        >
            Write-off Balance
        </button>
    );

    // 2. Permission Check
    if (!permissions.canSettlePayments) {
        switch (status) {
            case 'CUSTOMER_OWES': return <StatusBadge color="red"><FaExclamationCircle /> Debt Pending</StatusBadge>;
            case 'FINAL_SETTLEMENT_DUE': return <StatusBadge color="yellow"><FaExclamationCircle /> Balance Due</StatusBadge>;
            case 'INSTALMENT_DUE': return <StatusBadge color="gray"><FaMoneyBillWave /> Instalment Due</StatusBadge>;
            default: return <StatusBadge color="green"><FaCheckCircle /> Completed</StatusBadge>;
        }
    }

    // 3. Main Action Switch
    switch (status) {
        case 'CUSTOMER_OWES': {
            const payable = booking.cancellation.createdCustomerPayable;
            return (
                <div className="text-center space-y-1">
                    <ActionButton color="red" icon={<FaHandHoldingUsd />} onClick={() => onAction('settlePayable', { payable, booking })}>
                        Settle Debt
                    </ActionButton>
                    <p className="text-xs text-red-600 font-medium">Owes: £{payable.pendingAmount.toFixed(2)}</p>
                    <WriteOffButton />
                </div>
            );
        }

        case 'FINAL_SETTLEMENT_DUE':
            return (
                <div className="text-center space-y-1">
                    <ActionButton color="yellow" icon={<FaExclamationCircle />} onClick={() => onAction('finalSettlement', booking)}>
                        Final Settlement
                    </ActionButton>
                    <p className="text-xs text-yellow-700 font-medium">Balance: £{parseFloat(booking.balance).toFixed(2)}</p>
                    <WriteOffButton />
                </div>
            );

        case 'INSTALMENT_DUE': {
    const instalments = booking.instalments || [];
    const nextInstalment = instalments.find(inst => ['PENDING', 'OVERDUE'].includes(inst.status));
    
    if (!nextInstalment && instalments.length === 0) return <StatusBadge color="gray">No instalments found</StatusBadge>;

    if (!expanded) {
        return (
            <div className="text-center space-y-1">
                {nextInstalment && (
                    <>
                        <ActionButton icon={<FaMoneyBillWave />} onClick={() => onAction('payInstalment', { instalment: nextInstalment, booking })}>
                            Pay Instalment
                        </ActionButton>
                        <p className="text-xs text-gray-600">Next: £{nextInstalment.amount.toFixed(2)}</p>
                    </>
                )}
                <WriteOffButton />
                {instalments.length > 0 && (
                    <button onClick={onToggleExpand} className="text-blue-600 hover:underline text-xs font-medium mt-1">
                        Show All ({instalments.length})
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="text-left space-y-2 p-2 bg-gray-50 rounded-lg w-full">
            {instalments.map(inst => (
                <div key={inst.id} className="flex justify-between items-center text-xs p-1.5 rounded bg-white shadow-sm">
                    <div className="flex flex-col">
                        <span className="font-semibold">£{parseFloat(inst.amount).toFixed(2)}</span>
                        <span className="text-gray-500">Due: {new Date(inst.dueDate).toLocaleDateString('en-GB')}</span>
                    </div>
                    <StatusBadge color={inst.status === 'PAID' ? 'green' : (inst.status === 'OVERDUE' ? 'red' : 'gray')}>
                        {inst.status}
                    </StatusBadge>
                </div>
            ))}
            <WriteOffButton />
            <button onClick={onToggleExpand} className="text-blue-600 hover:underline text-xs font-medium mt-2 w-full text-center">
                Collapse
            </button>
        </div>
    );
}

        case 'OVERPAID':
            return (
                <div className="text-center space-y-1">
                    <StatusBadge color="blue"><FaCheckCircle /> Overpaid</StatusBadge>
                    <WriteOffButton />
                </div>
            );

        default:
            return <StatusBadge color="green"><FaCheckCircle /> Completed</StatusBadge>;
    }
};

export default function CustomerDeposits() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [paymentPopup, setPaymentPopup] = useState(null);
    const [settlementPopup, setSettlementPopup] = useState(null);
    const [writeOffPopup, setWriteOffPopup] = useState(null); // NEW STATE
    const [expandedRows, setExpandedRows] = useState({});
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [historyPopupBooking, setHistoryPopupBooking] = useState(null);
    const [customerPayablePopup, setCustomerPayablePopup] = useState(null);
    const [recordRefundPopup, setRecordRefundPopup] = useState(null);
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 3);
        return date.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    useEffect(() => {
        fetchBookings();
    }, []);

    const fetchBookings = async () => {
        try {
            setLoading(true);
            const response = await getCustomerDeposits();
            const data = response.data.data || response.data || [];
            setBookings(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching customer deposits:', error);
            setErrorMessage(error.message || 'Failed to load customer deposits.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettlement = async (bookingId, formData) => {
        try {
            await recordSettlementPayment(bookingId, formData); 
            handleActionCompletion(); 
        } catch (error) {
            console.error("Failed to save settlement:", error);
            throw error; 
        }
    };

    const handleSavePayment = (payload) => {
        const { updatedInstalment, bookingUpdate } = payload;
        setBookings((prevBookings) =>
            prevBookings.map((booking) => {
                if (booking.id !== bookingUpdate.id) return booking;
                return {
                    ...booking,
                    received: bookingUpdate.received,
                    balance: bookingUpdate.balance,
                    instalments: booking.instalments.map((inst) =>
                        inst.id === updatedInstalment.id ? updatedInstalment : inst
                    ),
                };
            })
        );
        setPaymentPopup(null);
    };

    const handleActionCompletion = async () => {
    // 1. Re-fetch from server to get the NEW calculated balance
    await fetchBookings(); 
    
    // 2. Close all popups
    setSettlementPopup(null);
    setCustomerPayablePopup(null);
    setRecordRefundPopup(null);
    setWriteOffPopup(null); 
};

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-GB');
    };

    const toggleExpand = (bookingId) => {
        setExpandedRows((prev) => ({ ...prev, [bookingId]: !prev[bookingId] }));
    };

    const filteredBookings = useMemo(() => {
        return bookings.filter((booking) => {
            const actionStatus = getActionStatus(booking);
            let statusMatch = true;

            switch (filter) {
                case 'customer_owes': statusMatch = actionStatus === 'CUSTOMER_OWES'; break;
                case 'refund_pending': statusMatch = ['REFUND_PENDING', 'CREDIT_AVAILABLE', 'CREDIT_PARTIAL'].includes(actionStatus); break;
                case 'final_settlement': statusMatch = actionStatus === 'FINAL_SETTLEMENT_DUE'; break;
                case 'instalment_due': statusMatch = actionStatus === 'INSTALMENT_DUE'; break;
                case 'completed_settled':
                    statusMatch = ['COMPLETED', 'OVERPAID', 'REFUND_PAID', 'CREDIT_USED', 'CANCELLED_SETTLED'].includes(actionStatus);
                    break;
                case 'all':
                default: statusMatch = true; break;
            }

            if (!statusMatch) return false;

            if (searchTerm.trim() === '') return true;
            const searchLower = searchTerm.toLowerCase();
            return (
                (booking.folderNo || '').toString().toLowerCase().includes(searchLower) ||
                (booking.refNo || '').toLowerCase().includes(searchLower) ||
                (booking.paxName || '').toLowerCase().includes(searchLower) ||
                (booking.agentName || '').toLowerCase().includes(searchLower) ||
                (booking.paymentMethod || '').toLowerCase().includes(searchLower)
            );
        });
    }, [bookings, filter, searchTerm]);

    const handleAction = (actionType, payload) => {
        switch (actionType) {
            case 'settlePayable': setCustomerPayablePopup(payload); break;
            case 'recordRefund': setRecordRefundPopup(payload); break;
            case 'finalSettlement': setSettlementPopup(payload); break;
            case 'payInstalment': setPaymentPopup(payload); break;
            case 'writeOff': setWriteOffPopup(payload); break; // NEW CASE
            default: console.warn('Unknown action type:', actionType);
        }
    };

    const handleGenerateReport = async () => {
        setIsGeneratingReport(true);
        const filters = { status: filter, searchTerm, startDate, endDate };
        const result = await generateCustomerDepositReportPDF(filters);
        if (!result.success) alert(result.message);
        setIsGeneratingReport(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px] bg-white rounded-2xl shadow-lg">
                <div className="text-center">
                    <FaSpinner className="animate-spin text-blue-600 h-12 w-12 mx-auto mb-4" />
                    <p className="text-lg font-semibold text-gray-700">Loading customer deposits...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white shadow-2xl rounded-2xl overflow-hidden p-6 max-w-full mx-auto">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-4">
                <h2 className="text-2xl font-bold text-gray-800">Customer Deposits</h2>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">From:</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">To:</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                    </div>

                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg" />
                    </div>

                    <select value={filter} onChange={(e) => setFilter(e.target.value)} className="p-2 border rounded-lg">
                        <option value="all">All Statuses</option>
                        <option value="instalment_due">Instalment Due</option>
                        <option value="final_settlement">Final Settlement Due</option>
                        <option value="customer_owes">Customer Owes (Cancelled)</option>
                        <option value="refund_pending">Refund/Credit Pending</option>
                        <option value="completed_settled">Completed / Settled</option>
                    </select>

                    <button onClick={handleGenerateReport} disabled={isGeneratingReport} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors">
                        {isGeneratingReport ? <FaSpinner className="animate-spin h-4 w-4" /> : <FaDownload />}
                        <span>{isGeneratingReport ? 'Generating...' : 'Download Report'}</span>
                    </button>
                </div>
            </div>

            {filteredBookings.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Folder No</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">PC Date</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Ref No</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Passenger</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Agent</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Payment Method</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Revenue (£)</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Initial Deposit (£)</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Total Paid (£)</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">Balance (£)</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-700 w-[150px]">Action / Outcome</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredBookings.map((booking) => {
                                const isCancelled = booking.bookingStatus === 'CANCELLED';
                                const balance = parseFloat(booking.balance);

                                const creditPayment = (booking.initialPayments || []).find(
                                    p => p.transactionMethod === 'CUSTOMER_CREDIT_NOTE' && p.appliedCustomerCreditNoteUsage
                                );
                                const creditRefNo = creditPayment?.appliedCustomerCreditNoteUsage?.creditNote?.generatedFromCancellation?.originalBooking?.refNo;

                                return (
                                    <tr key={booking.id} className={`${isCancelled ? 'bg-gray-50' : 'hover:bg-blue-50/50'} transition-colors duration-150 cursor-pointer`} onClick={() => setHistoryPopupBooking(booking)} >
                                        <td className={`py-3 px-3 text-sm font-semibold ${isCancelled ? 'text-gray-400' : 'text-blue-600'}`}>{booking.folderNo}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'}`}>{formatDate(booking.pcDate)}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'}`}>{booking.refNo}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'}`}>{booking.paxName}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'}`}>{booking.agentName}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'} whitespace-nowrap`}>
                                            {creditRefNo ? (
                                                <div className="flex flex-col">
                                                    <span>{booking.paymentMethod}</span>
                                                    <span className="text-xs text-blue-600" title={`Paid via credit from ${creditRefNo.trim()}`}>
                                                        (Credit: {creditRefNo.trim()})
                                                    </span>
                                                </div>
                                            ) : (
                                                booking.paymentMethod
                                            )}
                                        </td>
                                        <td className={`py-3 px-3 text-sm font-medium ${isCancelled ? 'text-gray-500' : 'text-gray-800'}`}>{parseFloat(booking.revenue).toFixed(2)}</td>
                                        <td className={`py-3 px-3 text-sm ${isCancelled ? 'text-gray-500' : 'text-gray-600'}`}>{parseFloat(booking.initialDeposit || 0).toFixed(2)}</td>
                                        <td className={`py-3 px-3 text-sm font-medium ${isCancelled ? 'text-gray-500' : 'text-gray-800'}`}>{parseFloat(booking.received || 0).toFixed(2)}</td>
                                        <td className={`py-3 px-3 text-sm font-bold ${isCancelled ? 'text-gray-500' : (balance > 0 ? 'text-red-600' : (balance < 0 ? 'text-blue-600' : 'text-green-600'))}`}>
                                            {balance.toFixed(2)}
                                            {balance < 0 && !isCancelled && (<span className="block text-xs font-normal">(Overpaid)</span>)}
                                        </td>
                                        <td className="py-3 px-3 text-sm w-[150px]" onClick={e => e.stopPropagation()}>
                                            <ActionCell booking={booking} onAction={handleAction} expanded={expandedRows[booking.id]} onToggleExpand={() => toggleExpand(booking.id)} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-16">
                    <p className="text-gray-500">No bookings match your current filter.</p>
                </div>
            )}

            {/* POPUPS */}
            {paymentPopup && (<InstalmentPaymentPopup {...paymentPopup} onClose={() => setPaymentPopup(null)} onSubmit={handleSavePayment} />)}
            {settlementPopup && (<FinalSettlementPopup booking={settlementPopup} onClose={() => setSettlementPopup(null)} onSubmit={handleSaveSettlement} />)}
            {historyPopupBooking && (<PaymentHistoryPopup booking={historyPopupBooking} onClose={() => setHistoryPopupBooking(null)} />)}
            {customerPayablePopup && ( <SettleCustomerPayablePopup payable={customerPayablePopup.payable} booking={customerPayablePopup.booking} onClose={() => setCustomerPayablePopup(null)} onSubmit={handleActionCompletion} /> )}
            {recordRefundPopup && ( <RecordRefundPopup cancellation={recordRefundPopup.cancellation} booking={recordRefundPopup.booking} onClose={() => setRecordRefundPopup(null)} onSubmit={handleActionCompletion} /> )}
            
            {/* NEW WRITE OFF POPUP */}
            {writeOffPopup && (
                <WriteOffBalancePopup 
                    booking={writeOffPopup} 
                    onClose={() => setWriteOffPopup(null)} 
                    onSubmit={handleActionCompletion} 
                />
            )}
        </div>
    );
}