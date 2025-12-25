import React, { useState, useEffect } from 'react';
import { getMyProfile, updateMyProfile } from '../api/api';
import { FaUserCircle, FaSpinner, FaSave, FaPencilAlt } from 'react-icons/fa';
import { validateProfileForm, sanitizeInput } from '../utils/validation';

// --- STYLED Reusable Form Components ---
const ProfileInput = ({ label, error, ...props }) => (
    <div>
        <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-600">
            {label}
        </label>
        <input
            {...props}
            className={`mt-1 w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed transition ${
                error ? 'border-red-500' : 'border-gray-300'
            }`}
            style={{'--tw-ring-color': error ? '#EF4444' : '#0A738A'}}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
);

const ProfileSelect = ({ label, error, children, ...props }) => (
    <div>
        <label htmlFor={props.id || props.name} className="block text-sm font-medium text-gray-600">
            {label}
        </label>
        <select
            {...props}
            className={`mt-1 w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:cursor-not-allowed transition bg-white ${
                error ? 'border-red-500' : 'border-gray-300'
            }`}
            style={{'--tw-ring-color': error ? '#EF4444' : '#0A738A'}}
        >
            {children}
        </select>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
);


export default function ProfilePage() {
    const [profile, setProfile] = useState(null);
    const [originalProfile, setOriginalProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await getMyProfile();
                setProfile(response.data);
                setOriginalProfile(response.data);
            } catch (err) {
                setError(err.message || 'Failed to load your profile. Please try refreshing the page.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        // Sanitize text inputs
        const sanitizedValue = ['firstName', 'lastName', 'contactNo'].includes(name) 
            ? sanitizeInput(value) 
            : value;
        setProfile(prev => ({ ...prev, [name]: sanitizedValue }));
        // Clear field error when user starts typing
        if (fieldErrors[name]) {
            setFieldErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setFieldErrors({});
        
        // Validate form
        const validation = validateProfileForm(profile);
        if (!validation.isValid) {
            setFieldErrors(validation.errors);
            return;
        }

        setIsSaving(true);
        try {
            const updateData = {
                title: profile.title,
                firstName: profile.firstName,
                lastName: profile.lastName,
                contactNo: profile.contactNo,
            };
            
            const response = await updateMyProfile(updateData);
            const updatedProfileData = response.data.data || response.data;

            setProfile(updatedProfileData);
            setOriginalProfile(updatedProfileData);
            setIsEditing(false);
            setSuccess('Profile updated successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'Failed to save profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleCancelEdit = () => {
        setProfile(originalProfile);
        setIsEditing(false);
        setError('');
        setSuccess('');
        setFieldErrors({});
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <FaSpinner className="animate-spin h-10 w-10" style={{color: '#0A738A'}} />
            </div>
        );
    }
    
    if (!profile) {
        return (
            <div className="text-center p-10">
                <p className="text-red-500">{error || "Could not load profile data."}</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8" style={{ backgroundColor: '#F9FAFB', minHeight: '100vh' }}>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="p-6 sm:p-8">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6">
                            <div className="h-28 w-28 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                                <FaUserCircle className="h-24 w-24 text-gray-400" />
                            </div>
                            
                            <div className="flex-grow text-center sm:text-left">
                                <h1 className="text-4xl font-bold" style={{color: '#2D3E50'}}>
                                    {profile.firstName} {profile.lastName}
                                </h1>
                                <p className="text-lg text-gray-500 mt-1">{profile.email}</p>
                                <div className="mt-3 flex justify-center sm:justify-start space-x-2">
                                    <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-semibold rounded-full">{profile.role}</span>
                                    {profile.team && <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">{profile.team}</span>}
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSave} className="mt-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <ProfileInput 
                                    label="First Name" 
                                    name="firstName" 
                                    value={profile.firstName || ''} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    error={fieldErrors.firstName}
                                    required 
                                />
                                <ProfileInput 
                                    label="Last Name" 
                                    name="lastName" 
                                    value={profile.lastName || ''} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    error={fieldErrors.lastName}
                                    required 
                                />
                                <ProfileInput 
                                    label="Contact No" 
                                    name="contactNo" 
                                    placeholder="e.g., +447123456789" 
                                    value={profile.contactNo || ''} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing} 
                                    error={fieldErrors.contactNo}
                                />
                                <ProfileSelect 
                                    label="Title" 
                                    name="title" 
                                    value={profile.title || ''} 
                                    onChange={handleInputChange} 
                                    disabled={!isEditing}
                                    error={fieldErrors.title}
                                >
                                    <option value="">-- Not Specified --</option>
                                    <option value="MR">Mr</option>
                                    <option value="MRS">Mrs</option>
                                    <option value="MS">Ms</option>
                                    <option value="MASTER">Master</option>
                                </ProfileSelect>
                            </div>

                            {success && <p className="text-green-600 mt-6 text-center font-semibold">{success}</p>}
                            {error && <p className="text-red-600 mt-6 text-center font-semibold">{error}</p>}
                            
                            <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end space-x-3">
                                {isEditing ? (
                                    <>
                                        <button type="button" onClick={handleCancelEdit} className="px-5 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">
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
                                            {isSaving ? <FaSpinner className="animate-spin -ml-1 mr-3 h-5 w-5" /> : <FaSave className="-ml-1 mr-3 h-5 w-5" />}
                                            {isSaving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </>
                                ) : (
                                    <button 
                                      type="button" 
                                      onClick={() => setIsEditing(true)} 
                                      className="px-5 py-2.5 text-white font-semibold rounded-lg shadow-md flex items-center transition-colors"
                                      style={{ backgroundColor: '#0A738A' }}
                                      onMouseOver={e => e.currentTarget.style.backgroundColor = '#085f73'}
                                      onMouseOut={e => e.currentTarget.style.backgroundColor = '#0A738A'}
                                    >
                                        <FaPencilAlt className="-ml-1 mr-3 h-4 w-4" />
                                        Edit Profile
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}