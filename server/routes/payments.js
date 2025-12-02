import express from 'express';
const router = express.Router();
import dotenv from 'dotenv';
import Billing from '../models/Billing.js';
import Stripe from 'stripe';
import { FRONTEND_URL } from '../config/constants.js';

dotenv.config();

// Initialize Stripe with the secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


router.post('/checkout-session', async (req, res) => {
  try {
    const { Products, id } = req.body;
    console.log(Products);

    // Ensure Products is an array; if it's a single object, wrap it in an array
    const productsArray = Array.isArray(Products) ? Products : [Products];

    const lineItems = productsArray.map((product) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Invoice ${product.invoiceNumber}`, // Use a descriptive name for the product
          metadata: {
            invoiceNumber: product.invoiceNumber,
            patient: product.patient,
            visit: product.visit || '', // Handle empty visit
            dateIssued: product.dateIssued,
            total: product.total,
            status: product.status,
          },
        },
        unit_amount: Math.round(product.total * 100), // Ensure unit_amount is an integer
      },
      quantity: product.quantity || 1, // Default to 1 if quantity is not provided
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${FRONTEND_URL}/billing/success/${id}`,
      cancel_url: `${FRONTEND_URL}/billing/cancel/${id}`,
    });

    res.status(201).json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
    res.status(500).json({ message: 'Failed to create checkout session', error: error.message });
  }
});

router.put('/update-payment-status/:id', async (req, res) => {
  const { id } = req.params;

 
  try {
    const bill = await Billing.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'paid',
         
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!bill) {
      console.error(`bill ${id} not found`);
      return res.status(404).json({ message: 'Order not found' });
    }

    console.log(`bill ${id} payment status updated to Completed`);
    res.status(200).json({ success: true, data: bill });
  } catch (error) {
    console.error('Error updating payment status:', error.message);
    res.status(500).json({ message: 'Failed to update payment status', error: error.message });
  }
});


export default router;