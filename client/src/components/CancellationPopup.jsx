import { useState } from 'react';
import { validateCancellationForm } from '../utils/validation';

export default function CancellationPopup({ booking, onClose, onConfirm }) {
  const [supplierCancellationFee, setSupplierCancellationFee] = useState('');
  const [adminFee, setAdminFee] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
 
  const handleFeeChange = (field, value) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      if (field === 'supplierCancellationFee') {
        setSupplierCancellationFee(value);
      } else if (field === 'adminFee') {
        setAdminFee(value);
      }
      // Clear field error when user starts typing
      if (fieldErrors[field]) {
        setFieldErrors(prev => ({ ...prev, [field]: '' }));
      }
    }
  };

  const handleSubmit = async () => {
    // Validate using our validation utility
    const validation = validateCancellationForm({
      supplierCancellationFee,
      adminFee
    });
    
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    const supFeeNum = parseFloat(supplierCancellationFee);
    const adminFeeNum = parseFloat(adminFee);

    setIsSubmitting(true);
    setError('');
    setFieldErrors({});
    
    try {
      await onConfirm({
        supplierCancellationFee: supFeeNum,
        adminFee: adminFeeNum,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred during cancellation processing.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl animate-slide-up">
        <h3 className="text-lg font-bold text-red-600">Cancel Booking</h3>
        <p className="text-sm text-gray-600 mb-4">Ref: {booking.refNo} | Pax: {booking.paxName}</p>
        
        {error && <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Supplier Cancellation Fee (£)*</label>
            <input 
              type="number" 
              step="0.01" 
              min="0" 
              value={supplierCancellationFee} 
              onChange={e => handleFeeChange('supplierCancellationFee', e.target.value)} 
              className={`w-full p-2 border rounded bg-gray-50 focus:bg-white ${fieldErrors.supplierCancellationFee ? 'border-red-500' : ''}`} 
              placeholder="e.g., 500" 
              required 
            />
            {fieldErrors.supplierCancellationFee && <p className="mt-1 text-sm text-red-600">{fieldErrors.supplierCancellationFee}</p>}
            <p className="text-xs text-gray-500 mt-1">The non-refundable amount kept by the supplier.</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium">Consultant Fee (£)*</label>
            <input 
              type="number" 
              step="0.01" 
              min="0" 
              value={adminFee} 
              onChange={e => handleFeeChange('adminFee', e.target.value)} 
              className={`w-full p-2 border rounded bg-gray-50 focus:bg-white ${fieldErrors.adminFee ? 'border-red-500' : ''}`} 
              placeholder="e.g., 50" 
              required 
            />
            {fieldErrors.adminFee && <p className="mt-1 text-sm text-red-600">{fieldErrors.adminFee}</p>}
            <p className="text-xs text-gray-500 mt-1">Your company's fee for this cancellation.</p>
          </div>

          {/* REMOVED: Conditional refund display and credit note checkbox section */}
          
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100">Back</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 rounded text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400">
            {isSubmitting ? 'Processing...' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
}