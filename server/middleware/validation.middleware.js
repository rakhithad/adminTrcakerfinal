/**
 * Input Validation Schemas using express-validator
 * Centralized validation rules for different routes
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(err => ({
                field: err.path,
                message: err.msg
            }))
        });
    }
    next();
};

/**
 * User validation rules
 */
const userValidation = {
    createUser: [
        body('email')
            .isEmail()
            .withMessage('Please provide a valid email address')
            .normalizeEmail()
            .trim(),
        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
            .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
        body('firstName')
            .trim()
            .notEmpty()
            .withMessage('First name is required')
            .isLength({ max: 50 })
            .withMessage('First name cannot exceed 50 characters')
            .escape(),
        body('lastName')
            .trim()
            .notEmpty()
            .withMessage('Last name is required')
            .isLength({ max: 50 })
            .withMessage('Last name cannot exceed 50 characters')
            .escape(),
        body('role')
            .notEmpty()
            .withMessage('Role is required')
            .isIn(['CONSULTANT', 'MANAGEMENT', 'ADMIN', 'SUPER_ADMIN'])
            .withMessage('Invalid role specified'),
        body('title')
            .optional()
            .trim()
            .isLength({ max: 20 })
            .withMessage('Title cannot exceed 20 characters'),
        body('team')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .withMessage('Team name cannot exceed 50 characters'),
        body('contactNo')
            .optional()
            .trim()
            .matches(/^[\d\s\-+()]*$/)
            .withMessage('Contact number can only contain digits, spaces, and common phone characters'),
        validate
    ],

    updateProfile: [
        body('firstName')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .withMessage('First name cannot exceed 50 characters')
            .escape(),
        body('lastName')
            .optional()
            .trim()
            .isLength({ max: 50 })
            .withMessage('Last name cannot exceed 50 characters')
            .escape(),
        body('title')
            .optional()
            .trim()
            .isLength({ max: 20 })
            .withMessage('Title cannot exceed 20 characters'),
        body('contactNo')
            .optional()
            .trim()
            .matches(/^[\d\s\-+()]*$/)
            .withMessage('Contact number can only contain digits, spaces, and common phone characters'),
        validate
    ],

    updateUserById: [
        param('id')
            .notEmpty()
            .withMessage('User ID is required')
            .isUUID()
            .withMessage('Invalid user ID format'),
        body('role')
            .optional()
            .isIn(['CONSULTANT', 'MANAGEMENT', 'ADMIN', 'SUPER_ADMIN'])
            .withMessage('Invalid role specified'),
        validate
    ]
};

/**
 * Booking validation rules
 */
const bookingValidation = {
    createBooking: [
        body('ref_no')
            .trim()
            .notEmpty()
            .withMessage('Reference number is required')
            .isLength({ max: 50 })
            .withMessage('Reference number cannot exceed 50 characters'),
        body('pax_name')
            .trim()
            .notEmpty()
            .withMessage('Passenger name is required')
            .isLength({ max: 255 })
            .withMessage('Passenger name cannot exceed 255 characters')
            .escape(),
        body('agent_name')
            .trim()
            .notEmpty()
            .withMessage('Agent name is required'),
        body('pnr')
            .trim()
            .notEmpty()
            .withMessage('PNR is required')
            .isLength({ max: 20 })
            .withMessage('PNR cannot exceed 20 characters')
            .isAlphanumeric()
            .withMessage('PNR must be alphanumeric'),
        body('airline')
            .trim()
            .notEmpty()
            .withMessage('Airline is required')
            .isLength({ max: 100 })
            .withMessage('Airline cannot exceed 100 characters'),
        body('from_to')
            .trim()
            .notEmpty()
            .withMessage('Route (from/to) is required'),
        body('bookingType')
            .notEmpty()
            .withMessage('Booking type is required')
            .isIn(['TICKET', 'TOUR', 'VISA', 'HOTEL', 'INSURANCE', 'OTHER'])
            .withMessage('Invalid booking type'),
        body('paymentMethod')
            .notEmpty()
            .withMessage('Payment method is required'),
        body('pcDate')
            .notEmpty()
            .withMessage('PC date is required')
            .isISO8601()
            .withMessage('Invalid date format for PC date'),
        body('travelDate')
            .notEmpty()
            .withMessage('Travel date is required')
            .isISO8601()
            .withMessage('Invalid date format for travel date'),
        body('numPax')
            .notEmpty()
            .withMessage('Number of passengers is required')
            .isInt({ min: 1 })
            .withMessage('Number of passengers must be at least 1'),
        body('revenue')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Revenue must be a positive number'),
        body('transFee')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Transaction fee must be a positive number'),
        body('surcharge')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Surcharge must be a positive number'),
        validate
    ],

    updateBooking: [
        param('id')
            .notEmpty()
            .withMessage('Booking ID is required')
            .isInt()
            .withMessage('Invalid booking ID format'),
        validate
    ],

    bookingIdParam: [
        param('id')
            .notEmpty()
            .withMessage('Booking ID is required')
            .isInt()
            .withMessage('Invalid booking ID format'),
        validate
    ]
};

/**
 * Transaction validation rules
 */
const transactionValidation = {
    createTransaction: [
        body('amount')
            .notEmpty()
            .withMessage('Amount is required')
            .isFloat({ min: 0 })
            .withMessage('Amount must be a positive number'),
        body('type')
            .notEmpty()
            .withMessage('Transaction type is required'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Description cannot exceed 500 characters')
            .escape(),
        validate
    ]
};

/**
 * Common validation rules
 */
const commonValidation = {
    // Validate pagination parameters
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        validate
    ],

    // Validate date range parameters
    dateRange: [
        query('startDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid start date format'),
        query('endDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid end date format'),
        validate
    ],

    // Validate UUID parameter
    uuidParam: [
        param('id')
            .notEmpty()
            .withMessage('ID is required')
            .isUUID()
            .withMessage('Invalid ID format'),
        validate
    ],

    // Validate integer ID parameter
    intIdParam: [
        param('id')
            .notEmpty()
            .withMessage('ID is required')
            .isInt()
            .withMessage('Invalid ID format'),
        validate
    ]
};

module.exports = {
    validate,
    userValidation,
    bookingValidation,
    transactionValidation,
    commonValidation
};
