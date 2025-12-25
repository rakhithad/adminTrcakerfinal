// src/middleware/auth.middleware.js
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Initialize the Supabase admin client
// NOTE: SUPABASE_SERVICE_KEY is used server-side only for verifying tokens
// It should NEVER be exposed to the client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// =================================================================
// == AUTHENTICATION MIDDLEWARE
// =================================================================
const authenticateToken = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // Add artificial delay to prevent timing attacks
      await artificialDelay(startTime);
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    // Validate token format (basic check - JWT has 3 parts)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      await artificialDelay(startTime);
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed' 
      });
    }

    // Additional token format validation
    const isValidBase64 = tokenParts.every(part => {
      try {
        // Check if it's valid base64url
        return /^[A-Za-z0-9_-]+$/.test(part);
      } catch {
        return false;
      }
    });

    if (!isValidBase64) {
      await artificialDelay(startTime);
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed' 
      });
    }

    // Use Supabase to verify the token
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

    if (error) {
      // Don't expose internal error details - log for debugging
      console.error(`[${req.requestId || 'no-id'}] JWT validation error:`, error.message);
      
      await artificialDelay(startTime);
      
      // Use generic message for all auth errors
      if (error.message.includes('expired')) {
        return res.status(401).json({ 
          success: false,
          message: 'Session expired. Please login again.' 
        });
      }
      
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed' 
      });
    }

    if (!supabaseUser) {
      await artificialDelay(startTime);
      return res.status(401).json({ 
        success: false,
        message: 'Authentication failed' 
      });
    }

    // Fetch user profile from database
    let userProfile = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    // Auto-create profile if it doesn't exist (for newly registered users)
    if (!userProfile) {
      userProfile = await prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: supabaseUser.email,
          firstName: "New",
          lastName: "User",
          role: 'CONSULTANT',
        },
      });
    }

    // Attach user profile to request (minimal info needed)
    req.user = {
      id: userProfile.id,
      email: userProfile.email,
      firstName: userProfile.firstName,
      lastName: userProfile.lastName,
      role: userProfile.role,
      team: userProfile.team
    };
    next();
    
  } catch (dbError) {
    console.error(`[${req.requestId || 'no-id'}] Error in authentication middleware:`, dbError.message);
    await artificialDelay(startTime);
    return res.status(500).json({ 
      success: false,
      message: "Authentication error. Please try again." 
    });
  }
};

/**
 * Artificial delay to prevent timing attacks
 * Ensures all responses take similar time regardless of failure point
 */
async function artificialDelay(startTime, targetMs = 100) {
  const elapsed = Date.now() - startTime;
  const remainingDelay = Math.max(0, targetMs - elapsed);
  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
}


// =================================================================
// == AUTHORIZATION MIDDLEWARE
// =================================================================
const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied.' 
      });
    }
    
    const { role, id: userId } = req.user;
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (rolesArray.includes(role)) {
      next();
    } else {
      // Log unauthorized access attempts for security monitoring (don't expose details to client)
      console.warn(`[${req.requestId || 'no-id'}] Unauthorized access attempt: User ${userId} with role ${role} tried to access ${req.method} ${req.path}`);
      
      res.status(403).json({ 
        success: false,
        message: 'You do not have permission to perform this action.' 
      });
    }
  };
};

module.exports = { authenticateToken, authorizeRole };