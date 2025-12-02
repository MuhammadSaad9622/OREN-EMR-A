import express from 'express';
import Stripe from 'stripe';
import Billing from '../models/Billing.js';
import Patient from '../models/Patient.js';
import emailService from '../services/emailService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { FRONTEND_URL } from '../config/constants.js';

const router = express.Router();

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Send invoice email with Stripe payment link
router.post('/send-invoice-email/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    // Find invoice
    const invoice = await Billing.findById(invoiceId)
      .populate('patient', 'firstName lastName email phone address');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Create Stripe payment link if not exists
    let paymentLink = invoice.stripePaymentLink;
    if (!paymentLink) {
      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              metadata: {
                invoiceNumber: invoice.invoiceNumber,
                invoiceId: invoice._id.toString()
              }
            },
            unit_amount: Math.round(invoice.total * 100)
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${FRONTEND_URL}/billing/success/${invoiceId}`,
        cancel_url: `${FRONTEND_URL}/billing/cancel/${invoiceId}`,
        metadata: {
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber
        }
      });

      paymentLink = session.url;
      
      // Save Stripe session ID and payment link
      invoice.stripeSessionId = session.id;
      invoice.stripePaymentLink = paymentLink;
      await invoice.save();
    }

    // Send email asynchronously to prevent timeout
    // Return immediately to client, process email in background
    emailService.sendInvoiceEmail(
      invoice,
      invoice.patient,
      paymentLink,
      recipientEmail
    )
    .then((result) => {
      // Update invoice after successful email
      Billing.findByIdAndUpdate(invoiceId, {
        emailSent: true,
        emailSentAt: new Date()
      }).catch(err => {
        console.error('Error updating invoice email status:', err);
      });
      console.log(`✅ Invoice email sent successfully to ${recipientEmail}`);
      console.log('Email result:', {
        messageId: result?.messageId,
        response: result?.response,
        accepted: result?.accepted,
        rejected: result?.rejected
      });
    })
    .catch((emailError) => {
      console.error('❌ Error sending invoice email in background:');
      console.error('Error message:', emailError?.message);
      console.error('Error code:', emailError?.code);
      console.error('Error stack:', emailError?.stack);
      console.error('Full error:', emailError);
      
      // Log configuration status
      console.error('Email configuration check:');
      console.error('  EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
      console.error('  EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
      console.error('  Email service configured:', emailService.isConfigured);
    });

    // Return immediately - email is being processed in background
    res.json({
      success: true,
      message: 'Invoice email is being sent. Please allow a few moments for delivery.',
      data: {
        emailQueued: true,
        emailSent: false, // Will be updated in background
        paymentLink: paymentLink,
        stripeSessionId: invoice.stripeSessionId
      }
    });
  } catch (error) {
    console.error('Error in send-invoice-email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invoice email',
      error: error.message
    });
  }
});

// Send payment reminder
router.post('/send-reminder/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email is required'
      });
    }

    // Find invoice
    const invoice = await Billing.findById(invoiceId)
      .populate('patient', 'firstName lastName email phone address');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Get or create payment link
    let paymentLink = invoice.stripePaymentLink;
    if (!paymentLink) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              metadata: {
                invoiceNumber: invoice.invoiceNumber,
                invoiceId: invoice._id.toString()
              }
            },
            unit_amount: Math.round(invoice.total * 100)
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${FRONTEND_URL}/billing/success/${invoiceId}`,
        cancel_url: `${FRONTEND_URL}/billing/cancel/${invoiceId}`,
        metadata: {
          invoiceId: invoice._id.toString(),
          invoiceNumber: invoice.invoiceNumber
        }
      });

      paymentLink = session.url;
      invoice.stripeSessionId = session.id;
      invoice.stripePaymentLink = paymentLink;
      await invoice.save();
    }

    // Send reminder email
    try {
      await emailService.sendPaymentReminder(
        invoice,
        invoice.patient,
        paymentLink,
        recipientEmail
      );

      invoice.lastReminderSent = new Date();
      await invoice.save();

      res.json({
        success: true,
        message: 'Payment reminder sent successfully',
        data: {
          emailSent: true,
          paymentLink: paymentLink
        }
      });
    } catch (emailError) {
      console.error('Error sending reminder email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Failed to send reminder email',
        error: emailError.message
      });
    }
  } catch (error) {
    console.error('Error in send-reminder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send payment reminder',
      error: error.message
    });
  }
});

// Get invoice status (Stripe payment status)
router.get('/invoice-status/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Billing.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    let stripeStatus = 'not_created';
    let balance = invoice.total;

    // Check Stripe session status if exists
    if (invoice.stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(invoice.stripeSessionId);
        stripeStatus = session.payment_status === 'paid' ? 'paid' : session.payment_status;
        
        // If paid, update invoice status
        if (session.payment_status === 'paid' && invoice.status !== 'paid') {
          invoice.status = 'paid';
          await invoice.save();
        }
      } catch (stripeError) {
        console.error('Error retrieving Stripe session:', stripeError);
      }
    }

    // Calculate balance
    if (invoice.paymentHistory && invoice.paymentHistory.length > 0) {
      const totalPaid = invoice.paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
      balance = invoice.total - totalPaid;
    }

    res.json({
      success: true,
      data: {
        stripeStatus: stripeStatus,
        invoiceStatus: invoice.status,
        balance: balance,
        total: invoice.total,
        emailSent: invoice.emailSent || false,
        paymentLink: invoice.stripePaymentLink || null
      }
    });
  } catch (error) {
    console.error('Error in invoice-status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get invoice status',
      error: error.message
    });
  }
});

// Create Stripe payment link for invoice
router.post('/create-payment-link/:invoiceId', authenticateToken, async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Billing.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice ${invoice.invoiceNumber}`,
            metadata: {
              invoiceNumber: invoice.invoiceNumber,
              invoiceId: invoice._id.toString()
            }
          },
          unit_amount: Math.round(invoice.total * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/billing/success/${invoiceId}`,
      cancel_url: `${FRONTEND_URL}/billing/cancel/${invoiceId}`,
      metadata: {
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber
      }
    });

    // Save Stripe session ID and payment link
    invoice.stripeSessionId = session.id;
    invoice.stripePaymentLink = session.url;
    await invoice.save();

    res.json({
      success: true,
      message: 'Payment link created successfully',
      data: {
        paymentLink: session.url,
        stripeSessionId: session.id
      }
    });
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment link',
      error: error.message
    });
  }
});

export default router;

