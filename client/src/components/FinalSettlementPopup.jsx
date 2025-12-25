import { useState } from 'react';
import { validatePositiveNumber, validateDate, validateSelect } from '../utils/validation';

export default function FinalSettlementPopup({ booking, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    amount: '',
    transactionMethod: 'LOYDS', // <-- Default to LOYDS
    paymentDate: new Date().toISOString().split('T')[0],
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- UPDATED TRANSACTION METHODS ---
  const transactionMethods = ['LOYDS', 'STRIPE', 'WISE', 'HUMM', 'CREDIT_NOTES', 'CREDIT'];

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Validate amount field - only allow valid decimal numbers
    if (name === 'amount') {
      if (value !== '' && !/^\d*\.?\d{0,2}$/.test(value)) {
        return;
      }
    }
    
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear field error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    
    // Client-side validation
    const errors = {};
    
    const amountResult = validatePositiveNumber(formData.amount, 'Payment Amount');
    if (!amountResult.isValid) errors.amount = amountResult.message;
    
    const methodResult = validateSelect(formData.transactionMethod, 'Transaction Method');
    if (!methodResult.isValid) errors.transactionMethod = methodResult.message;
    
    const dateResult = validateDate(formData.paymentDate, 'Payment Date');
    if (!dateResult.isValid) errors.paymentDate = dateResult.message;
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    
    setIsSubmitting(true);
    try {
      // This now calls the new 'handleSaveSettlement' function
      await onSubmit(booking.id, formData); 
      onClose();
    } catch (err) {
      console.error('Settlement error:', err);
      setError(err.message || 'Failed to save payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // CHANGED: Using bg-black/50 and added backdrop-blur-sm
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Record Final Settlement</h3>
        <p className="text-sm text-gray-600 mb-4">
          For Booking: <span className="font-medium">{booking.refNo}</span>.
          Final Balance Due: <span className="font-bold text-red-600">£{parseFloat(booking.balance).toFixed(2)}</span>
        </p>

        {error && <div className="mb-4 p-2 bg-red-100 text-red-600 rounded">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Amount (£)</label>
            <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleChange} className={`w-full p-2 border rounded bg-gray-50 ${fieldErrors.amount ? 'border-red-500' : ''}`} placeholder="Enter amount paid" required />
            {fieldErrors.amount && <p className="mt-1 text-sm text-red-600">{fieldErrors.amount}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Transaction Method</label>
            <select name="transactionMethod" value={formData.transactionMethod} onChange={handleChange} className={`w-full p-2 border rounded bg-gray-50 ${fieldErrors.transactionMethod ? 'border-red-500' : ''}`} required>
              {transactionMethods.map((method) => (
                <option key={method} value={method}>{method.replace('_', ' ')}</option>
              ))}
            </select>
            {fieldErrors.transactionMethod && <p className="mt-1 text-sm text-red-600">{fieldErrors.transactionMethod}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Date</label>
            <input type="date" name="paymentDate" value={formData.paymentDate} onChange={handleChange} className={`w-full p-2 border rounded bg-gray-50 ${fieldErrors.paymentDate ? 'border-red-500' : ''}`} required />
            {fieldErrors.paymentDate && <p className="mt-1 text-sm text-red-600">{fieldErrors.paymentDate}</p>}
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={isSubmitting} className={`px-4 py-2 rounded text-white ${isSubmitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {isSubmitting ? 'Saving...' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}