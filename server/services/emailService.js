import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { FRONTEND_URL } from '../config/constants.js';

class EmailService {
  constructor() {
    this.emailUser = process.env.EMAIL_USER;
    this.emailPassword = process.env.EMAIL_PASSWORD;
    this.sendGridApiKey = process.env.SENDGRID_API_KEY;
    this.emailFrom = process.env.EMAIL_FROM || this.emailUser;

    // Check if email is configured (SendGrid or Gmail)
    this.isConfigured = !!(this.sendGridApiKey || (this.emailUser && this.emailPassword));
    this.useSendGrid = !!this.sendGridApiKey && this.sendGridApiKey.trim().length > 0;
    
    // Initialize SendGrid if API key is available
    if (this.useSendGrid) {
      sgMail.setApiKey(this.sendGridApiKey);
      console.log('✅ SendGrid API key configured and initialized');
    }
    
    // Log environment information for debugging
    const isCloudEnvironment = process.env.RENDER || process.env.HEROKU || process.env.NODE_ENV === 'production';
    console.log('📧 Email Service Configuration:');
    console.log('  Environment:', isCloudEnvironment ? 'Cloud (Render/Heroku)' : 'Local');
    console.log('  Email Provider:', this.useSendGrid ? 'SendGrid (Primary)' : 'Gmail SMTP (Nodemailer)');
    console.log('  Configured:', this.isConfigured ? 'Yes' : 'No');
    if (this.useSendGrid) {
      console.log('  SENDGRID_API_KEY:', this.sendGridApiKey ? 'Set' : 'Not set');
      console.log('  EMAIL_FROM:', this.emailFrom || 'Not set (will use EMAIL_USER)');
    } else {
      console.log('  EMAIL_USER:', this.emailUser ? `${this.emailUser.substring(0, 3)}***` : 'Not set');
      console.log('  EMAIL_PASSWORD:', this.emailPassword ? 'Set' : 'Not set');
    }
    
    if (!this.isConfigured) {
      console.warn('⚠️  Email service is not configured. Please set either:');
      console.warn('     - SENDGRID_API_KEY (recommended for production)');
      console.warn('     - OR EMAIL_USER and EMAIL_PASSWORD (for Gmail SMTP)');
    } else {
      const provider = this.useSendGrid ? 'SendGrid' : 'Gmail SMTP (Nodemailer)';
      console.log(`✅ Email service is ready (${provider})`);
      if (this.useSendGrid) {
        console.log('   📧 SendGrid will be used for all email sending');
      } else {
        console.log('   📧 Gmail SMTP will be used for all email sending');
      }
    }
  }

  // Create transporter with optimized settings for cloud environments
  // Supports both port 587 (TLS) and port 465 (SSL) as fallback
  // Enhanced for Render and other cloud platforms
  createTransporter(port = 587) {
    // Remove spaces from password (Gmail App Passwords sometimes have spaces)
    const cleanPassword = (this.emailPassword || '').replace(/\s/g, '');
    
    // Detect if running on cloud platform (Render, Heroku, etc.)
    const isCloudEnvironment = process.env.RENDER || process.env.HEROKU || process.env.NODE_ENV === 'production';
    
    // For Render/production, prefer port 465 (SSL) as it's more reliable
    // Port 465 uses SSL which is often less blocked by firewalls
    if (isCloudEnvironment && port === 587) {
      console.log('⚠️  Cloud environment detected - consider using port 465 (SSL) for better reliability');
    }
    
    // Use longer timeouts for cloud environments where network latency is higher
    const connectionTimeout = isCloudEnvironment ? 60000 : 30000; // 60s cloud, 30s local
    const greetingTimeout = isCloudEnvironment ? 30000 : 15000; // 30s cloud, 15s local
    const socketTimeout = isCloudEnvironment ? 60000 : 30000; // 60s cloud, 30s local
    
    if (port === 465) {
      // SSL connection (port 465) - more reliable in cloud environments like Render
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // true for 465
        auth: {
          user: this.emailUser,
          pass: cleanPassword,
        },
        tls: {
          rejectUnauthorized: true, // Verify certificate
          minVersion: 'TLSv1.2' // Require TLS 1.2 or higher
        },
        // Optimized timeout settings for cloud environments
        connectionTimeout: connectionTimeout,
        greetingTimeout: greetingTimeout,
        socketTimeout: socketTimeout,
        // Connection pool settings for better reliability
        pool: true,
        maxConnections: 1,
        maxMessages: 3,
        // Retry settings
        retry: {
          attempts: 3,
          delay: 2000
        }
      });
    } else {
      // TLS connection (port 587) - standard port
      return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // false for 587
        requireTLS: true, // Force TLS
        auth: {
          user: this.emailUser,
          pass: cleanPassword,
        },
        tls: {
          rejectUnauthorized: true, // Verify certificate
          minVersion: 'TLSv1.2' // Require TLS 1.2 or higher
        },
        // Optimized timeout settings
        connectionTimeout: connectionTimeout,
        greetingTimeout: greetingTimeout,
        socketTimeout: socketTimeout,
        // Connection pool settings for better reliability
        pool: true,
        maxConnections: 1,
        maxMessages: 3,
        // Retry settings
        retry: {
          attempts: 3,
          delay: 2000
        }
      });
    }
  }



  // Generate HTML email template for invoice
  generateInvoiceEmailHTML(invoiceData, patientData, paymentLink = '') {
    
    const itemsHTML = invoiceData.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.description}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.code || '-'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${item.total.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice #${invoiceData.invoiceNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .invoice-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .items-table th { background: #f3f4f6; padding: 10px; text-align: left; }
          .total-section { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .payment-button { 
            display: inline-block; 
            background: #10b981; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: bold; 
            margin: 20px 0;
          }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Medical Invoice</h1>
            <p>Invoice #${invoiceData.invoiceNumber}</p>
          </div>
          
          <div class="content">
            <div class="invoice-details">
              <h2>Patient Information</h2>
              <p><strong>Name:</strong> ${patientData.firstName} ${patientData.lastName}</p>
              <p><strong>Invoice Date:</strong> ${new Date(invoiceData.dateIssued).toLocaleDateString()}</p>
              <p><strong>Due Date:</strong> ${new Date(invoiceData.dueDate).toLocaleDateString()}</p>
            </div>

            <div class="invoice-details">
              <h2>Services</h2>
              <table class="items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Code</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </div>

            <div class="total-section">
              <h2>Summary</h2>
              <p><strong>Subtotal:</strong> $${invoiceData.subtotal.toFixed(2)}</p>
              ${invoiceData.tax > 0 ? `<p><strong>Tax:</strong> $${invoiceData.tax.toFixed(2)}</p>` : ''}
              ${invoiceData.discount > 0 ? `<p><strong>Discount:</strong> -$${invoiceData.discount.toFixed(2)}</p>` : ''}
              <h3><strong>Total Amount:</strong> $${invoiceData.total.toFixed(2)}</h3>
            </div>

            <div style="text-align: center;">
              <a href="${paymentLink}" class="payment-button">
                Pay Invoice Now
              </a>
            </div>

            ${invoiceData.notes ? `
              <div class="invoice-details">
                <h2>Notes</h2>
                <p>${invoiceData.notes}</p>
              </div>
            ` : ''}

            <div class="footer">
              <p>Thank you for choosing our medical services.</p>
              <p>If you have any questions, please contact us.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Helper: Add timeout wrapper to prevent hanging
  async withTimeout(promise, timeoutMs, errorMessage) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]);
  }

  // Send invoice email - OPTIMIZED: PDF attachment removed for faster sending
  // The HTML email contains all invoice details and payment link, which is sufficient
  // Uses SendGrid if available (recommended for production), falls back to Gmail SMTP
  async sendInvoiceEmail(invoiceData, patientData, paymentLink, recipientEmail) {
    if (!this.isConfigured) {
      throw new Error('Email service is not configured. Please set either SENDGRID_API_KEY or EMAIL_USER and EMAIL_PASSWORD in your environment variables.');
    }

    // Ensure payment link exists (fallback if not provided)
    // Use centralized FRONTEND_URL from config
    const baseUrl = FRONTEND_URL;
    const finalPaymentLink = paymentLink || `${baseUrl}/payment/${invoiceData._id}`;

    const htmlContent = this.generateInvoiceEmailHTML(invoiceData, patientData, finalPaymentLink);
    const subject = `Invoice #${invoiceData.invoiceNumber} - Medical Services`;
    const fromEmail = this.emailFrom || this.emailUser;
    
    console.log(`📧 Sending invoice email to ${recipientEmail}...`);
    console.log(`   Using: ${this.useSendGrid ? 'SendGrid' : 'Gmail SMTP'}`);
    const startTime = Date.now();
    
    // Try SendGrid first if available (recommended for production)
    if (this.useSendGrid) {
      try {
        console.log('🔄 Attempting SendGrid...');
        console.log('   From:', fromEmail);
        console.log('   To:', recipientEmail);
        console.log('   Subject:', subject);
        
        const msg = {
          to: recipientEmail,
          from: fromEmail, // Must be verified in SendGrid dashboard
          subject: subject,
          html: htmlContent,
        };
        
        const result = await sgMail.send(msg);
        const duration = Date.now() - startTime;
        console.log(`✅ Invoice email sent successfully via SendGrid in ${duration}ms`);
        console.log('SendGrid response:', {
          statusCode: result[0]?.statusCode,
          headers: result[0]?.headers,
          body: result[0]?.body
        });
        return { messageId: result[0]?.headers['x-message-id'], accepted: [recipientEmail] };
      } catch (sendgridError) {
        const statusCode = sendgridError.response?.statusCode;
        const errorBody = sendgridError.response?.body;
        const errorMessage = sendgridError.message;
        
        console.error('❌ SendGrid email failed:');
        console.error('   Status Code:', statusCode);
        console.error('   Error Message:', errorMessage);
        console.error('   Error Body:', JSON.stringify(errorBody, null, 2));
        console.error('   Full Error:', sendgridError);
        
        // Parse SendGrid error for helpful messages
        if (errorBody && typeof errorBody === 'object') {
          if (errorBody.errors && Array.isArray(errorBody.errors)) {
            errorBody.errors.forEach((err, index) => {
              console.error(`   Error ${index + 1}:`, err.message || err);
            });
          }
        }
        
        // If SendGrid fails with auth errors (but not unverified sender), don't fallback to Gmail
        // Unverified sender (403) is handled separately above
        const isUnverifiedSender = errorMessage?.includes('verified Sender Identity') || 
                                   (errorBody?.errors && errorBody.errors.some(e => e.message?.includes('verified Sender Identity')));
        
        if ((statusCode === 401 || statusCode === 403) && !isUnverifiedSender) {
          const helpfulMsg = `SendGrid authentication failed (${statusCode}):\n` +
            `1. Verify your SENDGRID_API_KEY is correct\n` +
            `2. Verify the from email (${fromEmail}) is verified in SendGrid dashboard\n` +
            `3. Check API key has "Mail Send" permissions\n` +
            `Error: ${errorMessage}`;
          throw new Error(helpfulMsg);
        }
        
        // Check for common SendGrid errors
        if (errorMessage?.includes('The from address does not match a verified Sender Identity') || 
            (errorBody?.errors && errorBody.errors.some(e => e.message?.includes('verified Sender Identity')))) {
          const helpfulError = `\n\n❌ SendGrid Error: The from email address "${fromEmail}" is not verified in SendGrid.\n\n` +
            `📋 To fix this:\n` +
            `1. Go to https://app.sendgrid.com\n` +
            `2. Navigate to: Settings → Sender Authentication\n` +
            `3. Click "Verify a Single Sender"\n` +
            `4. Enter: ${fromEmail}\n` +
            `5. Complete the verification process\n` +
            `6. Check your email and click the verification link\n\n` +
            `Once verified, SendGrid will work for production emails.\n` +
            `Currently falling back to Gmail SMTP.`;
          
          console.error(helpfulError);
          
          // Don't throw error, just fallback to Gmail
          if (this.emailUser && this.emailPassword) {
            console.log('⚠️  Falling back to Gmail SMTP until SendGrid sender is verified...');
          } else {
            throw new Error(helpfulError);
          }
        }
        
        if (errorMessage?.includes('Invalid API key')) {
          throw new Error(`SendGrid Error: Invalid API key. Please verify your SENDGRID_API_KEY is correct.`);
        }
        
        // For other errors, fallback to Gmail if configured
        if (this.emailUser && this.emailPassword) {
          console.log('⚠️  SendGrid failed, falling back to Gmail SMTP...');
          console.log('   SendGrid Error:', errorMessage);
        } else {
          throw new Error(`SendGrid failed: ${errorMessage}. Gmail SMTP not configured as fallback.`);
        }
      }
    }
    
    // Use Gmail SMTP (nodemailer) as primary or fallback
    const mailOptions = {
      from: this.emailUser,
      to: recipientEmail,
      subject: subject,
      html: htmlContent,
    };
    
    // Detect cloud environment for timeout adjustment
    const isCloudEnvironment = process.env.RENDER || process.env.HEROKU || process.env.NODE_ENV === 'production';
    const timeoutMs = isCloudEnvironment ? 90000 : 45000; // 90s cloud, 45s local
    
    // For production/Render, try port 465 (SSL) FIRST as it's more reliable
    // Port 465 uses SSL which is often less blocked by firewalls
    const tryPort465First = isCloudEnvironment;
    
    let lastError = null;
    let portsToTry = tryPort465First ? [465, 587] : [587, 465];
    
    for (const port of portsToTry) {
      const portName = port === 465 ? '465 (SSL)' : '587 (TLS)';
      const isFirstAttempt = port === portsToTry[0];
      
      try {
        console.log(`🔄 Attempting connection on port ${portName}${isFirstAttempt ? ' (primary)' : ' (fallback)'}...`);
        const transporter = this.createTransporter(port);
        
        // Verify connection first (helps catch issues early)
        console.log(`🔍 Verifying SMTP connection (port ${port})...`);
        const verifyStart = Date.now();
        await transporter.verify();
        const verifyDuration = Date.now() - verifyStart;
        console.log(`✅ SMTP connection verified (port ${port}) in ${verifyDuration}ms`);
        
        // Send email with timeout wrapper
        console.log(`📤 Sending email via port ${port}...`);
        const sendPromise = transporter.sendMail(mailOptions);
        const result = await this.withTimeout(
          sendPromise,
          timeoutMs,
          `Port ${port} connection timeout after ${timeoutMs/1000} seconds`
        );
        
        const duration = Date.now() - startTime;
        console.log(`✅ Invoice email sent successfully in ${duration}ms (port ${portName}). Message ID: ${result.messageId}`);
        console.log('Email details:', {
          accepted: result.accepted,
          rejected: result.rejected,
          response: result.response?.substring(0, 100) // First 100 chars of response
        });
        
        // Close connection pool
        transporter.close();
        return result;
        
      } catch (error) {
        lastError = error;
        const isTimeoutError = error.code === 'ETIMEDOUT' || 
                             error.code === 'ETIMEOUT' || 
                             error.code === 'ECONNECTION' || 
                             error.code === 'ESOCKET' ||
                             error.message?.includes('timeout');
        
        console.error(`❌ Port ${portName} failed:`, {
          code: error.code,
          message: error.message,
          isTimeout: isTimeoutError,
          environment: isCloudEnvironment ? 'cloud (Render/Heroku)' : 'local',
          stack: isCloudEnvironment ? error.stack : undefined // Full stack in production
        });
        
        // If this was the first port and it failed, try the next one
        if (isFirstAttempt && (isTimeoutError || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAUTH')) {
          console.log(`🔄 Port ${port} failed, will try fallback port...`);
          continue; // Try next port
        } else {
          // If this was already the fallback or error is not retryable, break
          break;
        }
      }
    }
    
    // If both ports failed, throw a helpful error
    const duration = Date.now() - startTime;
    console.error(`❌ Failed to send email after ${duration}ms. Both ports (587 and 465) failed.`);
    console.error('Environment:', isCloudEnvironment ? 'Cloud (Render/Heroku)' : 'Local');
    console.error('Platform:', process.env.RENDER ? 'Render' : process.env.HEROKU ? 'Heroku' : 'Unknown');
    console.error('Last error details:', {
      code: lastError?.code,
      message: lastError?.message,
      command: lastError?.command,
      response: lastError?.response,
      responseCode: lastError?.responseCode
    });
    
    // Provide helpful error message based on error type
    if (lastError?.message?.includes('timeout') || lastError?.code === 'ETIMEDOUT' || lastError?.code === 'ECONNECTION' || lastError?.code === 'ETIMEOUT') {
      const envHint = isCloudEnvironment 
        ? '\n\n🔧 RENDER/PRODUCTION TROUBLESHOOTING:\n' +
          '1. Gmail may be blocking Render\'s IP addresses\n' +
          '2. Render may have firewall restrictions on SMTP ports\n' +
          '3. Try using SendGrid or another email service for production\n' +
          '4. Check Render logs for network errors\n' +
          '5. Verify EMAIL_USER and EMAIL_PASSWORD are set correctly in Render environment variables'
        : '\n\nCheck your internet connection and firewall settings.';
      throw new Error(`Connection timeout: Unable to connect to Gmail SMTP within ${timeoutMs/1000} seconds.${envHint}`);
    } else if (lastError?.code === 'EAUTH') {
      throw new Error('Authentication failed: Please verify your EMAIL_USER and EMAIL_PASSWORD are correct. Make sure you are using a Gmail App Password (16 characters), not your regular password. Also ensure 2-Step Verification is enabled on your Google Account.');
    } else if (lastError?.code === 'ECONNREFUSED' || lastError?.code === 'ENOTFOUND') {
      const renderHint = isCloudEnvironment 
        ? '\n\n⚠️  RENDER NETWORK ISSUE:\n' +
          'Render may be blocking outbound SMTP connections. Consider:\n' +
          '1. Using SendGrid (recommended for production)\n' +
          '2. Contacting Render support about SMTP port access\n' +
          '3. Using a different email service provider'
        : '';
      throw new Error(`Connection refused: Unable to reach Gmail SMTP server. This may be due to network restrictions or DNS issues.${renderHint}`);
    } else {
      throw new Error(`Failed to send email: ${lastError?.message || 'Unknown error'} (Code: ${lastError?.code || 'N/A'})\n\nIf on Render, Gmail SMTP may be blocked. Consider using SendGrid for production.`);
    }
  }

  // Generate PDF invoice using jsPDF
  async generateInvoicePDF(invoiceData, patientData, paymentLink = '') {
    try {
      const doc = new jsPDF();
      
      // Add header
      doc.setFontSize(24);
      doc.setTextColor(44, 62, 80);
      doc.text('INVOICE', 105, 20, { align: 'center' });
      
      // Add clinic info
      doc.setFontSize(10);
      doc.setTextColor(52, 73, 94);
      doc.text('The Wellness Studio', 20, 35);
      doc.text('3605 Long Beach Blvd Suite 101', 20, 40);
      doc.text('Long Beach, CA 90807, USA', 20, 45);
      doc.text('Phone: (562) 980-0555', 20, 50);
      doc.text('Email: billing@wellness-studio.com', 20, 55);
      
      // Add invoice details
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, 120, 35);
      doc.text(`Date: ${new Date(invoiceData.dateIssued).toLocaleDateString()}`, 120, 40);
      doc.text(`Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}`, 120, 45);
      doc.text(`Status: ${invoiceData.status.toUpperCase()}`, 120, 50);
      
      // Add patient info
      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text('Bill To:', 20, 70);
      doc.setFontSize(10);
      doc.text(`${patientData.firstName} ${patientData.lastName}`, 20, 80);
      
      if (patientData.address && patientData.address.street) {
        doc.text(patientData.address.street, 20, 85);
        const cityStateZip = `${patientData.address.city || ''}, ${patientData.address.state || ''} ${patientData.address.zipCode || ''}`.trim();
        if (cityStateZip !== ',  ') {
          doc.text(cityStateZip, 20, 90);
        }
      }
      
      if (patientData.phone) {
        doc.text(`Phone: ${patientData.phone}`, 20, 95);
      }
      
      if (patientData.email) {
        doc.text(`Email: ${patientData.email}`, 20, 100);
      }
      
      // Add items table
      const tableY = 120;
      const tableData = invoiceData.items.map(item => [
        item.description,
        item.code || '-',
        item.quantity.toString(),
        `$${item.unitPrice.toFixed(2)}`,
        `$${item.total.toFixed(2)}`
      ]);
      
      doc.autoTable({
        startY: tableY,
        head: [['Description', 'Code', 'Qty', 'Unit Price', 'Total']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [52, 73, 94],
          textColor: 255,
          fontSize: 10
        },
        bodyStyles: {
          fontSize: 9
        },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 25 },
          2: { cellWidth: 20 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 }
        }
      });
      
      // Add totals
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setTextColor(44, 62, 80);
      
      doc.text('Subtotal:', 150, finalY);
      doc.text(`$${invoiceData.subtotal.toFixed(2)}`, 170, finalY);
      
      if (invoiceData.tax > 0) {
        doc.text('Tax:', 150, finalY + 8);
        doc.text(`$${invoiceData.tax.toFixed(2)}`, 170, finalY + 8);
      }
      
      if (invoiceData.discount > 0) {
        doc.text('Discount:', 150, finalY + 16);
        doc.text(`-$${invoiceData.discount.toFixed(2)}`, 170, finalY + 16);
      }
      
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Total:', 150, finalY + 24);
      doc.text(`$${invoiceData.total.toFixed(2)}`, 170, finalY + 24);
      
      // Add payment link
      doc.setFontSize(10);
      doc.setTextColor(52, 73, 94);
      doc.text('Payment Link:', 20, finalY + 40);
      doc.setFontSize(8);
      doc.text(paymentLink, 20, finalY + 45);
      
      // Add notes if any
      if (invoiceData.notes) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Notes:', 20, finalY + 55);
        doc.setFontSize(9);
        const splitNotes = doc.splitTextToSize(invoiceData.notes, 170);
        doc.text(splitNotes, 20, finalY + 60);
      }
      
      return Buffer.from(doc.output('arraybuffer'));
    } catch (error) {
      console.error('Error generating PDF for email:', error);
      // Fallback to simple text
      const pdfContent = `
        Invoice #${invoiceData.invoiceNumber}
        
        Patient: ${patientData.firstName} ${patientData.lastName}
        Date: ${new Date(invoiceData.dateIssued).toLocaleDateString()}
        Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}
        
        Total Amount: $${invoiceData.total.toFixed(2)}
        
        Payment Link: ${paymentLink}
      `;
      
      return Buffer.from(pdfContent);
    }
  }

  // Send payment reminder - with fallback mechanism and timeout
  async sendPaymentReminder(invoiceData, patientData, paymentLink, recipientEmail) {
    if (!this.isConfigured) {
      throw new Error('Email service is not configured. Please set EMAIL_USER and EMAIL_PASSWORD in your environment variables.');
    }

    // Ensure payment link exists (fallback if not provided)
    // Use centralized FRONTEND_URL from config
    const baseUrl = FRONTEND_URL;
    const finalPaymentLink = paymentLink || `${baseUrl}/payment/${invoiceData._id}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payment Reminder</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .payment-button { 
            display: inline-block; 
            background: #10b981; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px; 
            font-weight: bold; 
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Reminder</h1>
          </div>
          <div class="content">
            <h2>Dear ${patientData.firstName} ${patientData.lastName},</h2>
            <p>This is a friendly reminder that your invoice #${invoiceData.invoiceNumber} for $${invoiceData.total.toFixed(2)} is due on ${new Date(invoiceData.dueDate).toLocaleDateString()}.</p>
            <p>Please click the button below to make your payment:</p>
            <div style="text-align: center;">
              <a href="${finalPaymentLink}" class="payment-button">
                Pay Now
              </a>
            </div>
            <p>If you have already made the payment, please disregard this reminder.</p>
            <p>Thank you for your prompt attention to this matter.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const subject = `Payment Reminder - Invoice #${invoiceData.invoiceNumber}`;
    const fromEmail = this.emailFrom || this.emailUser;
    
    console.log(`📧 Sending payment reminder to ${recipientEmail}...`);
    console.log(`   Using: ${this.useSendGrid ? 'SendGrid' : 'Gmail SMTP'}`);
    const startTime = Date.now();
    
    // Try SendGrid first if available
    if (this.useSendGrid) {
      try {
        console.log('🔄 Attempting SendGrid for payment reminder...');
        console.log('   From:', fromEmail);
        console.log('   To:', recipientEmail);
        
        const msg = {
          to: recipientEmail,
          from: fromEmail,
          subject: subject,
          html: htmlContent,
        };
        
        const result = await sgMail.send(msg);
        const duration = Date.now() - startTime;
        console.log(`✅ Payment reminder sent successfully via SendGrid in ${duration}ms`);
        return { messageId: result[0]?.headers['x-message-id'], accepted: [recipientEmail] };
      } catch (sendgridError) {
        const statusCode = sendgridError.response?.statusCode;
        const errorBody = sendgridError.response?.body;
        const errorMessage = sendgridError.message;
        
        console.error('❌ SendGrid payment reminder failed:');
        console.error('   Status Code:', statusCode);
        console.error('   Error Message:', errorMessage);
        console.error('   Error Body:', JSON.stringify(errorBody, null, 2));
        
        if (statusCode === 401 || statusCode === 403) {
          throw new Error(`SendGrid authentication failed (${statusCode}): Please verify your SENDGRID_API_KEY and from email (${fromEmail}) is verified in SendGrid dashboard.`);
        }
        
        if (errorMessage?.includes('The from address does not match a verified Sender Identity') ||
            (errorBody?.errors && errorBody.errors.some(e => e.message?.includes('verified Sender Identity')))) {
          const helpfulError = `\n\n❌ SendGrid Error: The from email "${fromEmail}" is not verified.\n\n` +
            `📋 Verify it at: https://app.sendgrid.com → Settings → Sender Authentication\n\n` +
            `Falling back to Gmail SMTP until verified.`;
          console.error(helpfulError);
          
          if (this.emailUser && this.emailPassword) {
            console.log('⚠️  Falling back to Gmail SMTP...');
          } else {
            throw new Error(helpfulError);
          }
        }
        
        // Fallback to Gmail if configured
        if (this.emailUser && this.emailPassword) {
          console.log('⚠️  SendGrid failed, falling back to Gmail SMTP...');
        } else {
          throw new Error(`SendGrid failed: ${errorMessage}. Gmail SMTP not configured.`);
        }
      }
    }
    
    // Use Gmail SMTP (nodemailer) as primary or fallback
    const mailOptions = {
      from: this.emailUser,
      to: recipientEmail,
      subject: subject,
      html: htmlContent
    };
    
    // Detect cloud environment for timeout adjustment
    const isCloudEnvironment = process.env.RENDER || process.env.HEROKU || process.env.NODE_ENV === 'production';
    const timeoutMs = isCloudEnvironment ? 90000 : 45000; // 90s cloud, 45s local
    
    // Try port 587 first (TLS)
    let lastError = null;
    
    try {
      console.log('🔄 Attempting connection on port 587 (TLS) for payment reminder...');
      const transporter = this.createTransporter(587);
      
      // Verify connection first
      await transporter.verify();
      
      const sendPromise = transporter.sendMail(mailOptions);
      const result = await this.withTimeout(
        sendPromise,
        timeoutMs,
        `Port 587 connection timeout after ${timeoutMs/1000} seconds`
      );
      
      const duration = Date.now() - startTime;
      console.log(`✅ Payment reminder sent successfully in ${duration}ms (port 587). Message ID: ${result.messageId}`);
      
      transporter.close();
      return result;
      
    } catch (error) {
      lastError = error;
      const isTimeoutError = error.code === 'ETIMEDOUT' || 
                           error.code === 'ETIMEOUT' || 
                           error.code === 'ECONNECTION' || 
                           error.code === 'ESOCKET' ||
                           error.message?.includes('timeout');
      
      console.error('❌ Port 587 failed for payment reminder:', {
        code: error.code,
        message: error.message,
        isTimeout: isTimeoutError
      });
      
      // Try port 465 (SSL) as fallback
      if (isTimeoutError || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.log('🔄 Trying port 465 (SSL) as fallback for payment reminder...');
        
        try {
          const transporter465 = this.createTransporter(465);
          await transporter465.verify();
          
          const sendPromise465 = transporter465.sendMail(mailOptions);
          const result = await this.withTimeout(
            sendPromise465,
            timeoutMs,
            `Port 465 connection timeout after ${timeoutMs/1000} seconds`
          );
          
          const duration = Date.now() - startTime;
          console.log(`✅ Payment reminder sent successfully in ${duration}ms (port 465). Message ID: ${result.messageId}`);
          
          transporter465.close();
          return result;
          
        } catch (fallbackError) {
          console.error('❌ Port 465 also failed for payment reminder:', {
            code: fallbackError.code,
            message: fallbackError.message
          });
          lastError = fallbackError;
        }
      }
    }
    
    // If both ports failed, throw error
    const duration = Date.now() - startTime;
    console.error(`❌ Failed to send payment reminder after ${duration}ms. Both ports failed.`);
    throw lastError || new Error('Failed to send payment reminder');
  }

  // Test email configuration - tests SendGrid or Gmail SMTP
  async testConnection() {
    if (!this.isConfigured) {
      console.error('❌ Email service is not configured');
      return false;
    }

    const isCloudEnvironment = process.env.RENDER || process.env.HEROKU || process.env.NODE_ENV === 'production';
    console.log('🧪 Testing email connection...');
    console.log('  Environment:', isCloudEnvironment ? 'Cloud' : 'Local');
    console.log('  Provider:', this.useSendGrid ? 'SendGrid' : 'Gmail SMTP');

    // Test SendGrid if configured
    if (this.useSendGrid) {
      try {
        console.log('  Testing SendGrid API connection...');
        // SendGrid doesn't have a verify method, so we'll test by checking API key format
        if (!this.sendGridApiKey || this.sendGridApiKey.length < 20) {
          throw new Error('Invalid SendGrid API key format');
        }
        console.log('✅ SendGrid API key format is valid');
        console.log('  Note: Full SendGrid test requires sending a test email');
        return true;
      } catch (error) {
        console.error('❌ SendGrid test failed:', error.message);
        return false;
      }
    }

    // Test Gmail SMTP - try port 587 first
    try {
      console.log('  Testing port 587 (TLS)...');
      const transporter = this.createTransporter(587);
      await transporter.verify();
      console.log('✅ Email service is ready (port 587)');
      transporter.close();
      return true;
    } catch (error) {
      console.warn('⚠️  Port 587 test failed:', error.code || error.message);
      console.log('  Trying port 465 (SSL) as fallback...');
      
      // Try port 465 as fallback
      try {
        const transporter465 = this.createTransporter(465);
        await transporter465.verify();
        console.log('✅ Email service is ready (port 465)');
        transporter465.close();
        return true;
      } catch (fallbackError) {
        console.error('❌ Email service configuration error (both ports failed):');
        console.error('  Port 587 error:', error.code, error.message);
        console.error('  Port 465 error:', fallbackError.code, fallbackError.message);
        return false;
      }
    }
  }
}

export default new EmailService(); 
