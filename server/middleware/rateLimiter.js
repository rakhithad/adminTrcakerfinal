const rateLimit = require('express-rate-limit');

// Skip rate limiting for certain conditions (optional - for health checks, etc.)
const skip = (req) => {
    // Skip rate limiting for health check endpoints
    if (req.path === '/health' || req.path === '/api/health') {
        return true;
    }
    return false;
};

// Standard rate limit response handler
const standardHandler = (req, res) => {
    res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: res.getHeader('Retry-After')
    });
};

// General API rate limiter - 100 requests per 15 minutes
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip,
    handler: standardHandler,
});

// Stricter rate limiter for authentication routes - 5 requests per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login/register requests per windowMs (stricter)
    message: {
        success: false,
        message: 'Too many authentication attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests, even successful ones
    handler: standardHandler,
});

// Rate limiter for sensitive operations (password reset, etc.) - 3 requests per hour
const sensitiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 requests per hour (very strict)
    message: {
        success: false,
        message: 'Too many sensitive operation requests from this IP, please try again after an hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardHandler,
});

// Rate limiter for report generation/PDF downloads - 30 requests per 15 minutes
const reportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Limit each IP to 30 report requests per windowMs
    message: {
        success: false,
        message: 'Too many report requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardHandler,
});

// Rate limiter specifically for user creation - prevent mass account creation
const createUserLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Max 10 user creations per hour
    message: {
        success: false,
        message: 'Too many user creation attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: standardHandler,
});

module.exports = {
    generalLimiter,
    authLimiter,
    sensitiveLimiter,
    reportLimiter,
    createUserLimiter
};
