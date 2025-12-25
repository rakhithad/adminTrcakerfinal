/**
 * Security Middleware
 * Contains various security-related middleware for the application
 */

/**
 * Sanitize user input to prevent XSS attacks
 * Removes potentially dangerous characters from strings
 */
const sanitizeInput = (obj, depth = 0) => {
    // Prevent prototype pollution and deep nesting attacks
    if (depth > 10) {
        return null; // Reject deeply nested objects
    }
    
    if (typeof obj === 'string') {
        // Remove potentially dangerous characters and patterns
        return obj
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/vbscript:/gi, '') // Remove vbscript: protocol
            .replace(/data:/gi, '') // Remove data: protocol (can embed scripts)
            .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=, onerror =
            .replace(/expression\s*\(/gi, '') // Remove CSS expression()
            .replace(/eval\s*\(/gi, '') // Remove eval(
            .replace(/\\x[0-9a-fA-F]{2}/g, '') // Remove hex encoded characters
            .replace(/&#/g, '') // Remove HTML entity encoding attempts
            .trim();
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeInput(item, depth + 1));
    }
    if (obj && typeof obj === 'object') {
        // Prevent prototype pollution
        if (Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
            Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
            Object.prototype.hasOwnProperty.call(obj, 'prototype')) {
            return {}; // Reject objects with prototype pollution attempts
        }
        
        const sanitized = {};
        for (const key of Object.keys(obj)) {
            // Reject dangerous keys
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            // Sanitize the key as well
            const sanitizedKey = sanitizeInput(key, depth + 1);
            if (sanitizedKey) {
                sanitized[sanitizedKey] = sanitizeInput(obj[key], depth + 1);
            }
        }
        return sanitized;
    }
    return obj;
};

/**
 * Input sanitization middleware
 * Sanitizes req.body, req.query, and req.params
 */
const inputSanitizer = (req, res, next) => {
    if (req.body) {
        req.body = sanitizeInput(req.body);
    }
    if (req.query) {
        req.query = sanitizeInput(req.query);
    }
    if (req.params) {
        req.params = sanitizeInput(req.params);
    }
    next();
};

/**
 * NoSQL Injection Prevention
 * Removes MongoDB operators from user input
 */
const preventNoSQLInjection = (obj) => {
    if (typeof obj === 'string') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(preventNoSQLInjection);
    }
    if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const key of Object.keys(obj)) {
            // Remove keys that start with $ (MongoDB operators)
            if (!key.startsWith('$')) {
                cleaned[key] = preventNoSQLInjection(obj[key]);
            }
        }
        return cleaned;
    }
    return obj;
};

const noSQLInjectionPrevention = (req, res, next) => {
    if (req.body) {
        req.body = preventNoSQLInjection(req.body);
    }
    if (req.query) {
        req.query = preventNoSQLInjection(req.query);
    }
    next();
};

/**
 * Global error handler that doesn't leak stack traces in production
 */
const globalErrorHandler = (err, req, res, next) => {
    // Determine if we're in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Log the full error for debugging (with request ID for correlation)
    console.error(`[${req.requestId || 'no-id'}] Error:`, isProduction ? err.message : err);

    // Set default status code
    const statusCode = err.statusCode || err.status || 500;

    // Build the error response - NEVER leak internal details in production
    const errorResponse = {
        success: false,
        requestId: req.requestId, // Include for support/debugging
    };

    // Handle specific error types with safe messages
    if (err.name === 'ValidationError') {
        errorResponse.message = 'Validation Error';
        errorResponse.errors = isProduction ? undefined : err.errors;
        return res.status(400).json(errorResponse);
    }

    if (err.name === 'JsonWebTokenError') {
        errorResponse.message = 'Authentication failed';
        return res.status(401).json(errorResponse);
    }

    if (err.name === 'TokenExpiredError') {
        errorResponse.message = 'Session expired. Please login again.';
        return res.status(401).json(errorResponse);
    }

    // Prisma error handling - use generic messages in production
    if (err.code === 'P2002') {
        errorResponse.message = 'A record with this value already exists';
        return res.status(409).json(errorResponse);
    }

    if (err.code === 'P2025') {
        errorResponse.message = 'Record not found';
        return res.status(404).json(errorResponse);
    }

    // CORS error handling
    if (err.message === 'Not allowed by CORS') {
        errorResponse.message = 'Origin not allowed';
        return res.status(403).json(errorResponse);
    }

    // Generic error - use safe message in production
    if (isProduction) {
        errorResponse.message = statusCode >= 500 
            ? 'An unexpected error occurred. Please try again later.'
            : err.message || 'Request failed';
    } else {
        errorResponse.message = err.message || 'Internal Server Error';
        errorResponse.stack = err.stack;
        errorResponse.error = err;
    }

    res.status(statusCode).json(errorResponse);
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Request size limiter - prevents large payload attacks
 * Using conservative limits appropriate for a booking system
 */
const requestSizeLimiter = {
    json: { limit: '1mb' }, // Limit JSON body to 1MB (sufficient for booking data)
    urlencoded: { limit: '1mb', extended: true }
};

/**
 * Security headers for API responses
 */
const securityHeaders = (req, res, next) => {
    // Prevent caching of sensitive data
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    
    // Remove X-Powered-By header (also done by Helmet, but belt and suspenders)
    res.removeHeader('X-Powered-By');
    
    next();
};

/**
 * HTTPS redirect middleware (for production)
 */
const forceHttps = (req, res, next) => {
    if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
};

/**
 * CSRF-like protection for API requests
 * Validates that state-changing requests come from legitimate sources
 * 
 * This works because:
 * 1. X-Requested-With header cannot be set cross-origin without CORS preflight
 * 2. Our CORS policy only allows whitelisted origins
 * 3. Combined with Bearer token auth, this provides strong CSRF protection
 */
const csrfProtection = (req, res, next) => {
    // Only check state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // In production, require X-Requested-With header for state-changing requests
        // This header triggers CORS preflight and cannot be forged cross-origin
        if (process.env.NODE_ENV === 'production') {
            const xRequestedWith = req.get('X-Requested-With');
            if (!xRequestedWith || xRequestedWith !== 'XMLHttpRequest') {
                console.warn(`[${req.requestId || 'no-id'}] CSRF protection: Missing or invalid X-Requested-With header from ${req.ip}`);
                return res.status(403).json({
                    success: false,
                    message: 'Invalid request'
                });
            }
        }
    }
    next();
};

module.exports = {
    inputSanitizer,
    noSQLInjectionPrevention,
    globalErrorHandler,
    asyncHandler,
    requestSizeLimiter,
    securityHeaders,
    forceHttps,
    csrfProtection
};
