/**
 * Centralized configuration for Frontend URLs
 * 
 * To change between development and production:
 * - Development: Set FRONTEND_URL in .env file (e.g., http://localhost:5173)
 * - Production: Set FRONTEND_URL in .env file (e.g., https://oren-emr-ai-ashen.vercel.app)
 * 
 * Fallback URL is used if FRONTEND_URL is not set in environment variables
 */

// Development URL (for local development)
const DEVELOPMENT_FRONTEND_URL = 'http://localhost:5173';

// Production URL (fallback if FRONTEND_URL is not set)
const PRODUCTION_FRONTEND_URL = 'https://oren-emr-ai-ashen.vercel.app';

// Get Frontend URL from environment variable or use fallback based on NODE_ENV
export const FRONTEND_URL = process.env.FRONTEND_URL || 
  (process.env.NODE_ENV === 'development' ? DEVELOPMENT_FRONTEND_URL : PRODUCTION_FRONTEND_URL);

// Also export CLIENT_BASE_URL and CLIENT_URL as aliases for backward compatibility
export const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || FRONTEND_URL;
export const CLIENT_URL = process.env.CLIENT_URL || FRONTEND_URL;

