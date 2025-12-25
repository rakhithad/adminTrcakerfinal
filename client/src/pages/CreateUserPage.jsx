import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserPlus, FaSpinner, FaLock, FaUser, FaBriefcase } from 'react-icons/fa';
import { createUser } from '../api/api';
import { validateUserForm, sanitizeInput } from '../utils/validation';

// --- STYLED Reusable Form Components ---
const FormInput = ({ label, name, error, ...rest }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input 
      id={name} 
      name={name} 
      {...rest}
      className={`w-full px-4 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 ${
        error ? 'border-red-500' : 'border-gray-300'
      }`}
      style={{'--tw-ring-color': error ? '#EF4444' : '#0A738A'}}
    />
    {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
  </div>
);

const FormSelect = ({ label, name, error, children, ...rest }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select 
      id={name} 
      name={name} 
      {...rest}
      className={`w-full px-4 py-2 border rounded-lg shadow-sm bg-white focus:outline-none focus:ring-2 ${
        error ? 'border-red-500' : 'border-gray-300'
      }`}
      style={{'--tw-ring-color': error ? '#EF4444' : '#0A738A'}}
    >
      {children}
    </select>
    {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
  </div>
);

export default function CreateUserPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    title: 'MR',
    contactNo: '',
    role: 'CONSULTANT',
    team: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Sanitize text inputs
    const sanitizedValue = ['email', 'firstName', 'lastName', 'contactNo'].includes(name) 
      ? sanitizeInput(value) 
      : value;
    setFormData(prev => ({ ...prev, [name]: sanitizedValue }));
    // Clear field error when user starts typing
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    
    // Validate form
    const validation = validateUserForm(formData);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    
    try {
      await createUser(formData);
      navigate('/user-management', { 
        state: { success: `User "${formData.firstName} ${formData.lastName}" created successfully!` } 
      });
    } catch (err) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8" style={{ backgroundColor: '#F9FAFB', minHeight: '100vh' }}>
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-4xl mx-auto">
        
        <h3 className="text-3xl font-bold mb-6 flex items-center" style={{color: '#2D3E50'}}>
          <FaUserPlus className="mr-3" style={{color: '#0A738A'}} /> Create New User
        </h3>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && <div className="p-4 bg-red-100 text-red-800 rounded-lg">{error}</div>}

          {/* --- Section 1: Login --- */}
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <FaLock style={{color: '#0A738A'}} /> Login Credentials
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormInput 
                label="Email Address" 
                name="email" 
                type="email" 
                value={formData.email} 
                onChange={handleChange} 
                error={fieldErrors.email}
                required 
              />
              <div>
                <FormInput 
                  label="Password" 
                  name="password" 
                  type="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                  error={fieldErrors.password}
                  required 
                />
                <p className="mt-1 text-xs text-gray-500">
                  Min 8 characters, with uppercase, lowercase, and number
                </p>
              </div>
            </div>
          </fieldset>

          {/* --- Section 2: Personal --- */}
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <FaUser style={{color: '#0A738A'}} /> Personal Details
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormSelect 
                label="Title" 
                name="title" 
                value={formData.title} 
                onChange={handleChange}
                error={fieldErrors.title}
              >
                <option value="MR">Mr</option>
                <option value="MRS">Mrs</option>
                <option value="MS">Ms</option>
                <option value="MASTER">Master</option>
              </FormSelect>
              <FormInput 
                label="First Name" 
                name="firstName" 
                value={formData.firstName} 
                onChange={handleChange} 
                error={fieldErrors.firstName}
                required 
              />
              <FormInput 
                label="Last Name" 
                name="lastName" 
                value={formData.lastName} 
                onChange={handleChange} 
                error={fieldErrors.lastName}
                required 
              />
            </div>
            <FormInput 
              label="Contact No" 
              name="contactNo" 
              value={formData.contactNo} 
              onChange={handleChange} 
              error={fieldErrors.contactNo}
              placeholder="+44 7123 456789"
            />
          </fieldset>

          {/* --- Section 3: Role --- */}
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <FaBriefcase style={{color: '#0A738A'}} /> Team & Role
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormSelect 
                label="Role" 
                name="role" 
                value={formData.role} 
                onChange={handleChange} 
                error={fieldErrors.role}
                required
              >
                <option value="CONSULTANT">Consultant</option>
                <option value="MANAGEMENT">Management</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </FormSelect>
              <FormSelect 
                label="Team" 
                name="team" 
                value={formData.team} 
                onChange={handleChange}
                error={fieldErrors.team}
              >
                <option value="">No Team</option>
                <option value="PH">PH</option>
                <option value="TOURS">TOURS</option>
                <option value="MARKETING">Marketing</option>
                <option value="QC">QC</option>
                <option value="IT">IT</option>
              </FormSelect>
            </div>
          </fieldset>
          
          {/* --- Actions --- */}
          <div className="flex justify-end space-x-4 pt-6 border-t mt-6">
            <button 
              type="button" 
              onClick={() => navigate('/user-management')} 
              className="px-5 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSaving} 
              className="px-5 py-2.5 text-white font-semibold rounded-lg shadow-md disabled:bg-opacity-50 flex items-center transition-colors"
              style={{ backgroundColor: '#0A738A' }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = '#085f73'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = '#0A738A'}
            >
              {isSaving && <FaSpinner className="animate-spin mr-2" />}
              {isSaving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}