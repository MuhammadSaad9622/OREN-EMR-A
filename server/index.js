import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in the server directory (for local)
// On Vercel, environment variables are automatically available
if (!process.env.VERCEL) {
  dotenv.config({ path: path.resolve(__dirname, './.env') });
} else {
  // On Vercel, just load dotenv without path (uses root .env if exists)
  dotenv.config();
}

// Import centralized config (after dotenv.config)
import { FRONTEND_URL } from './config/constants.js';

// Log email configuration status on server start (for debugging)
console.log('=== SERVER STARTUP - EMAIL CONFIGURATION ===');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM ? 'SET' : 'NOT SET');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET' : 'NOT SET');
if (process.env.SENDGRID_API_KEY) {
  console.log('📧 Email Provider: SendGrid (will be used as primary)');
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  console.log('📧 Email Provider: Gmail SMTP (Nodemailer)');
} else {
  console.log('⚠️  Email Provider: NOT CONFIGURED');
}
console.log('===========================================');

import reportsRoutes from './routes/reports.js';
console.log('Loaded MONGODB_URI:', process.env.MONGODB_URI);


import express from 'express';
import mongoose from 'mongoose';
import visitRoutes from './routes/visits.js';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticateToken } from './middleware/authMiddleware.js';

// Import routes
import authRoutes from './routes/auth.js';
import authUpdateRoutes from './routes/auth-update.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import billingRoutes from './routes/billing.js';
import aiRoutes from './routes/aiRoutes.js';
import notesRoutes from './routes/notes.js';
import googleCalendarRoutes from './routes/googleCalendar.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';
import formTemplateRoutes from './routes/formTemplates.js';
import formResponseRoutes from './routes/formResponses.js';
import intakeFormDataRoutes from './routes/intakeFormData.js';
import stripeRoutes from './routes/stripe.js';
import emailRoutes from './routes/email.js';
import payment from './routes/payments.js'
import Template from './routes/Template.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Increase server timeout for long-running operations like PDF generation and email sending
// This ensures the server doesn't timeout before the client (120 seconds)
app.timeout = 120000; // 120 seconds

// CORS configuration
const allowedOrigins = [
  FRONTEND_URL,
  process.env.FRONTEND_URL,
  // Development origins
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
].filter(Boolean);

// Log CORS configuration for debugging
console.log('🌐 CORS Configuration:');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set (defaults to development)');
console.log('  FRONTEND_URL from config:', FRONTEND_URL);
console.log('  FRONTEND_URL from env:', process.env.FRONTEND_URL || 'not set');
console.log('  Allowed origins:', allowedOrigins);

// CORS configuration - more permissive in development
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins
    if (isDevelopment) {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In production, log and block
      if (process.env.NODE_ENV === 'production') {
        console.log('❌ CORS blocked origin:', origin);
        console.log('   Allowed origins:', allowedOrigins);
        callback(new Error('Not allowed by CORS'));
      } else {
        // In development, be more permissive - allow localhost
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          console.log('✅ CORS allowed (development):', origin);
          return callback(null, true);
        }
        console.log('⚠️  CORS check - Origin:', origin);
        console.log('   Allowed origins:', allowedOrigins);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static('uploads'));

// MongoDB connection check middleware (except for health check)
app.use((req, res, next) => {
  // Allow health check endpoint without MongoDB connection
  if (req.path === '/api/health') {
    return next();
  }

  // Check if MongoDB is connected
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: 'Database connection not available. Please try again in a moment.',
      error: 'DATABASE_NOT_CONNECTED',
      readyState: mongoose.connection.readyState
    });
  }

  next();
});

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000, // 30 seconds
  socketTimeoutMS: 45000, // 45 seconds
  connectTimeoutMS: 30000, // 30 seconds
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  w: 'majority',
};

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

// Connect to MongoDB - for both local and Vercel
let mongoConnected = false;

async function connectMongoDB() {
  if (mongoConnected) {
    return;
  }
  
  try {
    if (mongoose.connection.readyState === 1) {
      mongoConnected = true;
      return;
    }

    console.log('🔄 Attempting to connect to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials

    await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    mongoConnected = true;
    console.log('✅ Connected to MongoDB successfully');

    // Test email configuration on startup (non-blocking)
    import('./services/emailService.js').then(({ default: emailService }) => {
      emailService.testConnection().catch(err => {
        console.warn('⚠️  Email connection test failed on startup:', err.message);
      });
    });
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });

    // Provide helpful troubleshooting tips
    if (error.message.includes('ETIMEOUT') || error.message.includes('queryTxt')) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('1. Check your internet connection');
      console.error('2. Verify MongoDB Atlas IP whitelist includes your IP (0.0.0.0/0 for all)');
      console.error('3. Check if MongoDB Atlas cluster is running');
      console.error('4. Verify MONGODB_URI is correct in .env file');
      console.error('5. Try using a local MongoDB instance for development');
    }

    // Don't exit on Vercel - let it retry
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// Connect MongoDB on module load (for Vercel serverless)
connectMongoDB();

// Start server only for local development (not on Vercel)
async function startServer() {
  if (process.env.VERCEL) {
    // On Vercel, we don't start a server - it's serverless
    return;
  }

  try {
    await connectMongoDB();
    
    // Start server only after MongoDB connection is established
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', authUpdateRoutes);
app.use('/api/patients', authenticateToken, patientRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/billing', authenticateToken, billingRoutes);
app.use('/api', authenticateToken, aiRoutes);
app.use('/api/notes', authenticateToken, notesRoutes);
// Google Calendar routes - callback is public, others require auth
app.use('/api/google-calendar', googleCalendarRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/form-templates', authenticateToken, formTemplateRoutes);
app.use('/api/form-responses', authenticateToken, formResponseRoutes);
app.use('/api/intake-form-data', authenticateToken, intakeFormDataRoutes);
app.use('/api/stripe', authenticateToken, stripeRoutes);
app.use('/api/email', authenticateToken, emailRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Server is running' });
});

app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/visits', authenticateToken, visitRoutes);
app.use('/api/payments', authenticateToken, payment)
// PDF Templates route
app.use('/api/templates', Template);
// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// ✅ Start server after MongoDB connection (only for local development)
// On Vercel, the app is exported and used as a serverless function
if (!process.env.VERCEL) {
  startServer();
}

// Export the app for Vercel serverless functions
export default app;