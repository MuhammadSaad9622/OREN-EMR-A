// Vercel Serverless Function - Express App Handler
// This file exports the Express app for Vercel's serverless functions

// Set VERCEL environment variable so server knows it's running on Vercel
process.env.VERCEL = '1';

// Import the Express app (it will handle MongoDB connection automatically)
import app from '../server/index.js';

// Export the Express app as a serverless function handler
export default app;

