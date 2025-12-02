/**
 * Centralized configuration for API URLs
 * 
 * To change between development and production:
 * - Development: Set VITE_API_URL in .env file (e.g., http://localhost:5000)
 * - Production: Set VITE_API_URL in .env file (e.g., https://oren-emr-ai-1.onrender.com)
 * 
 * Fallback URL is used if VITE_API_URL is not set in environment variables
 */

// Development URL (for local development)
const DEVELOPMENT_API_URL = 'http://localhost:5000';

// Production URL (fallback if VITE_API_URL is not set)
const PRODUCTION_API_URL = 'https://oren-emr-ai-1.onrender.com';

// Get API URL from environment variable or use fallback
export const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.DEV ? DEVELOPMENT_API_URL : PRODUCTION_API_URL);

