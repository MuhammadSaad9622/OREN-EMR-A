import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Search,
  Plus,
  Edit,
  Eye,
  Download,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  AlertTriangle,
  Send,
  CreditCard,
  Calendar,
  Filter,
  User,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  patient: Patient | string; // Can be either patient object or just the ID
  dateIssued: string;
  dueDate: string;
  total: number;
  status: string;
  appointment?: { // Add this to support paymentStatus
    paymentStatus: string;
  };
}

interface BillingListProps {
  patientId?: string;
  showPatientColumn?: boolean;
  showHeader?: boolean;
  onInvoiceCountChange?: (count: number) => void; // ✅ NEW
}


const BillingList: React.FC<BillingListProps> = ({
  patientId = '',
  showPatientColumn = true,
  showHeader = true,
  onInvoiceCountChange // ✅ NEW
}) => {

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [billingStats, setBillingStats] = useState({
    billedThisMonth: 0,
    collectedThisMonth: 0,
    outstanding: 0
  });
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchInvoices();
    fetchBillingSummary();

    // Cleanup: cancel any pending requests when component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [patientId, currentPage, statusFilter, dateRange]);



  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      let url = `/api/billing?page=${currentPage}`;

      if (searchTerm) url += `&search=${searchTerm}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (dateRange.startDate) url += `&startDate=${dateRange.startDate}`;
      if (dateRange.endDate) url += `&endDate=${dateRange.endDate}`;

      const response = await axios.get(url);
      console.log("✅ Invoice API response:", response.data); // ✅ ADD THIS

      setInvoices(response.data.invoices || []);
      setTotalPages(response.data.totalPages || 1);

      if (onInvoiceCountChange) {
        onInvoiceCountChange(response.data.invoices.length);
      }
    } catch (error) {
      console.error('❌ Error fetching invoices:', error); // ✅ LOG ERRORS
    } finally {
      setIsLoading(false);
    }
  };


  const fetchBillingSummary = async () => {
    try {
      const response = await axios.get('/api/billing/summary/dashboard');
      setBillingStats(response.data);
    } catch (error) {
      console.error('Error fetching billing summary:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchInvoices();
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to get patient name from invoice
  const getPatientName = (invoice: Invoice): string => {
    if (!invoice.patient) return 'Unknown Patient';

    if (typeof invoice.patient === 'string') {
      // If patient is just an ID, we can't show the name
      return 'Patient';
    }

    return `${invoice.patient.firstName} ${invoice.patient.lastName}`;
  };

  // Helper function to check if invoice belongs to current patient
  const isInvoiceForCurrentPatient = (invoice: Invoice): boolean => {
    if (!patientId) return true;

    if (typeof invoice.patient === 'string') {
      return invoice.patient === patientId;
    }

    return invoice.patient._id === patientId;
  };

  // Stripe integration functions
  const sendInvoiceEmail = async () => {
    if (!emailAddress || !selectedInvoice) {
      alert('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      alert('Please enter a valid email address');
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();

    try {
      setIsSendingEmail(true);
      console.log('🚀 Starting to send invoice email...');
      console.log('📧 Recipient:', emailAddress);
      console.log('📄 Invoice ID:', selectedInvoice._id);
      console.log('🔗 Endpoint:', `/api/stripe/send-invoice-email/${selectedInvoice._id}`);

      // Increased timeout for PDF generation and email sending
      const response = await axios.post(
        `/api/stripe/send-invoice-email/${selectedInvoice._id}`,
        {
          recipientEmail: emailAddress
        },
        {
          timeout: 120000, // 120 second timeout for PDF generation and email sending
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          signal: abortControllerRef.current.signal
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ Email response received in ${duration}ms:`, response.data);

      if (response.data.success) {
        // Check if email was sent or queued (async processing)
        if (response.data.data && (response.data.data.emailSent || response.data.data.emailQueued)) {
          setShowEmailModal(false);
          setSelectedInvoice(null);
          setEmailAddress('');
          if (response.data.data.emailQueued) {
            alert('Invoice email is being sent! Please allow a few moments for delivery.');
          } else {
            alert('Invoice email sent successfully!');
          }
        } else {
          // Email sending failed but API returned success
          const errorMsg = response.data.data?.error || response.data.message || 'Email sending failed';
          console.error('❌ Email sending failed:', errorMsg);
          alert(`Failed to send email: ${errorMsg}. Please check your email configuration.`);
        }
      } else {
        alert(response.data.message || 'Failed to send invoice email. Please try again.');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ Error sending invoice email after', duration, 'ms:', error);

      // Don't show error if request was aborted
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        console.log('Request was cancelled');
        return;
      }

      let errorMessage = 'Failed to send invoice email. Please try again.';

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. The email should still be sent. Please check if the email was delivered.';
      } else if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || error.response.data?.error || `Server error: ${error.response.status}`;
        console.error('Server error response:', error.response.data);
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'No response from server. Please check your internet connection and try again.';
        console.error('No response received:', error.request);
      } else {
        errorMessage = error.message || errorMessage;
      }

      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSendingEmail(false);
      abortControllerRef.current = null;
    }
  };

  const sendPaymentReminder = async () => {
    if (!emailAddress || !selectedInvoice) {
      alert('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailAddress)) {
      alert('Please enter a valid email address');
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();

    try {
      setIsSendingEmail(true);
      console.log('🚀 Starting to send payment reminder...');
      console.log('📧 Recipient:', emailAddress);
      console.log('📄 Invoice ID:', selectedInvoice._id);

      const response = await axios.post(
        `/api/stripe/send-reminder/${selectedInvoice._id}`,
        {
          recipientEmail: emailAddress
        },
        {
          timeout: 120000, // 120 second timeout for PDF generation and email sending
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          signal: abortControllerRef.current.signal
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ Reminder response received in ${duration}ms:`, response.data);

      if (response.data.success) {
        setShowEmailModal(false);
        setSelectedInvoice(null);
        setEmailAddress('');
        alert('Payment reminder sent successfully!');
      } else {
        alert(response.data.message || 'Failed to send payment reminder. Please try again.');
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('❌ Error sending payment reminder after', duration, 'ms:', error);

      // Don't show error if request was aborted
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        console.log('Request was cancelled');
        return;
      }

      let errorMessage = 'Failed to send payment reminder. Please try again.';

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. The reminder should still be sent. Please check if the email was delivered.';
      } else if (error.response) {
        errorMessage = error.response.data?.message || error.response.data?.error || `Server error: ${error.response.status}`;
        console.error('Server error response:', error.response.data);
      } else if (error.request) {
        errorMessage = 'No response from server. Please check your internet connection and try again.';
        console.error('No response received:', error.request);
      } else {
        errorMessage = error.message || errorMessage;
      }

      alert(`Error: ${errorMessage}`);
    } finally {
      setIsSendingEmail(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendEmail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowEmailModal(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showHeader && !patientId && (
          <>
            {/* Header Section */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {patientId ? 'Patient Billing' : 'Billing & Invoices'}
                  </h1>
                  <p className="text-sm text-gray-600">Manage invoices, payments, and billing records</p>
                </div>
                <Link
                  to={patientId ? `/billing/new?patientId=${patientId}` : "/billing/new"}
                  className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg shadow-md hover:from-blue-700 hover:to-blue-800 hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Create Invoice
                </Link>
              </div>

              {/* Billing Stats */}
              {!patientId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm mr-4">
                          <FileText className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">Billed This Month</p>
                          <p className="text-2xl font-bold text-gray-900">${billingStats.billedThisMonth.toFixed(2)}</p>
                        </div>
                      </div>
                      <TrendingUp className="h-5 w-5 text-blue-500" />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-sm mr-4">
                          <DollarSign className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">Collected This Month</p>
                          <p className="text-2xl font-bold text-gray-900">${billingStats.collectedThisMonth.toFixed(2)}</p>
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl shadow-sm mr-4">
                          <AlertTriangle className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">Outstanding Balance</p>
                          <p className="text-2xl font-bold text-gray-900">${billingStats.outstanding.toFixed(2)}</p>
                        </div>
                      </div>
                      <Clock className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Filters Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center mb-4">
            <Filter className="h-5 w-5 text-gray-500 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Filter & Search</h3>
          </div>
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search Invoices */}
            <div className="lg:col-span-2">
              <label htmlFor="searchInvoices" className="block text-sm font-semibold text-gray-700 mb-2">
                Search Invoices
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="searchInvoices"
                  type="text"
                  placeholder="Search by invoice number, patient name..."
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label htmlFor="statusFilter" className="block text-sm font-semibold text-gray-700 mb-2">
                Status
              </label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-all"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            {/* Date Range - Combined */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Date Range
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={dateRange.startDate}
                  onChange={handleDateRangeChange}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  placeholder="From"
                />
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={dateRange.endDate}
                  onChange={handleDateRangeChange}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
                  placeholder="To"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Content Section */}
        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-96 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
            <p className="text-gray-600 font-medium">Loading invoices...</p>
          </div>
        ) : (
          <>
            {invoices.length > 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Invoice #
                        </th>
                        {showPatientColumn && (
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                            Patient
                          </th>
                        )}
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Date Issued
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Due Date
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Payment Method
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoices
                        .filter(isInvoiceForCurrentPatient)
                        .map((invoice) => (
                          <tr key={invoice._id} className="hover:bg-blue-50/50 transition-colors duration-150 group">
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                                  <FileText className="h-5 w-5 text-white" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-semibold text-gray-900">{invoice.invoiceNumber}</div>
                                </div>
                              </div>
                            </td>
                            {showPatientColumn && (
                              <td className="px-6 py-5 whitespace-nowrap">
                                <div className="flex items-center text-sm text-gray-700">
                                  <User className="h-4 w-4 mr-2 text-gray-400" />
                                  <span>
                                    {(invoice.patient?.firstName || invoice.patient?.dynamicData?.["First Name"]) + " " +
                                      (invoice.patient?.lastName || invoice.patient?.dynamicData?.["Last Name"])}
                                  </span>
                                </div>
                              </td>
                            )}
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center text-sm text-gray-600">
                                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                                <span>{new Date(invoice.dateIssued).toLocaleDateString()}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="flex items-center text-sm text-gray-600">
                                <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                                <span>{new Date(invoice.dueDate).toLocaleDateString()}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <div className="text-sm font-bold text-gray-900">
                                ${invoice.total.toFixed(2)}
                              </div>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                                  invoice.appointment?.paymentStatus === 'paid'
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : invoice.appointment?.paymentStatus === 'overdue'
                                    ? 'bg-red-100 text-red-800 border-red-200'
                                    : invoice.appointment?.paymentStatus === 'sent'
                                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                                    : 'bg-gray-100 text-gray-800 border-gray-200'
                                }`}
                              >
                                {invoice.appointment?.paymentStatus ?
                                  invoice.appointment.paymentStatus.charAt(0).toUpperCase() + invoice.appointment.paymentStatus.slice(1) : 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                <CreditCard className="h-3 w-3 mr-1.5" />
                                {invoice?.paymentMethod?.charAt(0).toUpperCase() + invoice?.paymentMethod?.slice(1) || 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-5 whitespace-nowrap text-right">
                              <div className="flex justify-end items-center gap-2">
                                <Link
                                  to={`/billing/${invoice._id}`}
                                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-150"
                                  title="View Invoice"
                                >
                                  <Eye className="h-5 w-5" />
                                </Link>
                                {invoice.status !== 'paid' && (
                                  <Link
                                    to={`/billing/${invoice._id}/edit`}
                                    className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all duration-150"
                                    title="Edit Invoice"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </Link>
                                )}
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await axios.get(`/api/billing/${invoice._id}/download`, {
                                        responseType: 'blob'
                                      });

                                      const blob = new Blob([response.data], { type: 'application/pdf' });
                                      const url = window.URL.createObjectURL(blob);
                                      const link = document.createElement('a');
                                      link.href = url;
                                      link.download = `Invoice_${invoice.invoiceNumber}.pdf`;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      window.URL.revokeObjectURL(url);
                                    } catch (error) {
                                      console.error('Error downloading PDF:', error);
                                      alert('Failed to download PDF. Please try again.');
                                    }
                                  }}
                                  className="p-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all duration-150"
                                  title="Download Invoice"
                                >
                                  <Download className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => handleSendEmail(invoice)}
                                  className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all duration-150"
                                  title="Send Invoice Email"
                                >
                                  <Send className="h-5 w-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200 bg-gray-50">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg transition-all ${currentPage === 1
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                          }`}
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg transition-all ${currentPage === totalPages
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                          }`}
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing page <span className="font-semibold text-gray-900">{currentPage}</span> of{' '}
                          <span className="font-semibold text-gray-900">{totalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px" aria-label="Pagination">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`relative inline-flex items-center px-3 py-2 rounded-l-lg border border-gray-300 bg-white text-sm font-medium transition-all ${currentPage === 1
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                              }`}
                          >
                            <span className="sr-only">Previous</span>
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-all ${currentPage === page
                                ? 'z-10 bg-blue-600 border-blue-600 text-white shadow-md'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                                }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`relative inline-flex items-center px-3 py-2 rounded-r-lg border border-gray-300 bg-white text-sm font-medium transition-all ${currentPage === totalPages
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-gray-700 hover:bg-gray-50 hover:shadow-sm'
                              }`}
                          >
                            <span className="sr-only">Next</span>
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="flex justify-center mb-4">
                    <div className="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center">
                      <FileText className="h-10 w-10 text-gray-400" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No invoices found</h3>
                  <p className="text-gray-600">
                    {searchTerm || statusFilter || dateRange.startDate || dateRange.endDate
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Get started by creating your first invoice.'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Email Modal */}
        {showEmailModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => {
                setShowEmailModal(false);
                setSelectedInvoice(null);
                setEmailAddress('');
              }}></div>
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-6 pt-6 pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-14 w-14 rounded-full bg-blue-100 sm:mx-0 sm:h-12 sm:w-12">
                      <Send className="h-7 w-7 text-blue-600 sm:h-6 sm:w-6" />
                    </div>
                    <div className="mt-4 text-center sm:mt-0 sm:ml-5 sm:text-left">
                      <h3 className="text-xl font-bold text-gray-900 mb-2" id="modal-title">
                        Send Invoice Email
                      </h3>
                      {selectedInvoice && (
                        <p className="text-sm text-gray-600 mb-4">
                          Invoice #{selectedInvoice.invoiceNumber}
                        </p>
                      )}
                      <div className="mt-4">
                        <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                          Recipient Email
                        </label>
                        <input
                          type="email"
                          id="email"
                          value={emailAddress}
                          onChange={(e) => setEmailAddress(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          placeholder="Enter email address"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-6 py-4 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
                  <button
                    onClick={sendInvoiceEmail}
                    disabled={isSendingEmail}
                    className="w-full inline-flex justify-center items-center rounded-lg border border-transparent shadow-sm px-5 py-2.5 bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 sm:ml-0 sm:w-auto sm:text-sm"
                  >
                    {isSendingEmail ? 'Sending...' : 'Send Invoice'}
                  </button>
                  <button
                    onClick={sendPaymentReminder}
                    disabled={isSendingEmail}
                    className="w-full inline-flex justify-center items-center rounded-lg border border-transparent shadow-sm px-5 py-2.5 bg-orange-600 text-base font-semibold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors disabled:opacity-50 sm:w-auto sm:text-sm"
                  >
                    {isSendingEmail ? 'Sending...' : 'Send Reminder'}
                  </button>
                  <button
                    onClick={() => {
                      setShowEmailModal(false);
                      setSelectedInvoice(null);
                      setEmailAddress('');
                    }}
                    className="w-full inline-flex justify-center items-center rounded-lg border border-gray-300 shadow-sm px-5 py-2.5 bg-white text-base font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingList;