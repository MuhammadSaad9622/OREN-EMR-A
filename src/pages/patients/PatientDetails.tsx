import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../../Assets/logo.png';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import BillingList from '../billing/BillingList';
import PatientNotes from '../../components/patients/PatientNotes';
import {
  ArrowLeft,
  Calendar,
  FileText,
  DollarSign,
  Printer,
  ChevronDown,
  ChevronUp,
  Download,
  FileArchive,
  StickyNote
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

const toBase64 = async (url: string): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const drawSection = (doc: any, title: string, content: { [key: string]: any }, y: number): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text(title, margin, y);
  y += 6;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(200);
  let boxHeight = 0;
  const keys = Object.keys(content);

  keys.forEach(key => {
    const value = typeof content[key] === 'object'
      ? JSON.stringify(content[key], null, 2)
      : content[key] || 'N/A';

    const splitText = doc.splitTextToSize(`${key.replace(/([A-Z])/g, ' $1')}: ${value}`, 170);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(splitText, margin, y);
    y += splitText.length * 5 + 2;
    boxHeight += splitText.length * 5 + 2;
  });

  y += 4;
  return y;
};
const formatRestrictions = (restrictionsObj: any) => {
  if (!restrictionsObj || typeof restrictionsObj !== 'object') return 'N/A';

  const lines = [];

  if (restrictionsObj.avoidActivityWeeks) {
    lines.push(`Avoid activity for: ${restrictionsObj.avoidActivityWeeks} week(s)`);
  }

  if (restrictionsObj.liftingLimitLbs) {
    lines.push(`Lifting limit: ${restrictionsObj.liftingLimitLbs} lbs`);
  }

  if (restrictionsObj.avoidProlongedSitting !== undefined) {
    lines.push(`Avoid prolonged sitting: ${restrictionsObj.avoidProlongedSitting ? 'Yes' : 'No'}`);
  }

  return lines.length ? lines.join('\n') : 'No restrictions provided';
};

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  medicalHistory: {
    allergies: string[];
    medications: string[];
    conditions: string[];
    surgeries: string[];
    familyHistory: string[];
  };
  subjective?: {
    fullName: string;
    date: string;
    severity: string;
    timing: string;
    context: string;
    notes: string;
    quality?: string[];
    exacerbatedBy?: string[];
    symptoms?: string[];
    radiatingTo?: string;
    radiatingRight?: boolean;
    radiatingLeft?: boolean;
    sciaticaRight?: boolean;
    sciaticaLeft?: boolean;
    bodyPart: {
      part: string;
      side: string;
    }[];
  };
  attorney?: {
    name: string;
    firm: string;
    phone: string;
    email: string;
    caseNumber?: string; // <-- Add this
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country?: string; // <-- Optional, based on usage
    };
  };


  assignedDoctor: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  maritalStatus?: string;
  injuryDate?: string;
  dynamicData?: any;
}



interface Appointment {
  _id: string;
  patient: string;
  doctor: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  date: string;
  time: {
    start: string;
    end: string;
  };
  type: string;
  status: string;
  notes?: string; // Added notes field
  paymentStatus?: string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  dateIssued: string;
  dueDate: string;
  total: number;
  status: string;
}

const PatientDetails: React.FC<{}> = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState<any>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Using _ prefix to indicate this is intentionally unused
  // const [_invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchPatientData = async () => {
      setIsLoading(true);
      try {
        // Fetch patient details
        const patientResponse = await axios.get(`/api/patients/${id}`);
        setPatient(patientResponse.data);

        // Fetch patient appointments
        const appointmentsResponse = await axios.get(`/api/appointments?patient=${id}`);
        setAppointments(appointmentsResponse.data);

        // Fetch invoice count for the patient using the dedicated endpoint
        const invoiceCountResponse = await axios.get(`/api/billing/count/${id}`);
        setInvoiceCount(invoiceCountResponse.data.totalInvoices);

        // Fetch notes count for the patient
        try {
          const notesResponse = await axios.get(`/api/notes/patient/${id}`);
          setNotesCount(Array.isArray(notesResponse.data) ? notesResponse.data.length : 0);
        } catch (error) {
          console.error('Error fetching notes count:', error);
          setNotesCount(0);
        }

        const patientFormData = await axios.get(`/api/form-responses/patient-details/${id}`);
        setFormData(patientFormData.data);
        // We don't need to fetch invoices here anymore as BillingList will handle it
        // setInvoices([]); // Clear the local invoices state
      } catch (error) {
        console.error('Error fetching patient data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPatientData();
  }, [id]);

  // No toggle function needed as all sections are always expanded

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Patient_${patient?.firstName}_${patient?.lastName}`,
  });

  const generatePDF = () => {
    if (!patient) return;

    const doc = new jsPDF();

    // Add title
    doc.setFontSize(20);
    doc.text('Patient Summary', 105, 15, { align: 'center' });

    // Add patient name
    doc.setFontSize(16);
    doc.text(`${patient.firstName} ${patient.lastName}`, 105, 25, { align: 'center' });

    // Add basic info
    doc.setFontSize(12);
    doc.text(`Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}`, 20, 40);
    doc.text(`Gender: ${patient.gender}`, 20, 50);
    doc.text(`Status: ${patient.status}`, 20, 60);
    doc.text(`Email: ${patient.email}`, 20, 70);
    doc.text(`Phone: ${patient.phone}`, 20, 80);

    // Add address
    doc.text('Address:', 20, 95);
    if (patient.address.street) doc.text(`${patient.address.street}`, 30, 105);
    if (patient.address.city || patient.address.state) {
      doc.text(`${patient.address.city}, ${patient.address.state} ${patient.address.zipCode}`, 30, 115);
    }
    if (patient.address.country) doc.text(`${patient.address.country}`, 30, 125);

    // Add medical history
    doc.text('Medical History:', 20, 140);

    // Allergies
    if (patient.medicalHistory.allergies.length > 0) {
      doc.text('Allergies:', 30, 150);
      patient.medicalHistory.allergies.forEach((allergy, index) => {
        if (allergy) doc.text(`- ${allergy}`, 40, 160 + (index * 10));
      });
    }

    // Save the PDF
    doc.save(`Patient_${patient.firstName}_${patient.lastName}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-red-700">Patient not found</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate('/patients')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Patients
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center mb-4 md:mb-0">
          <button
            onClick={() => navigate('/patients')}
            className="mr-4 p-2 rounded-full hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {patient.firstName} {patient.lastName}
            </h1>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-base font-medium">
                {calculateAge(patient.dynamicData?.["Date of Birth"] || patient.dateOfBirth)} years
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-base font-medium capitalize">{patient.gender}</span>
              <span className="text-gray-400">•</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                patient.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : patient.status === 'inactive'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                {patient.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {notesCount > 0 ? (
            <button
              onClick={() => {
                setActiveTab('notes');
                // Scroll to notes section
                setTimeout(() => {
                  const notesElement = document.querySelector('[data-notes-section]');
                  if (notesElement) {
                    notesElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
              className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Check Notes ({notesCount})
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('notes')}
              disabled
              className="inline-flex items-center px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-400 bg-gray-100 cursor-not-allowed opacity-60"
            >
              <StickyNote className="mr-2 h-4 w-4" />
              Check Notes (No notes)
            </button>
          )}
          {user?.role === 'doctor' && (
            <Link
              to={`/appointments/new?patient=${id}`}
              className="inline-flex items-center px-5 py-2.5 border border-transparent rounded-lg shadow-md text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200"
            >
              <Calendar className="mr-2 h-4 w-4" />
              Schedule
            </Link>
          )}
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-5 py-2.5 border border-gray-300 rounded-lg shadow-md text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Overview
            </button>

            <button
              onClick={() => setActiveTab('appointments')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'appointments'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Appointments ({appointments.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'notes'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Notes ({notesCount})
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'billing'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Billing ({invoiceCount})
            </button>
          </nav>
        </div>
      </div>

      <div ref={printRef}>
        {activeTab === 'notes' && (
          <div className="bg-white shadow rounded-lg overflow-hidden p-6" data-notes-section>
            <PatientNotes patientId={id || ''} />
          </div>
        )}
        {activeTab === 'overview' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Patient Overview</h2>
            </div>
            <div className="px-6 py-4">
              {(() => {
                // Helper function to format field names
                const formatFieldName = (key: string): string => {
                  // Handle camelCase
                  key = key.replace(/([A-Z])/g, ' $1');
                  // Handle spaces and capitalize first letter
                  return key.split(' ').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ');
                };

                // Helper function to format field values
                const formatFieldValue = (value: any, key?: string): any => {
                  if (value === null || value === undefined || value === '') {
                    return 'N/A';
                  }
                  
                  // Handle dates
                  if (key && (key.toLowerCase().includes('date') || key.toLowerCase().includes('dob') || key.toLowerCase().includes('birth'))) {
                    try {
                      const date = new Date(value);
                      if (!isNaN(date.getTime())) {
                        const formattedDate = date.toLocaleDateString();
                        // Add age for date of birth
                        if (key.toLowerCase().includes('birth') || key.toLowerCase().includes('dob')) {
                          const age = calculateAge(value);
                          return `${formattedDate} (${age} years)`;
                        }
                        return formattedDate;
                      }
                    } catch (e) {
                      // Not a valid date
                    }
                  }

                  // Handle arrays
                  if (Array.isArray(value)) {
                    if (value.length === 0) return 'N/A';
                    // Handle array of objects (e.g., bodyPart, matrixResponses, fileAttachments)
                    if (value[0] && typeof value[0] === 'object') {
                      // Handle matrix responses
                      if (value[0].rowIndex !== undefined && value[0].columnIndex !== undefined) {
                        return value.map((item: any) => `Row ${item.rowIndex + 1}, Col ${item.columnIndex + 1}: ${item.value || 'N/A'}`).join('\n');
                      }
                      // Handle body map markings (can be array of paths or array of points)
                      if (value[0].x !== undefined && value[0].y !== undefined) {
                        // Array of point objects
                        return value.map((item: any) => 
                          `${item.type || 'Marking'} at (${item.x}, ${item.y})${item.intensity ? ` - Intensity: ${item.intensity}/10` : ''}${item.notes ? ` - ${item.notes}` : ''}`
                        ).join('\n');
                      }
                      // Handle body map markings as array of paths (array of arrays of points)
                      if (Array.isArray(value[0]) && value[0][0] && value[0][0].x !== undefined && value[0][0].y !== undefined) {
                        return value.map((path: any[], pathIndex: number) => 
                          `Path ${pathIndex + 1}: ${path.map((point: any) => `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`).join(' -> ')}`
                        ).join('\n');
                      }
                      // Handle file attachments
                      if (value[0].fileName || value[0].originalName) {
                        return value.map((file: any) => {
                          const fileName = file.fileName || file.originalName || 'Unknown file';
                          const fileSize = file.fileSize ? ` (${(file.fileSize / 1024).toFixed(2)} KB)` : '';
                          const fileUrl = file.fileUrl ? ` - ${file.fileUrl}` : '';
                          return `${fileName}${fileSize}${fileUrl}`;
                        }).join('\n');
                      }
                      // Handle mixed controls responses
                      if (value[0].controlId !== undefined || value[0].index !== undefined) {
                        return value.map((control: any) => {
                          const controlLabel = control.controlId || `Control ${(control.index || 0) + 1}`;
                          const controlValue = control.value !== null && control.value !== undefined ? control.value : 'N/A';
                          return `${controlLabel}: ${controlValue}`;
                        }).join('\n');
                      }
                      // Handle bodyPart objects
                      if (value[0].part && value[0].side) {
                        return value.map((item: any) => `${item.part} (${item.side})`).join(', ');
                      }
                      // Handle body map with description and markings
                      if (value.description || (value.markings && Array.isArray(value.markings))) {
                        let result = '';
                        if (value.description) {
                          result += `Description: ${value.description}\n`;
                        }
                      if (value.markings && Array.isArray(value.markings) && value.markings.length > 0) {
                        // Check if markings is array of paths (array of arrays) or array of points
                        if (Array.isArray(value.markings[0]) && value.markings[0][0] && value.markings[0][0].x !== undefined) {
                          // Array of paths
                          result += value.markings.map((path: any[], pathIndex: number) => 
                            `Path ${pathIndex + 1}: ${path.map((point: any) => `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`).join(' -> ')}`
                          ).join('\n');
                        } else if (value.markings[0].x !== undefined) {
                          // Array of point objects
                          result += value.markings.map((item: any) => 
                            `${item.type || 'Marking'} at (${item.x}, ${item.y})${item.intensity ? ` - Intensity: ${item.intensity}/10` : ''}${item.notes ? ` - ${item.notes}` : ''}`
                          ).join('\n');
                        }
                      }
                        return result || 'N/A';
                      }
                      // Generic object array - format nicely
                      return value.map((item: any, index: number) => {
                        if (typeof item === 'object') {
                          const entries = Object.entries(item).filter(([_, v]) => v !== null && v !== undefined && v !== '');
                          if (entries.length === 0) return `Item ${index + 1}: N/A`;
                          return `Item ${index + 1}: ${entries.map(([k, v]) => `${formatFieldName(k)}: ${v}`).join(', ')}`;
                        }
                        return `Item ${index + 1}: ${item}`;
                      }).join('\n');
                    }
                    // Handle simple arrays (strings, numbers, etc.) - like multipleChoiceMultiple
                    return value.filter(Boolean).join(', ');
                  }

                  // Handle objects
                  if (typeof value === 'object' && value !== null) {
                    // Handle body map with description and markings (when passed as object)
                    if (value.description !== undefined || (value.markings && Array.isArray(value.markings))) {
                      let result = '';
                      if (value.description) {
                        result += `Description: ${value.description}\n`;
                      }
                      if (value.markings && Array.isArray(value.markings) && value.markings.length > 0) {
                        // Check if markings is array of paths (array of arrays) or array of points
                        if (Array.isArray(value.markings[0]) && value.markings[0][0] && value.markings[0][0].x !== undefined) {
                          // Array of paths
                          result += value.markings.map((path: any[], pathIndex: number) => 
                            `Path ${pathIndex + 1}: ${path.map((point: any) => `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`).join(' -> ')}`
                          ).join('\n');
                        } else if (value.markings[0].x !== undefined) {
                          // Array of point objects
                          result += value.markings.map((item: any) => 
                            `${item.type || 'Marking'} at (${item.x}, ${item.y})${item.intensity ? ` - Intensity: ${item.intensity}/10` : ''}${item.notes ? ` - ${item.notes}` : ''}`
                          ).join('\n');
                        }
                      }
                      return result || 'N/A';
                    }
                    // Handle address objects
                    if (value.street || value.city || value.state) {
                      const parts = [];
                      if (value.street) parts.push(value.street);
                      if (value.city || value.state || value.zipCode) {
                        const cityState = [value.city, value.state, value.zipCode].filter(Boolean).join(', ');
                        if (cityState) parts.push(cityState);
                      }
                      if (value.country) parts.push(value.country);
                      return parts.length > 0 ? parts.join('\n') : 'N/A';
                    }
                    // Handle signature objects
                    if (value.signatureData || value.signedAt || (typeof value === 'object' && 'signature' in value)) {
                      const sig = value.signatureData ? value : (value.signature || value);
                      if (typeof sig === 'string') {
                        return 'Signature provided';
                      }
                      return `Signed by ${sig.signedBy || 'Unknown'} on ${sig.signedAt ? new Date(sig.signedAt).toLocaleDateString() : 'Unknown date'}`;
                    }
                    // Handle question-answer objects from dynamicData
                    if (value.question && value.answer !== undefined) {
                      return formatFieldValue(value.answer);
                    }
                    // Handle other objects - display as key-value pairs
                    const objEntries = Object.entries(value).filter(([_, v]) => v !== null && v !== undefined && v !== '');
                    if (objEntries.length === 0) return 'N/A';
                    return objEntries.map(([k, v]) => `${formatFieldName(k)}: ${formatFieldValue(v, k)}`).join('\n');
                  }

                  // Handle booleans
                  if (typeof value === 'boolean') {
                    return value ? 'Yes' : 'No';
                  }

                  // Handle HTML content (from smartEditor)
                  if (typeof value === 'string' && (value.includes('<p>') || value.includes('<div>') || value.includes('<br'))) {
                    // Strip HTML tags for display, but preserve line breaks
                    const text = value
                      .replace(/<br\s*\/?>/gi, '\n')
                      .replace(/<\/p>/gi, '\n')
                      .replace(/<\/div>/gi, '\n')
                      .replace(/<[^>]+>/g, '')
                      .trim();
                    return text || 'N/A';
                  }

                  return String(value);
                };

                // Collect all form response data
                const allFormData: { [key: string]: any } = {};

                // Process all form responses - ensure ALL questions are displayed
                if (formData && Array.isArray(formData) && formData.length > 0) {
                  formData.forEach((formResponse: any) => {
                    if (formResponse.responses && Array.isArray(formResponse.responses)) {
                      formResponse.responses.forEach((response: any) => {
                        // Skip section titles (they're not questions with answers)
                        if (response.questionType === 'sectionTitle' || response.questionType === 'section') {
                          return;
                        }

                        const questionText = response.questionText || response.question || 'Question';
                        const questionType = response.questionType || 'unknown';
                        const questionId = response.questionId || '';

                        // Check if response has any data (answer, matrix, bodyMap, files, signature, etc.)
                        const hasAnswer = response.answer !== null && response.answer !== undefined && response.answer !== '';
                        const hasMatrix = response.matrixResponses && Array.isArray(response.matrixResponses) && response.matrixResponses.length > 0;
                        const hasBodyMap = response.bodyMapMarkings && Array.isArray(response.bodyMapMarkings) && response.bodyMapMarkings.length > 0;
                        const hasMixedControls = response.mixedControlsResponses && Array.isArray(response.mixedControlsResponses) && response.mixedControlsResponses.length > 0;
                        const hasFiles = response.fileAttachments && Array.isArray(response.fileAttachments) && response.fileAttachments.length > 0;
                        const hasSignature = response.signature !== null && response.signature !== undefined && response.signature !== '';
                        const hasDescription = response.description && response.description !== '';

                        // Skip if no data at all
                        if (!hasAnswer && !hasMatrix && !hasBodyMap && !hasMixedControls && !hasFiles && !hasSignature && !hasDescription) {
                          return;
                        }

                        // Handle demographics - flatten into individual fields
                        if (questionType === 'demographics' && hasAnswer && typeof response.answer === 'object') {
                          Object.keys(response.answer).forEach(key => {
                            const value = response.answer[key];
                            if (value !== null && value !== undefined && value !== '') {
                              // Use field name as key, or combine with question text if needed
                              const fieldKey = formatFieldName(key);
                              allFormData[fieldKey] = value;
                            }
                          });
                        }
                        // Handle insurance types - prefix with insurance type
                        else if ((questionType === 'primaryInsurance' || questionType === 'secondaryInsurance' || 
                                  questionType === 'workersComp' || questionType === 'autoInsurance') && 
                                 hasAnswer && typeof response.answer === 'object') {
                          const insurancePrefix = questionType === 'primaryInsurance' ? 'Primary Insurance' :
                                                  questionType === 'secondaryInsurance' ? 'Secondary Insurance' :
                                                  questionType === 'workersComp' ? 'Workers Compensation' :
                                                  'Auto Insurance';
                          Object.keys(response.answer).forEach(key => {
                            const value = response.answer[key];
                            if (value !== null && value !== undefined && value !== '') {
                              allFormData[`${insurancePrefix} - ${formatFieldName(key)}`] = value;
                            }
                          });
                        }
                        // Handle matrix responses
                        else if (hasMatrix) {
                          allFormData[questionText] = response.matrixResponses;
                        }
                        // Handle body map with description
                        else if (hasBodyMap) {
                          let bodyMapValue = response.bodyMapMarkings;
                          if (hasDescription) {
                            bodyMapValue = {
                              description: response.description,
                              markings: response.bodyMapMarkings
                            };
                          }
                          allFormData[questionText] = bodyMapValue;
                        }
                        // Handle mixed controls
                        else if (hasMixedControls) {
                          allFormData[questionText] = response.mixedControlsResponses;
                        }
                        // Handle file attachments
                        else if (hasFiles) {
                          allFormData[questionText] = response.fileAttachments;
                        }
                        // Handle signature
                        else if (hasSignature) {
                          allFormData[questionText] = response.signature;
                        }
                        // Handle all other question types with answer field
                        // This includes: blank, openAnswer, smartEditor, multipleChoiceSingle, 
                        // multipleChoiceMultiple, date, text, dropdown, checkbox, radio, allergies, etc.
                        else if (hasAnswer) {
                          // Use question text as key, but ensure uniqueness if duplicate question texts exist
                          let key = questionText;
                          if (questionId) {
                            // If we already have this question text, append question ID to make it unique
                            if (allFormData.hasOwnProperty(key)) {
                              key = `${questionText} (${questionId})`;
                            }
                          }
                          allFormData[key] = response.answer;
                        }
                        // Handle description only (for body map without markings)
                        else if (hasDescription) {
                          allFormData[questionText] = response.description;
                        }
                      });
                    }
                  });
                }

                // Add basic patient info (not from forms but needed for context)
                if (patient.assignedDoctor) {
                  allFormData['Assigned Doctor'] = `Dr. ${patient.assignedDoctor.firstName} ${patient.assignedDoctor.lastName}`;
                }
                if (patient.status) {
                  allFormData['Status'] = patient.status;
                }
                if (patient.createdAt) {
                  allFormData['Patient Since'] = new Date(patient.createdAt).toLocaleDateString();
                }

                // If no form data exists, show message
                if (Object.keys(allFormData).length === 0) {
                  return (
                    <div className="text-center py-12">
                      <p className="text-gray-500 text-sm">No form data available for this patient.</p>
                      <p className="text-gray-400 text-xs mt-2">Please complete a patient intake form to see information here.</p>
                    </div>
                  );
                }

                // Sort keys for better organization (prioritize common fields)
                const priorityFields = [
                  'First Name', 'Last Name', 'Full Name', 'Date of Birth', 'Age',
                  'Gender', 'Sex', 'Email', 'Mobile Phone', 'Phone', 'Home Phone', 'Work Phone',
                  'Address', 'Street Address', 'City', 'State', 'Zip Code', 'Country',
                  'Status', 'Assigned Doctor', 'Patient Since'
                ];

                const sortedKeys = Object.keys(allFormData).sort((a, b) => {
                  const aIndex = priorityFields.findIndex(f => a.includes(f) || f.includes(a));
                  const bIndex = priorityFields.findIndex(f => b.includes(f) || f.includes(b));
                  
                  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                  if (aIndex !== -1) return -1;
                  if (bIndex !== -1) return 1;
                  return a.localeCompare(b);
                });

                // Display all form data in a grid
                return (
                  <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                    {sortedKeys.map((key) => {
                      const value = allFormData[key];
                      const formattedValue = formatFieldValue(value, key);
                      const displayKey = formatFieldName(key);

                      // Special handling for Status field
                      if (key === 'Status' && typeof value === 'string') {
                        return (
                          <div key={key} className="md:col-span-1">
                            <dt className="text-sm font-medium text-gray-500">{displayKey}</dt>
                            <dd className="mt-1 text-sm">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  value === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : value === 'inactive'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {value}
                              </span>
                            </dd>
                          </div>
                        );
                      }

                      // Special handling for multi-line values (addresses, notes, arrays)
                      const isMultiline = typeof formattedValue === 'string' && 
                        (formattedValue.includes('\n') || key.toLowerCase().includes('address') || 
                         key.toLowerCase().includes('note') || key.toLowerCase().includes('description'));

                      return (
                        <div key={key} className={isMultiline ? 'md:col-span-2 lg:col-span-3' : 'md:col-span-1'}>
                          <dt className="text-sm font-medium text-gray-500">{displayKey}</dt>
                          <dd className={`mt-1 text-sm text-gray-900 ${isMultiline ? 'whitespace-pre-line' : ''}`}>
                            {formattedValue}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                );
              })()}
            </div>
          </div>
        )}



        {activeTab === 'appointments' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Appointments</h2>
              <Link
                to={`/appointments/new?patient=${id}`}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Calendar className="mr-2 h-4 w-4" />
                Schedule Appointment
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {appointments.length > 0 ? (
                    appointments.map((appointment) => (
                      <tr key={appointment._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>{new Date(appointment.date).toLocaleDateString()}</div>
                          <div className="text-gray-500">
                            {appointment.time.start} - {appointment.time.end}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                          {appointment.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          Dr. {appointment.doctor.firstName} {appointment.doctor.lastName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${appointment.status === 'scheduled'
                              ? 'bg-blue-100 text-blue-800'
                              : appointment.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : appointment.status === 'cancelled'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                          >
                            {appointment.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                          <td>
                            <span
                              className={`px-2 py-1 rounded-lg text-white text-sm font-medium
                                 ${appointment.paymentStatus === 'billed' ? 'bg-blue-500' : ''}
                                 ${appointment.paymentStatus === 'Pending' ? 'bg-yellow-500' : ''}
                                 ${appointment.paymentStatus === 'Paid' ? 'bg-green-500' : ''}
                                 ${!appointment.paymentStatus ? 'bg-gray-400' : ''}`}
                            >
                              {appointment.paymentStatus || 'No status'}
                            </span>
                          </td>                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {appointment.notes || 'No notes provided'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link to={`/appointments/${appointment._id}/edit`} className="text-blue-600 hover:text-blue-900">
                            View/Edit
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                        No appointments scheduled
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">Billing & Invoices</h2>
              <Link
                to={`/billing/new?patient=${id}`}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Create Invoice
              </Link>
            </div>
            <div className="p-4">
              <BillingList
                patientId={id}
                showPatientColumn={false}
                showHeader={true}
              />

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDetails;