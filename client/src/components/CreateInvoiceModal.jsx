import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { validatePositiveNumber, validateDate } from '../utils/validation';

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

export default function CreateInvoiceModal({ record, onClose, onSave }) {
    const today = new Date().toISOString().split('T')[0];
    const [amount, setAmount] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(today);
    const [commissionAmount, setCommissionAmount] = useState('');
    const [commissionMonth, setCommissionMonth] = useState(getCurrentMonth());
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    const isFirstInvoice = record.commissionAmount === null || record.commissionAmount === undefined;

    const handleAmountChange = (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
            setAmount(value);
            if (fieldErrors.amount) setFieldErrors(prev => ({ ...prev, amount: '' }));
        }
    };

    const handleCommissionAmountChange = (e) => {
        const value = e.target.value;
        if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
            setCommissionAmount(value);
            if (fieldErrors.commissionAmount) setFieldErrors(prev => ({ ...prev, commissionAmount: '' }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});

        const errors = {};
        const invoiceAmount = parseFloat(amount);
        const totalCommission = isFirstInvoice ? parseFloat(commissionAmount) : record.commissionAmount;

        // Validate commission amount for first invoice
        if (isFirstInvoice) {
            const commissionResult = validatePositiveNumber(commissionAmount, 'Total Commission Amount');
            if (!commissionResult.isValid) errors.commissionAmount = commissionResult.message;
        }

        // Validate installment amount
        const amountResult = validatePositiveNumber(amount, 'Installment Amount');
        if (!amountResult.isValid) errors.amount = amountResult.message;

        // Validate invoice date
        const dateResult = validateDate(invoiceDate, 'Payment Date');
        if (!dateResult.isValid) errors.invoiceDate = dateResult.message;

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        if (isFirstInvoice && (isNaN(totalCommission) || totalCommission <= 0)) {
            setError('Please set a valid, positive Total Commission Amount.');
            return;
        }
        if (isNaN(invoiceAmount) || invoiceAmount <= 0) {
            setError('Please enter a valid, positive Installment Amount.');
            return;
        }

        const remainingOnRecord = (record.commissionAmount || 0) - (record.totalInvoiced || 0);

        if (!isFirstInvoice && invoiceAmount > remainingOnRecord) {
            setError(`Amount cannot exceed the remaining commission of £${remainingOnRecord.toFixed(2)}.`);
            return;
        }
        if (isFirstInvoice && invoiceAmount > totalCommission) {
            setError('The first installment cannot be greater than the Total Commission Amount.');
            return;
        }

        const invoicePayload = {
            recordId: record.id,
            recordType: record.recordType,
            amount: parseFloat(amount),
            invoiceDate: invoiceDate,
            commissionMonth: commissionMonth, 
        };
        if (isFirstInvoice) {
            invoicePayload.commissionAmount = totalCommission;
        }
        onSave(invoicePayload);
    };

    const remainingCommission = isFirstInvoice ?
        (parseFloat(commissionAmount) || 0) :
        (record.commissionAmount || 0) - record.totalInvoiced;

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md animate-slide-up">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold">Invoice for: {record.folderNo}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200"><FaTimes /></button>
                </div>
                {!isFirstInvoice && (
                    <div className="text-sm text-slate-600 mb-4 p-3 bg-slate-50 rounded-md">
                        <p>Total Commission: <span className="font-semibold">£{record.commissionAmount?.toFixed(2)}</span></p>
                        <p>Already Invoiced: <span className="font-semibold">£{record.totalInvoiced?.toFixed(2)}</span></p>
                        <p>Remaining: <span className="font-bold text-blue-600">£{remainingCommission.toFixed(2)}</span></p>
                    </div>
                )}
                {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded-md">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {isFirstInvoice && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Set Total Commission Amount (£)</label>
                            <input type="number" step="0.01" value={commissionAmount}
                                onChange={handleCommissionAmountChange} required
                                className={`mt-1 block w-full px-3 py-2 border rounded-md ${fieldErrors.commissionAmount ? 'border-red-500' : 'border-slate-300'}`} />
                            {fieldErrors.commissionAmount && <p className="mt-1 text-sm text-red-600">{fieldErrors.commissionAmount}</p>}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Installment Amount (£)</label>
                        <input type="number" step="0.01" value={amount}
                            onChange={handleAmountChange} required
                            className={`mt-1 block w-full px-3 py-2 border rounded-md ${fieldErrors.amount ? 'border-red-500' : 'border-slate-300'}`} />
                        {fieldErrors.amount && <p className="mt-1 text-sm text-red-600">{fieldErrors.amount}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Commission Month</label>
                        <input type="month" value={commissionMonth} onChange={(e) => setCommissionMonth(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Payment Date</label>
                        <input type="date" value={invoiceDate}
                            onChange={(e) => {
                                setInvoiceDate(e.target.value);
                                if (fieldErrors.invoiceDate) setFieldErrors(prev => ({ ...prev, invoiceDate: '' }));
                            }} required
                            className={`mt-1 block w-full px-3 py-2 border rounded-md ${fieldErrors.invoiceDate ? 'border-red-500' : 'border-slate-300'}`} />
                        {fieldErrors.invoiceDate && <p className="mt-1 text-sm text-red-600">{fieldErrors.invoiceDate}</p>}
                    </div>
                    <div className="flex justify-end space-x-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md">Cancel</button>
                        <button type="submit" className="px-4 py-2 text-white bg-blue-600 rounded-md">Submit & Generate Receipt</button>
                    </div>
                </form>
            </div>
        </div>
    );
}