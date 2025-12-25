import { useState, useEffect } from 'react';
import { validatePassengerForm, sanitizeInput } from '../utils/validation';

export default function PaxDetailsPopup({ initialData, onClose, onSubmit }) {
  const [numPax, setNumPax] = useState(initialData.numPax || 1);
  const [passenger, setPassenger] = useState({
    title: initialData.passenger?.title || '',
    firstName: initialData.passenger?.firstName || '',
    middleName: initialData.passenger?.middleName || '',
    lastName: initialData.passenger?.lastName || '',
    gender: initialData.passenger?.gender || '',
    email: initialData.passenger?.email || '',
    contactNo: initialData.passenger?.contactNo || '',
    nationality: initialData.passenger?.nationality || '',
    birthday: initialData.passenger?.birthday || '',
    category: initialData.passenger?.category || '',
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isValid, setIsValid] = useState(false);
  const [touchedFields, setTouchedFields] = useState({});

  // Validate passenger data using our validation utility
  useEffect(() => {
    const validation = validatePassengerForm(passenger);
    setIsValid(validation.isValid);
    // Show errors only for touched fields
    const newFieldErrors = {};
    for (const field of Object.keys(touchedFields)) {
      if (validation.errors[field]) {
        newFieldErrors[field] = validation.errors[field];
      }
    }
    setFieldErrors(newFieldErrors);
    setErrorMessage(validation.isValid ? '' : '');
  }, [passenger, touchedFields]);

  const handleChange = (field, value) => {
    // Sanitize text inputs
    const textFields = ['firstName', 'middleName', 'lastName', 'nationality'];
    const sanitizedValue = textFields.includes(field) ? sanitizeInput(value) : value;
    setPassenger((prev) => ({ ...prev, [field]: sanitizedValue }));
    // Mark field as touched to show validation errors
    setTouchedFields(prev => ({ ...prev, [field]: true }));
  };

  const handleNumPaxChange = (e) => {
    const value = parseInt(e.target.value);
    if (value >= 1 && value <= 10) {
      setNumPax(value);
    }
  };

  const handleSubmit = () => {
    // Run validation
    const validation = validatePassengerForm(passenger);
    
    if (!validation.isValid) {
      // Mark all fields as touched to show all errors
      setTouchedFields({
        title: true, firstName: true, lastName: true, gender: true,
        category: true, birthday: true, email: true, contactNo: true
      });
      setFieldErrors(validation.errors);
      setErrorMessage('Please fix the validation errors before submitting.');
      return;
    }

    const paxName = `${passenger.title}. ${passenger.lastName}/${passenger.middleName ? passenger.middleName + ' ' : ''}${passenger.firstName}`;
    onSubmit({ passenger, paxName, numPax });
  };

  const handleCancel = () => {
    setPassenger({
      title: '',
      firstName: '',
      middleName: '',
      lastName: '',
      gender: '',
      email: '',
      contactNo: '',
      nationality: '',
      birthday: '',
      category: '',
    });
    setNumPax(1);
    setFieldErrors({});
    setTouchedFields({});
    onClose();
  };

  return (
    // CHANGED: Using bg-black/50 for 50% opacity. This is more reliable.
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      
      {/* This inner div is the white popup card */}
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4 text-center text-gray-800 sticky top-0 bg-white pb-2">Lead Passenger Details</h3>

        <div className="mb-4">
          <label className="block text-gray-700 mb-1">Number of Passengers*</label>
          <select
            value={numPax}
            onChange={handleNumPaxChange}
            className="w-full p-2 bg-gray-100 border rounded-lg"
            required
          >
            {[...Array(10).keys()].map((i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>

        {errorMessage && (
          <div className="mb-4 p-2 bg-red-100 text-red-600 rounded-lg">{errorMessage}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-700 mb-1">Title*</label>
            <select
              value={passenger.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.title ? 'border-red-500' : ''}`}
              required
            >
              <option value="">Select Title</option>
              <option value="MR">Mr</option>
              <option value="MRS">Mrs</option>
              <option value="MS">Ms</option>
              <option value="MASTER">Master</option>
            </select>
            {fieldErrors.title && <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">First Name*</label>
            <input
              type="text"
              value={passenger.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.firstName ? 'border-red-500' : ''}`}
              required
            />
            {fieldErrors.firstName && <p className="mt-1 text-sm text-red-600">{fieldErrors.firstName}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Middle Name</label>
            <input
              type="text"
              value={passenger.middleName}
              onChange={(e) => handleChange('middleName', e.target.value)}
              className="w-full p-2 bg-gray-100 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Last Name*</label>
            <input
              type="text"
              value={passenger.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.lastName ? 'border-red-500' : ''}`}
              required
            />
            {fieldErrors.lastName && <p className="mt-1 text-sm text-red-600">{fieldErrors.lastName}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Gender*</label>
            <select
              value={passenger.gender}
              onChange={(e) => handleChange('gender', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.gender ? 'border-red-500' : ''}`}
              required
            >
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            {fieldErrors.gender && <p className="mt-1 text-sm text-red-600">{fieldErrors.gender}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Category*</label>
            <select
              value={passenger.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.category ? 'border-red-500' : ''}`}
              required
            >
              <option value="">Select Category</option>
              <option value="ADULT">Adult</option>
              <option value="CHILD">Child</option>
              <option value="INFANT">Infant</option>
            </select>
            {fieldErrors.category && <p className="mt-1 text-sm text-red-600">{fieldErrors.category}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Birthday*</label>
            <input
              type="date"
              value={passenger.birthday}
              onChange={(e) => handleChange('birthday', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.birthday ? 'border-red-500' : ''}`}
              required
            />
            {fieldErrors.birthday && <p className="mt-1 text-sm text-red-600">{fieldErrors.birthday}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={passenger.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.email ? 'border-red-500' : ''}`}
            />
            {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Contact Number</label>
            <input
              type="text"
              value={passenger.contactNo}
              onChange={(e) => handleChange('contactNo', e.target.value)}
              className={`w-full p-2 bg-gray-100 border rounded-lg ${fieldErrors.contactNo ? 'border-red-500' : ''}`}
              placeholder="+1234567890"
            />
            {fieldErrors.contactNo && <p className="mt-1 text-sm text-red-600">{fieldErrors.contactNo}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 mb-1">Nationality</label>
            <input
              type="text"
              value={passenger.nationality}
              onChange={(e) => handleChange('nationality', e.target.value)}
              className="w-full p-2 bg-gray-100 border rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className={`px-4 py-2 rounded-lg text-white ${
              isValid ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}