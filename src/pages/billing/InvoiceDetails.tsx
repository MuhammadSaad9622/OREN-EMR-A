import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Printer, Download, Edit, Send, DollarSign, CreditCard, Mail } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { jsPDF } from 'jspdf';

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    case 'cancelled':
      return 'bg-red-100 text-red-700';
    case 'draft':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-blue-100 text-blue-700';
  }
};


interface Invoice {
  _id: string;
  invoiceNumber: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };
  visit?: {
    _id: string;
    date: string;
    visitType: string;
  };
  dateIssued: string;
  dueDate: string;
  items: {
    description: string;
    code: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: string;
  paymentHistory: {
    amount: number;
    date: string;
    method: string;
    reference: string;
    notes: string;
  }[];
  notes: string;
  stripeSessionId?: string;
  stripeCustomerId?: string;
  paymentLink?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  lastReminderSent?: string;
}
interface Appointment {
  _id: string;
  date: string | { start?: string; end?: string };
  time?: string | { start?: string; end?: string };
  doctor?: string | { _id: string; firstName?: string; lastName?: string };
  paymentStatus?: string;
}

const InvoiceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    method: 'cash',
    reference: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [AppintmentId, setAppintmentId] = useState<string>('');
  const [stripeStatus, setStripeStatus] = useState<any>(null);

  useEffect(() => {
    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`/api/billing/${id}`);
      setInvoice(response.data);
      if (response.data.appointment) {
        setAppintmentId(response.data.appointment._id || response.data.appointment);
      }
    } catch (error) {
      console.error('Error fetching invoice:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPaymentData(prev => ({ ...prev, [name]: value }));
  };

  const calculateTotalPaid = () => {
    if (!invoice?.paymentHistory || invoice.paymentHistory.length === 0) {
      return 0;
    }
    return invoice.paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
  };

  const calculateRemainingBalance = () => {
    if (!invoice) return 0;
    return invoice.total - calculateTotalPaid();
  };

  const handleRecordPayment = async () => {
    if (!invoice || !id) return;

    if (paymentData.amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    if (paymentData.amount > calculateRemainingBalance()) {
      alert('Payment amount cannot exceed the remaining balance');
      return;
    }

    try {
      const response = await axios.post(`/api/billing/${id}/payment`, paymentData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.data) {
        await fetchInvoice(); // Refresh invoice data
        setShowPaymentModal(false);
        setPaymentData({
          amount: 0,
          method: 'cash',
          reference: '',
          notes: '',
          date: new Date().toISOString().split('T')[0]
        });
        alert('Payment recorded successfully!');
      }
    } catch (error: any) {
      console.error('Error recording payment:', error);
      alert(error.response?.data?.message || 'Failed to record payment. Please try again.');
    }
  };

  const sendInvoiceEmail = async () => {
    if (!emailAddress || !id) {
      alert('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      setIsSendingEmail(true);
      const response = await axios.post(
        `/api/stripe/send-invoice-email/${id}`,
        { recipientEmail: emailAddress },
        {
          timeout: 120000, // 120 second timeout for PDF generation and email sending
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.data.success) {
        // Check if email was sent or queued (async processing)
        if (response.data.data && (response.data.data.emailSent || response.data.data.emailQueued)) {
          setShowEmailModal(false);
          setEmailAddress('');
          if (response.data.data.emailQueued) {
            alert('Invoice email is being sent! Please allow a few moments for delivery.');
          } else {
            alert('Invoice email sent successfully!');
          }
        } else {
          const errorMsg = response.data.data?.error || response.data.message || 'Email sending failed';
          alert(`Failed to send email: ${errorMsg}. Please check your email configuration.`);
        }
      } else {
        alert(response.data.message || 'Failed to send invoice email. Please try again.');
      }
    } catch (error: any) {
      console.error('Error sending invoice email:', error);
      let errorMessage = 'Failed to send invoice email. Please try again.';

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.response) {
        errorMessage = error.response.data?.message || error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'No response from server. Please check your internet connection and try again.';
      }

      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const sendPaymentReminder = async () => {
    if (!emailAddress || !id) {
      alert('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      setIsSendingEmail(true);
      const response = await axios.post(
        `/api/stripe/send-reminder/${id}`,
        { recipientEmail: emailAddress },
        {
          timeout: 120000, // 120 second timeout for PDF generation and email sending
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (response.data.success) {
        setShowEmailModal(false);
        setEmailAddress('');
        alert('Payment reminder sent successfully!');
      } else {
        alert(response.data.message || 'Failed to send payment reminder. Please try again.');
      }
    } catch (error: any) {
      console.error('Error sending payment reminder:', error);
      let errorMessage = 'Failed to send payment reminder. Please try again.';

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.response) {
        errorMessage = error.response.data?.message || error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'No response from server. Please check your internet connection and try again.';
      }

      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Invoice not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Back
        </button>
        <div className="flex space-x-2">
          <button
            onClick={() => window.print()}
            className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </button>
          <button
            onClick={() => setShowEmailModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Send className="mr-2 h-4 w-4" />
            Send Email
          </button>
          <Link
            to={`/billing/${id}/edit`}
            className="flex items-center px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div ref={printRef} className="lg:col-span-2 bg-white shadow-lg rounded-lg p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="text-gray-600 font-medium mb-2">From:</h3>
              <div className="text-gray-700">
                <p className="font-medium">Oren EMR</p>
                <p>3605 Long Beach Blvd Suite 101</p>
                <p>Long Beach, CA 90807, USA</p>
              </div>
            </div>
            <div>
              <h3 className="text-gray-600 font-medium mb-2">Bill To:</h3>
              <div className="text-gray-700">
                <p className="font-medium">
                  {invoice.patient?.firstName} {invoice.patient?.lastName}
                </p>
                {invoice.patient?.address && (
                  <>
                    {invoice.patient.address.street && <p>{invoice.patient.address.street}</p>}
                    {(invoice.patient.address.city || invoice.patient.address.state || invoice.patient.address.zipCode) && (
                      <p>
                        {invoice.patient.address.city && `${invoice.patient.address.city}, `}
                        {invoice.patient.address.state} {invoice.patient.address.zipCode}
                      </p>
                    )}
                    {invoice.patient.address.country && <p>{invoice.patient.address.country}</p>}
                  </>
                )}
                {invoice.patient?.phone && <p>Phone: {invoice.patient.phone}</p>}
                {invoice.patient?.email && <p>Email: {invoice.patient.email}</p>}
              </div>
            </div>
            <div>
              <h3 className="text-gray-600 font-medium mb-2">Invoice Details:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-gray-600 font-medium mb-1 text-sm">Invoice Date:</h4>
                  <p className="text-gray-800">{new Date(invoice.dateIssued).toLocaleDateString()}</p>
                </div>
                <div>
                  <h4 className="text-gray-600 font-medium mb-1 text-sm">Due Date:</h4>
                  <p className="text-gray-800">{new Date(invoice.dueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <h4 className="text-gray-600 font-medium mb-1 text-sm">Status:</h4>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${getStatusColor(invoice?.status)}`}
                  >
                    {invoice.status}
                  </span>
                </div>
                {invoice.visit && (
                  <div>
                    <h4 className="text-gray-600 font-medium mb-1 text-sm">Visit Date:</h4>
                    <p className="text-gray-800">{new Date(invoice.visit.date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Invoice Items */}
          <div className="mb-8">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoice.items?.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        {item.code && <p className="text-gray-500 text-xs">Code: {item.code}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-center">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right">
                      ${item.unitPrice?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right">
                      ${item.total?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invoice Summary */}
          <div className="flex justify-end">
            <div className="w-full md:w-1/2 lg:w-1/3">
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="text-gray-800">${invoice.subtotal?.toFixed(2)}</span>
                </div>
                {invoice.tax > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Tax:</span>
                    <span className="text-gray-800">${invoice.tax?.toFixed(2)}</span>
                  </div>
                )}
                {invoice.discount > 0 && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Discount:</span>
                    <span className="text-gray-800">-${invoice.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 border-t border-gray-200 mt-2">
                  <span className="text-lg font-bold text-gray-800">Total:</span>
                  <span className="text-lg font-bold text-gray-800">${invoice.total?.toFixed(2)}</span>
                </div>
                {invoice.paymentHistory && invoice.paymentHistory.length > 0 && (
                  <>
                    <div className="flex justify-between py-1 border-t border-gray-200 mt-2">
                      <span className="text-gray-600">Amount Paid:</span>
                      <span className="text-green-600">${calculateTotalPaid()?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-gray-600 font-medium">Balance Due:</span>
                      <span className="text-red-600 font-medium">${calculateRemainingBalance().toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-gray-600 font-medium mb-2">Notes:</h3>
              <p className="text-gray-800">{invoice.notes}</p>
            </div>
          )}

          {/* Payment Instructions */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-gray-600 font-medium mb-2">Payment Instructions:</h3>
            <p className="text-gray-800">
              Please make payment by the due date. We accept cash, check, and all major credit cards.
            </p>
            <p className="text-gray-800 mt-2">
              For questions regarding this invoice, please contact our billing department at (555) 123-4567 or billing@wellness-studio.com.
            </p>
          </div>
        </div>

        <div className="lg:col-span-1">
          {/* Payment Summary */}
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment Summary</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-medium">${invoice.total?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="text-green-600 font-medium">${calculateTotalPaid().toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Balance Due:</span>
                <span className="text-red-600 font-medium">${calculateRemainingBalance().toFixed(2)}</span>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <span className="text-gray-600">Status:</span>
                <span
                  className={`ml-2 px-2 py-1 text-xs rounded-full ${getStatusColor(invoice.status)}`}
                >
                  {invoice.status}
                </span>
              </div>
            </div>
            {invoice.status !== 'paid' && calculateRemainingBalance() > 0 && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="mt-6 w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Record Payment
              </button>
            )}
          </div>

          {/* Payment History */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment History</h2>
            {invoice.paymentHistory && invoice.paymentHistory.length > 0 ? (
              <div className="space-y-4">
                {invoice.paymentHistory.map((payment, index) => (
                  <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-medium">${payment.amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-600">Date:</span>
                      <span>{new Date(payment.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-600">Method:</span>
                      <span className="capitalize">{payment.method}</span>
                    </div>
                    {payment.reference && (
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-600">Reference:</span>
                        <span>{payment.reference}</span>
                      </div>
                    )}
                    {payment.notes && (
                      <div className="mt-2">
                        <span className="text-gray-600 block">Notes:</span>
                        <span className="text-sm text-gray-800">{payment.notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No payment history available</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
            </div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
              &#8203;
            </span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-100 sm:mx-0 sm:h-10 sm:w-10">
                    <DollarSign className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Record Payment</h3>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                          Amount*
                        </label>
                        <div className="relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">$</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            id="amount"
                            name="amount"
                            value={paymentData.amount}
                            onChange={handlePaymentChange}
                            className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 sm:text-sm border-gray-300 rounded-md"
                            placeholder="0.00"
                            min="0.01"
                            max={calculateRemainingBalance()}
                            required
                          />
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">USD</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="method" className="block text-sm font-medium text-gray-700 mb-1">
                          Payment Method*
                        </label>
                        <select
                          id="method"
                          name="method"
                          value={paymentData.method}
                          onChange={handlePaymentChange}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                        >
                          <option value="cash">Cash</option>
                          <option value="credit">Credit Card</option>
                          <option value="insurance">Insurance</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
                          Reference Number
                        </label>
                        <input
                          type="text"
                          id="reference"
                          name="reference"
                          value={paymentData.reference}
                          onChange={handlePaymentChange}
                          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                          placeholder="e.g., Transaction ID, Check Number"
                        />
                      </div>
                      <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <textarea
                          id="notes"
                          name="notes"
                          value={paymentData.notes}
                          onChange={handlePaymentChange}
                          rows={3}
                          className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                          placeholder="Any additional notes about this payment"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleRecordPayment}
                >
                  Record Payment
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )
      }

      {/* Stripe Status Display */}
      {stripeStatus && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Stripe Payment Status</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Status:</span> {stripeStatus.stripeStatus || stripeStatus.invoiceStatus}
            </div>
            {stripeStatus.balance !== undefined && (
              <div>
                <span className="font-medium">Balance:</span> ${stripeStatus.balance}
              </div>
            )}
            <div>
              <span className="font-medium">Email Sent:</span> {stripeStatus.emailSent ? 'Yes' : 'No'}
            </div>
            {stripeStatus.paymentLink && (
              <div className="col-span-2">
                <span className="font-medium">Payment Link:</span>
                <a
                  href={stripeStatus.paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-blue-600 hover:text-blue-800 underline"
                >
                  View Payment Link
                </a>
              </div>
            )}
          </div>
        </div>
      )
      }

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Send Invoice Email</h3>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email address"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={sendInvoiceEmail}
                  disabled={isSendingEmail}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSendingEmail ? 'Sending...' : 'Send Invoice'}
                </button>
                <button
                  onClick={sendPaymentReminder}
                  disabled={isSendingEmail}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {isSendingEmail ? 'Sending...' : 'Send Reminder'}
                </button>
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetails;