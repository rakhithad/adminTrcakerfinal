const express = require('express');
const dotenv = require("dotenv");
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const { generalLimiter, authLimiter, reportLimiter } = require('./middleware/rateLimiter');
const { 
    inputSanitizer, 
    noSQLInjectionPrevention, 
    globalErrorHandler, 
    securityHeaders,
    forceHttps,
    requestSizeLimiter,
    csrfProtection 
} = require('./middleware/security.middleware');

dotenv.config();
const app = express();

app.set('trust proxy', 1);

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
    app.use(forceHttps);
}

// Request ID middleware for tracking and debugging
const crypto = require('crypto');
app.use((req, res, next) => {
    req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// Security middleware - Helmet helps secure Express apps by setting HTTP response headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allow inline scripts and eval for frameworks
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Allow inline styles and Google Fonts
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"], // Allow fonts from Google and data URIs
            imgSrc: ["'self'", "data:", "https:", "blob:"], // Allow images from various sources
            connectSrc: ["'self'", "https:", "wss:"], // Allow API calls and WebSocket connections
            frameSrc: ["'self'"], // Allow iframes from same origin
            objectSrc: ["'none'"], // Disallow plugins like Flash
            mediaSrc: ["'self'"], // Allow media from same origin
            workerSrc: ["'self'", "blob:"], // Allow web workers
        },
    },
    crossOriginEmbedderPolicy: false, // Disable if you need to load cross-origin resources
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin requests for API
    // HSTS - Strict Transport Security (forces HTTPS)
    hsts: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
    }
}));

// Additional security headers
app.use(securityHeaders);

// Prevent HTTP Parameter Pollution attacks
app.use(hpp());

// Request body parsing with size limits
app.use(express.json(requestSizeLimiter.json));
app.use(express.urlencoded(requestSizeLimiter.urlencoded));

// CORS configuration - whitelist allowed origins
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
    origin: (origin, callback) => {
        // In production, ALWAYS require and validate origin
        if (process.env.NODE_ENV === 'production') {
            if (!origin) {
                return callback(null, true); // allow server-side or Postman requests
            }

            if (!allowedOrigins.includes(origin)) {
                return callback(new Error('Not allowed by CORS'));
            }
            return callback(null, true);
        }
        
        // Development mode - allow localhost origins and tools like Postman
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With'],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining'],
    credentials: false, // We use Bearer tokens, not cookies - keep this false
    maxAge: 86400, // Cache preflight for 24 hours
    optionsSuccessStatus: 204, // Some legacy browsers choke on 204
}));

// Additional origin validation for state-changing requests (CSRF-like protection)
// This adds a second layer of defense for mutation operations
app.use((req, res, next) => {
    // Only check state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const origin = req.get('Origin');
        const referer = req.get('Referer');
        
        // In production, require valid origin or referer for state-changing requests
        if (process.env.NODE_ENV === 'production') {
            const validOrigin = origin && allowedOrigins.includes(origin);
            const validReferer = referer && allowedOrigins.some(allowed => referer.startsWith(allowed));
            
            if (!validOrigin && !validReferer) {
                return res.status(403).json({
                    success: false,
                    message: 'Invalid request origin'
                });
            }
        }
    }
    next();
});

// CSRF-like protection via X-Requested-With header validation
app.use(csrfProtection);

// Input sanitization middleware
app.use(inputSanitizer);
app.use(noSQLInjectionPrevention);

// Apply general rate limiting to all requests
app.use(generalLimiter);

const PORT = process.env.PORT || 5000;


//Routes
// User routes - general rate limiting for user management
const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const bookingRoutes = require('./routes/bookingRoutes');
app.use('/api/bookings', bookingRoutes);

const auditLogRoutes = require('./routes/auditLog.routes');
app.use('/api/audit-history', auditLogRoutes);

// Report routes with specific rate limiting
const internalInvoiceRoutes = require('./routes/internalInvoiceRoutes');
app.use('/api/reports/internal-invoicing', reportLimiter, internalInvoiceRoutes);

const transactionRoutes = require('./routes/transactionRoutes')
app.use('/api/transactions', transactionRoutes);

const supplierReportRoutes = require('./routes/supplierReportRoutes');
app.use('/api/supplier-reports', reportLimiter, supplierReportRoutes);

const customerDepositReportRoutes = require('./routes/CustomerDepositReport');
app.use('/api', customerDepositReportRoutes);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler - prevents leaking stack traces in production
app.use(globalErrorHandler);

app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});