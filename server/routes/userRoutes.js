const express = require('express');
const router = express.Router();
const { getMyProfile, updateMyProfile, getAgents, getAllUsers, updateUserById, createUser } = require('../controllers/userController');
const { authenticateToken, authorizeRole } = require('../middleware/auth.middleware.js');
const { userValidation } = require('../middleware/validation.middleware');
const { createUserLimiter } = require('../middleware/rateLimiter');


router.post('/create', authenticateToken, createUserLimiter, userValidation.createUser, createUser); 
router.get('/me', authenticateToken, getMyProfile);
router.put('/me', authenticateToken, userValidation.updateProfile, updateMyProfile);
router.get('/agents', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN']), getAgents);

router.get('/', authenticateToken, getAllUsers);
router.put('/:id', authenticateToken, authorizeRole(['ADMIN', 'SUPER_ADMIN' ]), userValidation.updateUserById, updateUserById);

module.exports = router;