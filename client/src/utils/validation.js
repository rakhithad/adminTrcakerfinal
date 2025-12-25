/**
 * Client-side Validation Utilities
 * Centralized validation functions for forms across the application
 */

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone number regex - allows international format
const PHONE_REGEX = /^[\d\s\-+()]{10,20}$/;

// Password requirements regex - at least 8 chars, 1 uppercase, 1 lowercase, 1 number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// PNR regex - alphanumeric, 6 characters typically
const PNR_REGEX = /^[A-Za-z0-9]{0,50}$/;

// Reference number regex - alphanumeric with optional dashes/underscores
const REF_NO_REGEX = /^[A-Za-z0-9\-_]{0,30}$/;

// Airline code regex - 2-3 letter airline code or full name
const AIRLINE_REGEX = /^[A-Za-z0-9\s\-]{1,50}$/;

// Route regex - allows formats like LHR-DXB, London to Dubai, etc.
const ROUTE_REGEX = /^[A-Za-z0-9\s\-/,()]+$/;

// Name regex - letters (including Unicode), spaces, hyphens, apostrophes, periods
// Allows international characters like accented letters (á, é, ñ, ü, ö, etc.)
const NAME_REGEX = /^[\p{L}\s\-'.]+$/u;

/**
 * Validation result object
 */
const createResult = (isValid, message = '') => ({
  isValid,
  message
});

/**
 * Validate email address
 */
export const validateEmail = (email) => {
  if (!email || !email.trim()) {
    return createResult(false, 'Email is required');
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return createResult(false, 'Please enter a valid email address');
  }
  return createResult(true);
};

/**
 * Validate password strength
 */
export const validatePassword = (password) => {
  if (!password) {
    return createResult(false, 'Password is required');
  }
  if (password.length < 8) {
    return createResult(false, 'Password must be at least 8 characters');
  }
  if (!PASSWORD_REGEX.test(password)) {
    return createResult(false, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');
  }
  return createResult(true);
};

/**
 * Validate required field
 */
export const validateRequired = (value, fieldName = 'This field') => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return createResult(false, `${fieldName} is required`);
  }
  return createResult(true);
};

/**
 * Validate name (first name, last name, etc.)
 */
export const validateName = (name, fieldName = 'Name') => {
  if (!name || !name.trim()) {
    return createResult(false, `${fieldName} is required`);
  }
  if (name.trim().length > 50) {
    return createResult(false, `${fieldName} cannot exceed 50 characters`);
  }
  if (!NAME_REGEX.test(name.trim())) {
    return createResult(false, `${fieldName} contains invalid characters`);
  }
  return createResult(true);
};

/**
 * Validate phone number (optional field)
 */
export const validatePhone = (phone) => {
  if (!phone || !phone.trim()) {
    return createResult(true); // Phone is optional
  }
  if (!PHONE_REGEX.test(phone.trim())) {
    return createResult(false, 'Please enter a valid phone number');
  }
  return createResult(true);
};

/**
 * Validate phone number (required field)
 */
export const validatePhoneRequired = (phone, fieldName = 'Phone number') => {
  if (!phone || !phone.trim()) {
    return createResult(false, `${fieldName} is required`);
  }
  if (!PHONE_REGEX.test(phone.trim())) {
    return createResult(false, 'Please enter a valid phone number');
  }
  return createResult(true);
};

/**
 * Validate Reference Number
 */
export const validateRefNo = (refNo) => {
  if (!refNo || !refNo.trim()) {
    return createResult(false, 'Reference number is required');
  }
  if (refNo.trim().length > 30) {
    return createResult(false, 'Reference number cannot exceed 30 characters');
  }
  if (!REF_NO_REGEX.test(refNo.trim())) {
    return createResult(false, 'Reference number can only contain letters, numbers, dashes and underscores');
  }
  return createResult(true);
};

/**
 * Validate PNR
 */
export const validatePNR = (pnr) => {
  if (!pnr || !pnr.trim()) {
    return createResult(false, 'PNR is required');
  }
  if (!PNR_REGEX.test(pnr.trim())) {
    return createResult(false, 'PNR must be 5-10 alphanumeric characters');
  }
  return createResult(true);
};

/**
 * Validate Airline
 */
export const validateAirline = (airline) => {
  if (!airline || !airline.trim()) {
    return createResult(false, 'Airline is required');
  }
  if (airline.trim().length > 50) {
    return createResult(false, 'Airline cannot exceed 50 characters');
  }
  if (!AIRLINE_REGEX.test(airline.trim())) {
    return createResult(false, 'Airline contains invalid characters');
  }
  return createResult(true);
};

/**
 * Validate Route (From/To)
 */
export const validateRoute = (route) => {
  if (!route || !route.trim()) {
    return createResult(false, 'Route (From/To) is required');
  }
  if (route.trim().length > 100) {
    return createResult(false, 'Route cannot exceed 100 characters');
  }
  if (!ROUTE_REGEX.test(route.trim())) {
    return createResult(false, 'Route contains invalid characters');
  }
  return createResult(true);
};

/**
 * Validate positive number
 */
export const validatePositiveNumber = (value, fieldName = 'This field') => {
  if (value === '' || value === null || value === undefined) {
    return createResult(false, `${fieldName} is required`);
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return createResult(false, `${fieldName} must be a valid number`);
  }
  if (num < 0) {
    return createResult(false, `${fieldName} must be a positive number`);
  }
  return createResult(true);
};

/**
 * Validate non-negative number (allows zero)
 */
export const validateNonNegativeNumber = (value, fieldName = 'This field') => {
  if (value === '' || value === null || value === undefined) {
    return createResult(true); // Optional
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    return createResult(false, `${fieldName} must be a valid number`);
  }
  if (num < 0) {
    return createResult(false, `${fieldName} cannot be negative`);
  }
  return createResult(true);
};

/**
 * Validate date is not in the past
 */
export const validateFutureDate = (date, fieldName = 'Date') => {
  if (!date) {
    return createResult(false, `${fieldName} is required`);
  }
  const inputDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (inputDate < today) {
    return createResult(false, `${fieldName} cannot be in the past`);
  }
  return createResult(true);
};

/**
 * Validate date is provided
 */
export const validateDate = (date, fieldName = 'Date') => {
  if (!date) {
    return createResult(false, `${fieldName} is required`);
  }
  const inputDate = new Date(date);
  if (isNaN(inputDate.getTime())) {
    return createResult(false, `${fieldName} is not a valid date`);
  }
  return createResult(true);
};

/**
 * Validate date is in the past (for birthdays)
 */
export const validatePastDate = (date, fieldName = 'Date') => {
  if (!date) {
    return createResult(false, `${fieldName} is required`);
  }
  const inputDate = new Date(date);
  const today = new Date();
  
  if (inputDate >= today) {
    return createResult(false, `${fieldName} must be in the past`);
  }
  return createResult(true);
};

/**
 * Validate select field has a value
 */
export const validateSelect = (value, fieldName = 'Selection') => {
  if (!value || value === '') {
    return createResult(false, `Please select a ${fieldName.toLowerCase()}`);
  }
  return createResult(true);
};

/**
 * Validate minimum length
 */
export const validateMinLength = (value, minLength, fieldName = 'This field') => {
  if (!value || value.length < minLength) {
    return createResult(false, `${fieldName} must be at least ${minLength} characters`);
  }
  return createResult(true);
};

/**
 * Validate maximum length
 */
export const validateMaxLength = (value, maxLength, fieldName = 'This field') => {
  if (value && value.length > maxLength) {
    return createResult(false, `${fieldName} cannot exceed ${maxLength} characters`);
  }
  return createResult(true);
};

/**
 * Validate instalment entry
 */
export const validateInstalment = (instalment, index) => {
  const errors = {};
  
  if (!instalment.dueDate) {
    errors[`instalment_${index}_dueDate`] = `Instalment ${index + 1} due date is required`;
  } else {
    const dateResult = validateDate(instalment.dueDate, `Instalment ${index + 1} due date`);
    if (!dateResult.isValid) {
      errors[`instalment_${index}_dueDate`] = dateResult.message;
    }
  }
  
  if (instalment.amount === '' || instalment.amount === null || instalment.amount === undefined) {
    errors[`instalment_${index}_amount`] = `Instalment ${index + 1} amount is required`;
  } else {
    const num = parseFloat(instalment.amount);
    if (isNaN(num) || num <= 0) {
      errors[`instalment_${index}_amount`] = `Instalment ${index + 1} amount must be greater than 0`;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Validate all instalments
 */
export const validateInstalments = (instalments) => {
  let allErrors = {};
  
  if (!instalments || instalments.length === 0) {
    return {
      isValid: false,
      errors: { customInstalments: 'At least one instalment is required' }
    };
  }
  
  instalments.forEach((inst, index) => {
    const result = validateInstalment(inst, index);
    if (!result.isValid) {
      allErrors = { ...allErrors, ...result.errors };
    }
  });
  
  // Check total instalments amount matches balance (optional warning)
  const totalInstalmentAmount = instalments.reduce((sum, inst) => sum + (parseFloat(inst.amount) || 0), 0);
  if (totalInstalmentAmount <= 0) {
    allErrors.instalmentTotal = 'Total instalment amount must be greater than 0';
  }
  
  return {
    isValid: Object.keys(allErrors).length === 0,
    errors: allErrors
  };
};

/**
 * Sanitize input - remove potential XSS characters
 * Note: Does not trim to allow typing with spaces
 */
export const sanitizeInput = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Sanitize and trim input - use on blur or submit
 */
export const sanitizeAndTrimInput = (value) => {
  if (typeof value !== 'string') return value;
  return sanitizeInput(value).trim();
};

/**
 * Form validation helper - validates multiple fields at once
 * @param {Object} fields - Object with field names as keys and validation functions as values
 * @returns {Object} - { isValid: boolean, errors: { fieldName: string } }
 */
export const validateForm = (fields) => {
  const errors = {};
  let isValid = true;

  for (const [fieldName, { value, validators }] of Object.entries(fields)) {
    for (const validator of validators) {
      const result = validator(value);
      if (!result.isValid) {
        errors[fieldName] = result.message;
        isValid = false;
        break; // Stop at first error for this field
      }
    }
  }

  return { isValid, errors };
};

/**
 * User creation form validation
 */
export const validateUserForm = (formData) => {
  const errors = {};
  
  const emailResult = validateEmail(formData.email);
  if (!emailResult.isValid) errors.email = emailResult.message;
  
  const passwordResult = validatePassword(formData.password);
  if (!passwordResult.isValid) errors.password = passwordResult.message;
  
  const firstNameResult = validateName(formData.firstName, 'First name');
  if (!firstNameResult.isValid) errors.firstName = firstNameResult.message;
  
  const lastNameResult = validateName(formData.lastName, 'Last name');
  if (!lastNameResult.isValid) errors.lastName = lastNameResult.message;
  
  const phoneResult = validatePhone(formData.contactNo);
  if (!phoneResult.isValid) errors.contactNo = phoneResult.message;
  
  const roleResult = validateSelect(formData.role, 'Role');
  if (!roleResult.isValid) errors.role = roleResult.message;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Profile update form validation
 */
export const validateProfileForm = (formData) => {
  const errors = {};
  
  const firstNameResult = validateName(formData.firstName, 'First name');
  if (!firstNameResult.isValid) errors.firstName = firstNameResult.message;
  
  const lastNameResult = validateName(formData.lastName, 'Last name');
  if (!lastNameResult.isValid) errors.lastName = lastNameResult.message;
  
  const phoneResult = validatePhone(formData.contactNo);
  if (!phoneResult.isValid) errors.contactNo = phoneResult.message;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Login form validation
 */
export const validateLoginForm = (email, password) => {
  const errors = {};
  
  const emailResult = validateEmail(email);
  if (!emailResult.isValid) errors.email = emailResult.message;
  
  if (!password || !password.trim()) {
    errors.password = 'Password is required';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Booking form validation
 */
export const validateBookingForm = (formData) => {
  const errors = {};
  const paymentMethod = formData.paymentMethod;
  
  // Validate payment method is selected first
  if (!paymentMethod) {
    errors.paymentMethod = 'Please select a payment method';
    return { isValid: false, errors };
  }
  
  // Required fields for all bookings - using specific validators
  const refNoResult = validateRefNo(formData.refNo);
  if (!refNoResult.isValid) errors.refNo = refNoResult.message;
  
  const paxNameResult = validateRequired(formData.paxName, 'Lead passenger');
  if (!paxNameResult.isValid) errors.paxName = paxNameResult.message;
  
  // Validate passengers array
  if (!formData.passengers || formData.passengers.length === 0) {
    errors.paxName = 'Please add passenger details by clicking the + button';
  }
  
  const agentResult = validateSelect(formData.agentName, 'Agent');
  if (!agentResult.isValid) errors.agentName = agentResult.message;
  
  // Validate team name when agent is selected
  if (formData.agentName && !formData.teamName) {
    errors.teamName = 'Team is required';
  }
  
  const pnrResult = validatePNR(formData.pnr);
  if (!pnrResult.isValid) errors.pnr = pnrResult.message;
  
  const airlineResult = validateAirline(formData.airline);
  if (!airlineResult.isValid) errors.airline = airlineResult.message;
  
  const fromToResult = validateRoute(formData.fromTo);
  if (!fromToResult.isValid) errors.fromTo = fromToResult.message;
  
  const travelDateResult = validateDate(formData.travelDate, 'Travel date');
  if (!travelDateResult.isValid) errors.travelDate = travelDateResult.message;
  
  const pcDateResult = validateDate(formData.pcDate, 'PC date');
  if (!pcDateResult.isValid) errors.pcDate = pcDateResult.message;
  
  // Validate surcharge if provided
  if (formData.surcharge !== '' && formData.surcharge !== null && formData.surcharge !== undefined) {
    const surchargeResult = validateNonNegativeNumber(formData.surcharge, 'Surcharge');
    if (!surchargeResult.isValid) errors.surcharge = surchargeResult.message;
  }
  
  // Payment method specific validation
  if (paymentMethod === 'FULL') {
    const revenueResult = validatePositiveNumber(formData.revenue, 'Revenue');
    if (!revenueResult.isValid) errors.revenue = revenueResult.message;
    
    // Validate product cost if provided
    if (formData.prodCost !== '' && formData.prodCost !== null && formData.prodCost !== undefined) {
      const prodCostResult = validateNonNegativeNumber(formData.prodCost, 'Product cost');
      if (!prodCostResult.isValid) errors.prodCost = prodCostResult.message;
    }
    
    if (!formData.initialPayments || formData.initialPayments.length === 0) {
      errors.initialPayments = 'At least one payment must be added';
    } else {
      // Validate each payment has required fields
      formData.initialPayments.forEach((payment, index) => {
        if (!payment.amount || parseFloat(payment.amount) <= 0) {
          errors[`payment_${index}`] = `Payment ${index + 1} must have a valid amount`;
        }
        if (!payment.transactionMethod) {
          errors[`payment_${index}_method`] = `Payment ${index + 1} must have a transaction method`;
        }
        if (!payment.receivedDate) {
          errors[`payment_${index}_date`] = `Payment ${index + 1} must have a received date`;
        }
      });
    }
    
    // Check revenue vs received amount
    const revenue = parseFloat(formData.revenue) || 0;
    const received = parseFloat(formData.received) || 0;
    if (received > revenue) {
      errors.received = 'Received amount cannot exceed revenue';
    }
    
  } else if (paymentMethod === 'INTERNAL') {
    const sellingPriceResult = validatePositiveNumber(formData.totalSellingPrice, 'Total selling price');
    if (!sellingPriceResult.isValid) errors.totalSellingPrice = sellingPriceResult.message;
    
    const prodCostResult = validatePositiveNumber(formData.prodCost, 'Product cost');
    if (!prodCostResult.isValid) errors.prodCost = prodCostResult.message;
    
    // Validate transaction fee if provided
    if (formData.trans_fee !== '' && formData.trans_fee !== null && formData.trans_fee !== undefined) {
      const transFeeResult = validateNonNegativeNumber(formData.trans_fee, 'Transaction fee');
      if (!transFeeResult.isValid) errors.trans_fee = transFeeResult.message;
    }
    
    // Validate instalments
    if (!formData.customInstalments || formData.customInstalments.length === 0) {
      errors.customInstalments = 'At least one instalment is required for internal payment method';
    } else {
      // Validate each instalment
      const instalmentResult = validateInstalments(formData.customInstalments);
      if (!instalmentResult.isValid) {
        Object.assign(errors, instalmentResult.errors);
      }
      
      // Check that instalment total matches or is close to balance
      const totalInstalments = formData.customInstalments.reduce((sum, inst) => sum + (parseFloat(inst.amount) || 0), 0);
      const balance = parseFloat(formData.balance) || 0;
      const difference = Math.abs(totalInstalments - balance);
      if (balance > 0 && difference > 0.01) {
        errors.instalmentTotal = `Instalment total (£${totalInstalments.toFixed(2)}) should match balance (£${balance.toFixed(2)})`;
      }
    }
    
    // Check selling price vs product cost
    const sellingPrice = parseFloat(formData.totalSellingPrice) || 0;
    const prodCost = parseFloat(formData.prodCost) || 0;
    if (sellingPrice > 0 && prodCost > sellingPrice) {
      errors.prodCost = 'Product cost cannot exceed selling price';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Passenger form validation
 */
export const validatePassengerForm = (passenger) => {
  const errors = {};
  
  const titleResult = validateSelect(passenger.title, 'Title');
  if (!titleResult.isValid) errors.title = titleResult.message;
  
  const firstNameResult = validateName(passenger.firstName, 'First name');
  if (!firstNameResult.isValid) errors.firstName = firstNameResult.message;
  
  const lastNameResult = validateName(passenger.lastName, 'Last name');
  if (!lastNameResult.isValid) errors.lastName = lastNameResult.message;
  
  const genderResult = validateSelect(passenger.gender, 'Gender');
  if (!genderResult.isValid) errors.gender = genderResult.message;
  
  const categoryResult = validateSelect(passenger.category, 'Category');
  if (!categoryResult.isValid) errors.category = categoryResult.message;
  
  const birthdayResult = validatePastDate(passenger.birthday, 'Birthday');
  if (!birthdayResult.isValid) errors.birthday = birthdayResult.message;
  
  // Optional fields
  if (passenger.email) {
    const emailResult = validateEmail(passenger.email);
    if (!emailResult.isValid) errors.email = emailResult.message;
  }
  
  const phoneResult = validatePhone(passenger.contactNo);
  if (!phoneResult.isValid) errors.contactNo = phoneResult.message;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Cancellation form validation
 */
export const validateCancellationForm = (formData) => {
  const errors = {};
  
  const supplierFee = formData.supplierCancellationFee;
  const adminFee = formData.adminFee;
  
  if (supplierFee === '' || supplierFee === null || supplierFee === undefined) {
    errors.supplierCancellationFee = 'Supplier cancellation fee is required';
  } else {
    const supplierResult = validateNonNegativeNumber(supplierFee, 'Supplier cancellation fee');
    if (!supplierResult.isValid) {
      errors.supplierCancellationFee = supplierResult.message;
    }
  }
  
  if (adminFee === '' || adminFee === null || adminFee === undefined) {
    errors.adminFee = 'Consultant fee is required';
  } else {
    const adminResult = validateNonNegativeNumber(adminFee, 'Consultant fee');
    if (!adminResult.isValid) {
      errors.adminFee = adminResult.message;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Payment form validation
 */
export const validatePaymentForm = (formData) => {
  const errors = {};
  
  const { amount, transactionMethod, receivedDate, selectedCustomerCreditNotes } = formData;
  
  const methodResult = validateSelect(transactionMethod, 'Transaction method');
  if (!methodResult.isValid) errors.transactionMethod = methodResult.message;
  
  // For customer credit note, skip amount validation if notes are selected
  if (transactionMethod !== 'CUSTOMER_CREDIT_NOTE') {
    if (amount === '' || amount === null || amount === undefined) {
      errors.amount = 'Amount is required';
    } else {
      const num = parseFloat(amount);
      if (isNaN(num) || num < 0) {
        errors.amount = 'Amount must be a valid non-negative number';
      }
    }
  }
  
  const dateResult = validateDate(receivedDate, 'Received date');
  if (!dateResult.isValid) errors.receivedDate = dateResult.message;
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export default {
  validateEmail,
  validatePassword,
  validateRequired,
  validateName,
  validatePhone,
  validatePhoneRequired,
  validateRefNo,
  validatePNR,
  validateAirline,
  validateRoute,
  validatePositiveNumber,
  validateNonNegativeNumber,
  validateFutureDate,
  validateDate,
  validatePastDate,
  validateSelect,
  validateMinLength,
  validateMaxLength,
  validateInstalment,
  validateInstalments,
  sanitizeInput,
  sanitizeAndTrimInput,
  validateForm,
  validateUserForm,
  validateProfileForm,
  validateLoginForm,
  validateBookingForm,
  validatePassengerForm,
  validateCancellationForm,
  validatePaymentForm
};
