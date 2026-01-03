import React, { useState } from 'react';
import { FaEraser, FaTimes, FaExclamationTriangle } from 'react-icons/fa';
import { writeOffBookingBalance } from '../api/api'; // Ensure this matches your API helper

export default function WriteOffBalancePopup({ booking, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const currentBalance = parseFloat(booking.balance || 0);
    const isOverpaid = currentBalance < 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason.trim()) {
            setError('Please provide a reason for this adjustment.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            await writeOffBookingBalance(booking.id, { reason });
            onSubmit(); // Refresh data in parent
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to process write-off.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                        <FaEraser className="mr-3 text-orange-500" />
                        Clear Balance
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <FaTimes size={24} />
                    </button>
                </div>

                <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-6">
                    <div className="flex">
                        <FaExclamationTriangle className="text-orange-400 mt-1 mr-3" />
                        <div>
                            <p className="text-sm text-orange-800 font-bold uppercase">Financial Adjustment</p>
                            <p className="text-sm text-orange-700">
                                This will force the balance for <strong>{booking.refNo}</strong> to £0.00. 
                                This action will be recorded in the amendment logs.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="text-center mb-6">
                    <p className="text-sm text-gray-500 uppercase font-semibold">Current Balance</p>
                    <p className={`text-3xl font-bold ${isOverpaid ? 'text-blue-600' : 'text-red-600'}`}>
                        £{Math.abs(currentBalance).toFixed(2)}
                        <span className="text-sm ml-1">{isOverpaid ? '(Overpaid)' : '(Owed)'}</span>
                    </p>
                </div>

                {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Reason for Adjustment
                        </label>
                        <select 
                            value={reason} 
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full p-2 border rounded-md bg-white mb-2"
                            required
                        >
                            <option value="">-- Select a reason --</option>
                            <option value="Rounding Error">Rounding Error (Small balance)</option>
                            <option value="Management Approved Discount">Management Approved Discount</option>
                            <option value="Currency Exchange Fluctuation">Currency Exchange Fluctuation</option>
                            <option value="Bad Debt Write-off">Bad Debt Write-off</option>
                            <option value="Goodwill Adjustment">Goodwill Adjustment</option>
                        </select>
                        <textarea
                            placeholder="Add extra details here..."
                            className="w-full p-2 border rounded-md text-sm"
                            rows="2"
                            onChange={(e) => {
                                if (!reason.includes(':')) setReason(prev => `${prev}: ${e.target.value}`)
                            }}
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg font-semibold hover:bg-gray-100">
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting} 
                            className={`px-5 py-2 rounded-lg text-white font-semibold flex items-center gap-2 ${
                                isSubmitting ? 'bg-gray-400' : 'bg-orange-600 hover:bg-orange-700'
                            }`}
                        >
                            {isSubmitting ? 'Processing...' : 'Confirm Write-Off'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}