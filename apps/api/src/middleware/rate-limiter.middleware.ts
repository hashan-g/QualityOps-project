import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test', // Skip during automated test suites
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts. Please try again later after 15 minutes.',
    },
  },
});

export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 refresh requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many token refresh requests. Please try again later.',
    },
  },
});
