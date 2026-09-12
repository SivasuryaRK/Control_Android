import { Router } from 'express';
import { register, login, refresh, logout, me } from '../controllers/auth.controller';
import { authenticateRequest } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticateRequest, me);

export default router;
