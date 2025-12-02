import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Import Quill styles

interface FormItem {
  id: string;
  type: string;
  questionText: string;
  isRequired: boolean;
  options?: string[];
  placeholder?: string;
  instructions?: string;
  multipleLines?: boolean;
  demographicFields?: {
    fieldName: string;
    fieldType: string;
    required: boolean;
    options?: string[];
  }[];
  insuranceFields?: {
    fieldName: string;
    fieldType: string;
    required: boolean;
    options?: string[];
  }[];
  matrix?: {
    rowHeader?: string;
    columnHeaders: string[];
    columnTypes: string[];
    rows: string[];
    dropdownOptions: string[][];
    displayTextBox: boolean;
  };
  mixedControlsConfig?: {
    label: string;
    controlType: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
  }[];
  fileTypes?: string[];
  maxFileSize?: number;
  signaturePrompt?: string;
  bodyMapType?: string;
  allowPatientMarkings?: boolean;
  editorContent?: string;
}

interface FormTemplate {
  _id?: string;
  title: string;
  description: string;
  isActive: boolean;
  isPublic: boolean;
  language: string;
  items: FormItem[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Quill modules and formats configuration
const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic'],
    [{ color: ['#000000', '#ff0000', '#00ff00', '#0000ff'] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
  ],
};

const quillFormats = [
  'header',
  'bold',
  'italic',
  'color',
  'list',
  'bullet',
];

const PatientIntakeFormPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const quillRef = useRef<ReactQuill>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [formTemplate, setFormTemplate] = useState<FormTemplate | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [language, setLanguage] = useState<string>('english');
  const [Loading, setLoading] = useState(false)
  const [doctors, setDoctors] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]);

  // Define filteredItems and currentQuestion before useEffect
  const filteredItems = formTemplate?.items
    .filter(item => {
      if (item.type === 'section') return true;
      if (item.questionText.includes('Language Preference')) return true;
      if (language === 'english') {
        return !item.questionText.toLowerCase().includes('español') && !item.questionText.includes('¿');
      }
      if (language === 'spanish') {
        return item.questionText.toLowerCase().includes('español') || item.questionText.includes('¿');
      }
      return true;
    })
    .sort((a, b) => a.type === 'demographics' ? -1 : b.type === 'demographics' ? 1 : 0) // demographics first
    || [];

  const currentQuestion = filteredItems[currentStep];

  // Update Quill content when currentQuestion changes
  useEffect(() => {
    if (quillRef.current && currentQuestion?.type === 'smartEditor') {
      const editor = quillRef.current.getEditor();
      editor.setContents(responses[currentQuestion.id] ? editor.clipboard.convert(responses[currentQuestion.id]) : editor.clipboard.convert('<p>Enter your response here...</p>'));
    }
  }, [currentQuestion]);

  useEffect(() => {
    if (id) {
      fetchFormTemplate();
      fetchDoctors();
    }
  }, [id]);

  // Canvas initialization for bodyMap
  useEffect(() => {
    if (currentQuestion?.type === 'bodyMap' && canvasRef.current && currentQuestion.allowPatientMarkings) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Load body map image based on bodyMapType
        const image = new Image();
        image.src = currentQuestion.bodyMapType === 'fullBody' ? '/images/full-body.png' : '/images/default-body.png';
        image.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          // Redraw existing markings
          const markings = responses[currentQuestion.id]?.markings || [];
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          markings.forEach((mark: { x: number; y: number }[]) => {
            if (mark.length > 1) {
              ctx.beginPath();
              ctx.moveTo(mark[0].x * canvas.width, mark[0].y * canvas.height);
              for (let i = 1; i < mark.length; i++) {
                ctx.lineTo(mark[i].x * canvas.width, mark[i].y * canvas.height);
              }
              ctx.stroke();
            }
          });
        };
      }
    }
  }, [currentStep, responses, currentQuestion]);

  const fetchDoctors = async () => {
    try {
      const response = await axios.get('/api/auth/doctors');
      setDoctors(response.data);
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const fetchFormTemplate = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/form-templates/${id}`);
      const formData = response.data;

      if (formData && Array.isArray(formData.items)) {
        formData.items = formData.items.map((item: any, index: number) => {
          let correctedType = item.type || 'openAnswer';
          if (item.questionText.toLowerCase().includes('(section)')) {
            correctedType = 'section';
          } else if (item.questionText.toLowerCase().includes('upload') || item.questionText.toLowerCase().includes('image')) {
            correctedType = 'fileAttachment';
          } else if (item.questionText.toLowerCase().includes('signature')) {
            correctedType = 'eSignature';
          } else if (item.questionText.toLowerCase().includes('check the boxes') || item.questionText.toLowerCase().includes('select one or more')) {
            correctedType = 'multipleChoiceMultiple';
          } else if (item.questionText.toLowerCase().includes('language preference')) {
            correctedType = 'multipleChoiceSingle';
          }

          return {
            ...item,
            id: item.id || `q_${Math.random().toString(36).substring(2, 15)}`,
            questionText: item.questionText || 'Untitled Question',
            type: correctedType,
            isRequired: item.isRequired ?? false,
            options: correctedType === 'multipleChoiceSingle' || correctedType === 'multipleChoiceMultiple' ? item.options || ['Yes', 'No'] : item.options,
            fileTypes: correctedType === 'fileAttachment' ? item.fileTypes || ['image/jpeg', 'image/png', 'application/pdf'] : item.fileTypes,
            maxFileSize: correctedType === 'fileAttachment' ? item.maxFileSize || 5 : item.maxFileSize,
            bodyMapType: correctedType === 'bodyMap' ? item.bodyMapType || 'fullBody' : item.bodyMapType,
            allowPatientMarkings: correctedType === 'bodyMap' ? item.allowPatientMarkings ?? true : item.allowPatientMarkings,
            editorContent: correctedType === 'smartEditor' ? item.editorContent || '<p>Enter your content here...</p>' : item.editorContent,
          };
        });
      } else {
        console.error('Invalid form data: items array is missing or invalid');
        setFormTemplate(null);
        return;
      }

      setFormTemplate(formData);
    } catch (error) {
      console.error('Error fetching form template:', error);
      setFormTemplate(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (
    questionId: string,
    value: any,
    fieldName?: string,
    rowIndex?: number,
    columnIndex?: number,
    controlIndex?: number
  ) => {
    if (fieldName) {
      setResponses(prev => ({
        ...prev,
        [`${questionId}_${fieldName}`]: value,
      }));
    } else if (rowIndex !== undefined && columnIndex !== undefined) {
      const responseKey = `${questionId}_${rowIndex}_${columnIndex}`;
      setResponses(prev => {
        const newResponses = { ...prev };
        newResponses[responseKey] = value;

        const existingMatrixResponses = Array.isArray(newResponses[questionId]) ? newResponses[questionId].filter((item: any) => !(item.rowIndex === rowIndex && item.columnIndex === columnIndex)) : [];

        newResponses[questionId] = [...existingMatrixResponses, { rowIndex, columnIndex, value }];
        return newResponses;
      });
    } else if (controlIndex !== undefined) {
      setResponses(prev => ({
        ...prev,
        [`${questionId}_${controlIndex}`]: value,
      }));
    } else if (Array.isArray(value) && questionId !== currentQuestion?.id) {
      setResponses(prev => ({
        ...prev,
        [questionId]: value,
      }));
    } else if (questionId === currentQuestion?.id && currentQuestion.type === 'bodyMap') {
      setResponses(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], ...value },
      }));
    } else {
      setResponses(prev => ({
        ...prev,
        [questionId]: value,
      }));
    }
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    setCurrentStep(0);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentQuestion?.type === 'bodyMap' && currentQuestion.allowPatientMarkings && canvasRef.current) {
      setIsDrawing(true);
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvas.width;
      const y = (e.clientY - rect.top) / canvas.height;
      const currentMarkings = responses[currentQuestion.id]?.markings || [];
      currentMarkings.push([{ x, y }]);
      handleInputChange(currentQuestion.id, { markings: currentMarkings, description: responses[currentQuestion.id]?.description || '' });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && currentQuestion?.type === 'bodyMap' && currentQuestion.allowPatientMarkings && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / canvas.width;
      const y = (e.clientY - rect.top) / canvas.height;
      const currentMarkings = responses[currentQuestion.id]?.markings || [];
      const currentPath = currentMarkings[currentMarkings.length - 1];
      currentPath.push({ x, y });
      handleInputChange(currentQuestion.id, { markings: currentMarkings, description: responses[currentQuestion.id]?.description || '' });

      if (ctx) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x * canvas.width, currentPath[0].y * canvas.height);
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x * canvas.width, currentPath[i].y * canvas.height);
        }
        ctx.stroke();
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDrawing(false);
  };

  const handleNext = () => {
    if (!formTemplate) return;

    if (!currentQuestion) {
      console.error('Current question is undefined in handleNext', { currentStep, filteredItems });
      if (currentStep < filteredItems.length - 1) {
        setCurrentStep(currentStep + 1);
      }
      return;
    }

    if (currentQuestion.isRequired && currentQuestion.type !== 'section') {
      if ((currentQuestion.type === 'blank' || currentQuestion.type === 'openAnswer' || currentQuestion.type === 'smartEditor') && !responses[currentQuestion.id]) {
        alert('This question is required');
        return;
      }
      if (currentQuestion.type === 'demographics' && currentQuestion.demographicFields) {
        for (const field of currentQuestion.demographicFields.filter(f => f.required)) {
          if (!responses[`${currentQuestion.id}_${field.fieldName}`]) {
            alert(`${field.fieldName} is required`);
            return;
          }
        }
        if (!responses[`${currentQuestion.id}_assignedDoctor`] && !responses['assignedDoctor']) {
          alert('Assigned Doctor is required');
          return;
        }
      }
      if ((currentQuestion.type === 'primaryInsurance' || currentQuestion.type === 'secondaryInsurance') && currentQuestion.insuranceFields) {
        for (const field of currentQuestion.insuranceFields.filter(f => f.required)) {
          if (!responses[`${currentQuestion.id}_${field.fieldName}`]) {
            alert(`${field.fieldName} is required`);
            return;
          }
        }
      }
      if (currentQuestion.type === 'eSignature' && !responses[currentQuestion.id]) {
        alert('Signature is required');
        return;
      }
      if (currentQuestion.type === 'bodyMap' && (!responses[currentQuestion.id]?.markings || responses[currentQuestion.id].markings.length === 0) && !responses[currentQuestion.id]?.description) {
        alert('Please provide markings or a description for the body map');
        return;
      }
      if (currentQuestion.type === 'multipleChoiceSingle' && !responses[currentQuestion.id]) {
        alert('Please select an option');
        return;
      }
      if (currentQuestion.type === 'multipleChoiceMultiple' && (!responses[currentQuestion.id] || responses[currentQuestion.id].length === 0)) {
        alert('Please select at least one option');
        return;
      }
      if (currentQuestion.type === 'fileAttachment' && !responses[currentQuestion.id]) {
        alert('Please upload a file');
        return;
      }
      if (currentQuestion.type === 'date' && !responses[currentQuestion.id]) {
        alert('Please select a date');
        return;
      }
      if (currentQuestion.type === 'mixedControls' && currentQuestion.mixedControlsConfig) {
        for (const control of currentQuestion.mixedControlsConfig.filter(c => c.required)) {
          if (!responses[`${currentQuestion.id}_${currentQuestion.mixedControlsConfig.indexOf(control)}`]) {
            alert(`${control.label} is required`);
            return;
          }
        }
      }
    }

    if (currentStep < filteredItems.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

 
const handleSubmit = async () => {
  setLoading(true)
  if (!formTemplate) return;

  // final on-page required check for current question
  if (currentQuestion?.isRequired && currentQuestion.type !== 'section') {
    if ((currentQuestion.type === 'blank' || currentQuestion.type === 'openAnswer' || currentQuestion.type === 'smartEditor') && !responses[currentQuestion.id]) {
      alert('This question is required');
      return;
    }
    if (currentQuestion.type === 'bodyMap' && (!responses[currentQuestion.id]?.markings?.length) && !responses[currentQuestion.id]?.description) {
      alert('Please provide markings or a description for the body map');
      return;
    }
  }

  try {
    // 1) Build formattedResponses (same as before) BUT do not embed File objects
    const formattedResponses = formTemplate.items
      .filter(item => !item.questionText.includes('Language Preference') && item.type !== 'section')
      .map(question => {
        const qid = question.id;
        const type = question.type;
        const record: any = { questionId: qid, questionType: type, questionText: question.questionText };

        if (type === 'blank' || type === 'openAnswer' || type === 'smartEditor') {
          record.answer = responses[qid] || '';
        } else if (type === 'demographics') {
          record.answer = {};
          question.demographicFields?.forEach(field => {
            const k = `${qid}_${field.fieldName}`;
            if (responses[k]) record.answer[field.fieldName] = responses[k];
          });
          if (responses[`${qid}_assignedDoctor`] || responses['assignedDoctor']) {
            record.answer['assignedDoctor'] = responses[`${qid}_assignedDoctor`] || responses['assignedDoctor'];
          }
        } else if (type === 'primaryInsurance' || type === 'secondaryInsurance') {
          record.answer = {};
          question.insuranceFields?.forEach(field => {
            const k = `${qid}_${field.fieldName}`;
            if (responses[k]) record.answer[field.fieldName] = responses[k];
          });
        } else if (type === 'allergies' || type === 'matrix' || type === 'matrixSingleAnswer') {
          const matrixResponses = Array.isArray(responses[qid])
            ? responses[qid].filter((item: any) => item && typeof item.rowIndex === 'number' && typeof item.columnIndex === 'number' && item.value !== undefined)
            : [];
          record.matrixResponses = matrixResponses;
          if (responses[`${qid}_additionalInfo`]) record.additionalInfo = responses[`${qid}_additionalInfo`];
        } else if (type === 'multipleChoiceSingle') {
          record.answer = responses[qid] || '';
        } else if (type === 'multipleChoiceMultiple') {
          record.answer = Array.isArray(responses[qid]) ? responses[qid] : [];
        } else if (type === 'date') {
          record.answer = responses[qid] || '';
        } else if (type === 'fileAttachment') {
          // IMPORTANT: DO NOT put File objects here. Backend will attach uploaded URLs.
          record.fileAttachments = []; 
        } else if (type === 'eSignature') {
          record.signature = responses[qid] || null;
        } else if (type === 'bodyMap') {
          record.bodyMapMarkings = responses[qid]?.markings || [];
          record.description = responses[qid]?.description || '';
        } else if (type === 'mixedControls') {
          record.mixedControlsResponses = question.mixedControlsConfig?.map((_, idx) => ({
            index: idx,
            value: responses[`${qid}_${idx}`] || '',
          })) || [];
        } else {
          record.answer = responses[qid] || '';
        }

        return record;
      })
      .filter(r =>
        r.answer ||
        (r.matrixResponses && r.matrixResponses.length) ||
        (r.fileAttachments && r.fileAttachments.length) ||
        r.signature ||
        (r.bodyMapMarkings && r.bodyMapMarkings.length) ||
        (r.mixedControlsResponses && r.mixedControlsResponses.length) ||
        r.description
      );

    if (formattedResponses.length === 0) {
      alert('No responses to submit. Please fill out at least one question.');
      return;
    }

    // 2) Create patient if demographics present
    const demographicQuestion = formTemplate.items.find(item => item.type === 'demographics');
    let patientId: string | null = null;

    if (demographicQuestion && demographicQuestion.demographicFields) {
      const pd = {
        dynamicData: {
          firstName: responses[`${demographicQuestion.id}_firstName`] || '',
          lastName: responses[`${demographicQuestion.id}_lastName`] || '',
          dateOfBirth: responses[`${demographicQuestion.id}_dateOfBirth`] || '',
          gender: responses[`${demographicQuestion.id}_gender`] || '',
          email: responses[`${demographicQuestion.id}_email`] || '',
          phone: responses[`${demographicQuestion.id}_phone`] || '',
          address: {
            street: responses[`${demographicQuestion.id}_street`] || '',
            city: responses[`${demographicQuestion.id}_city`] || '',
            state: responses[`${demographicQuestion.id}_state`] || '',
            zipCode: responses[`${demographicQuestion.id}_zipCode`] || '',
            country: 'USA',
          },
          medicalHistory: { allergies: [], medications: [], conditions: [], surgeries: [], familyHistory: [] },
          subjective: {
            fullName: '', date: '', physical: [], sleep: [], cognitive: [], digestive: [], emotional: [],
            bodyPart: [], severity: '', quality: [], timing: '', context: '', exacerbatedBy: [], symptoms: [],
            notes: '', radiatingTo: '', radiatingRight: false, radiatingLeft: false, sciaticaRight: false, sciaticaLeft: false,
          },
        },
        assignedDoctor: responses[`${demographicQuestion.id}_assignedDoctor`] || responses['assignedDoctor'] || '',
      };

      if (!pd.assignedDoctor) {
        alert('Assigned Doctor is required');
        return;
      }

      try {
        const patientResponse = await axios.post('/api/patients', pd);
        patientId = patientResponse.data.patient.id;
      } catch (err) {
        console.error('Error creating patient:', err);
        alert('Error creating patient record. Please check the form and try again.');
        return;
      }
    }

    if (demographicQuestion && !patientId) {
      console.error('Missing patientId for form with demographics');
      alert('Error processing patient information. Please try again.');
      return;
    } 

    // 3) Build multipart/form-data
    const formData = new FormData();

    // Append JSON "payload" (non-file data)
    const payload = {
      formTemplate: id,
      patient: patientId,
      responses: formattedResponses,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    formData.append('payload', JSON.stringify(payload));

    // 4) Append files under field names: attachments[<questionId>]
    formTemplate.items.forEach((q) => {
      if (q.type === 'fileAttachment' && responses[q.id]) {
        const files: File[] = Array.isArray(responses[q.id]) ? responses[q.id] : [];
        files.forEach((file) => {
          formData.append(`attachments[${q.id}]`, file, file.name);
        });
      }
    });

    // 5) Send - Check if we have a token for public form submission
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token') || sessionStorage.getItem('formToken');
    
    if (token) {
      // Use token-based submission for public forms
      sessionStorage.removeItem('formToken');
      
      // For token-based submission, we need to send as JSON (not FormData)
      // File attachments will need to be handled separately or converted
      const submissionPayload = {
        formTemplate: id,
        patientId: patientId || null,
        responses: formattedResponses,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      
      // If there are file attachments, we need to handle them
      // For now, we'll send the payload and note that files need to be uploaded separately
      // In a production system, you'd want to upload files first and include URLs
      try {
        await axios.post(`/api/patients/form-submission/${token}`, submissionPayload, {
          headers: { 'Content-Type': 'application/json' },
        });
        alert('Form submitted successfully!');
        navigate(`/patients/thank-you?lang=${language}`);
      } catch (error: any) {
        console.error('Error submitting form:', error);
        alert(error.response?.data?.message || 'Error submitting form. Please try again.');
        throw error;
      }
    } else {
      // Regular authenticated submission with file uploads
      await axios.post('/api/form-responses', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Form submitted successfully!');
      navigate(patientId ? '/patients' : `/forms/templates/${id}`);
    }
  } catch (error) {
    console.error('Error submitting form:', error);
    alert('Error submitting form. Please try again.');
  } finally {
    setLoading(false)
  }
};


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!formTemplate || !formTemplate.items.length) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800">Form not found or empty</h2>
          <button
            onClick={() => navigate('/forms/templates')}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md"
          >
            Back to Templates
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    console.error('No current question at step:', currentStep, 'Filtered items:', filteredItems);
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600">Error loading question</h2>
          <p className="mt-2 text-gray-600">There was a problem loading the current question.</p>
          <button
            onClick={() => {
              if (filteredItems.length > 0) {
                setCurrentStep(0);
              } else {
                fetchFormTemplate();
              }
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md"
          >
            Restart Form
          </button>
        </div>
      </div>
    );
  }

  const progress = ((currentStep + 1) / filteredItems.length) * 100;

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="h-2 bg-gray-200">
          <div
            className="h-2 bg-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="p-6">
          <div className="text-sm text-gray-500 mb-2">
            {currentStep + 1} / {filteredItems.length}
          </div>

          <div className="mb-8">
            {currentQuestion.type === 'section' ? (
              <h2 className="text-2xl font-semibold text-gray-900">{currentQuestion.questionText.replace('(section)', '')}</h2>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900">{currentQuestion.questionText}</h1>
                {currentQuestion.instructions && (
                  <p className="mt-2 text-gray-600">{currentQuestion.instructions}</p>
                )}
              </>
            )}
          </div>

          {currentQuestion.type !== 'section' && (
            <div className="mb-8">
              {(currentQuestion.type === 'blank' || currentQuestion.type === 'openAnswer') ? (
                <div>
                  {currentQuestion.multipleLines ? (
                    <textarea
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      rows={4}
                      placeholder={currentQuestion.placeholder || 'Enter your answer here'}
                      value={responses[currentQuestion.id] || ''}
                      onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder={currentQuestion.placeholder || 'Enter your answer here'}
                      value={responses[currentQuestion.id] || ''}
                      onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                    />
                  )}
                </div>
              ) : currentQuestion.type === 'demographics' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentQuestion.demographicFields?.map((field, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.fieldName}{field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.fieldType === 'text' && (
                        <input
                          type="text"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Enter ${field.fieldName.toLowerCase()}`}
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        />
                      )}
                      {field.fieldType === 'date' && (
                        <input
                          type="date"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        />
                      )}
                      {field.fieldType === 'dropdown' && (
                        <select
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        >
                          <option value="">Select {field.fieldName}</option>
                          {field.options?.map((option, i) => (
                            <option key={i} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                  <div className="col-span-1 md:col-span-2 mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Assigned Doctor<span className="text-red-500">*</span>
                    </label>
                    <select
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      value={responses[`${currentQuestion.id}_assignedDoctor`] || responses['assignedDoctor'] || ''}
                      onChange={(e) => {
                        handleInputChange(currentQuestion.id, e.target.value, 'assignedDoctor');
                        setResponses(prev => ({
                          ...prev,
                          'assignedDoctor': e.target.value,
                        }));
                      }}
                      required
                    >
                      <option value="">Select a doctor</option>
                      {doctors.map((doctor) => (
                        <option key={doctor._id} value={doctor._id}>
                          Dr. {doctor.firstName} {doctor.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (currentQuestion.type === 'primaryInsurance' || currentQuestion.type === 'secondaryInsurance') ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentQuestion.insuranceFields?.map((field, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.fieldName}{field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.fieldType === 'text' && (
                        <input
                          type="text"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Enter ${field.fieldName.toLowerCase()}`}
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        />
                      )}
                      {field.fieldType === 'date' && (
                        <input
                          type="date"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        />
                      )}
                      {field.fieldType === 'dropdown' && (
                        <select
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          value={responses[`${currentQuestion.id}_${field.fieldName}`] || ''}
                          onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, field.fieldName)}
                        >
                          <option value="">Select {field.fieldName}</option>
                          {field.options?.map((option, i) => (
                            <option key={i} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              ) : (currentQuestion.type === 'allergies' || currentQuestion.type === 'matrix' || currentQuestion.type === 'matrixSingleAnswer') ? (
                <div>
                  {currentQuestion.matrix && (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          {currentQuestion.matrix?.rowHeader && (
                            <th className="px-3 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {currentQuestion.matrix.rowHeader}
                            </th>
                          )}
                          {currentQuestion.matrix?.columnHeaders.map((header, index) => (
                            <th key={index} className="px-3 py-2 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {currentQuestion.matrix?.rows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {currentQuestion.matrix?.rowHeader && (
                              <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-700">
                                {row}
                              </td>
                            )}
                            {currentQuestion.matrix?.columnHeaders.map((_, colIndex) => (
                              <td key={colIndex} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                                {currentQuestion.type === 'matrixSingleAnswer' ? (
                                  <div className="flex justify-center">
                                    <input
                                      type="radio"
                                      name={`${currentQuestion.id}_row_${rowIndex}`}
                                      checked={responses[`${currentQuestion.id}_${rowIndex}_selected`] === colIndex.toString()}
                                      onChange={() => {
                                        setResponses(prev => {
                                          const newResponses = { ...prev };
                                          newResponses[`${currentQuestion.id}_${rowIndex}_selected`] = colIndex.toString();
                                          const existingMatrixResponses = Array.isArray(newResponses[currentQuestion.id]) ? newResponses[currentQuestion.id].filter((item: any) => item.rowIndex !== rowIndex) : [];
                                          newResponses[currentQuestion.id] = [...existingMatrixResponses, { rowIndex, columnIndex: colIndex, value: 'selected' }];
                                          return newResponses;
                                        });
                                      }}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    />
                                  </div>
                                ) : (
                                  currentQuestion.matrix?.columnTypes[colIndex] === 'dropdown' ? (
                                    <select
                                      className="w-full p-1 border border-gray-300 rounded-md text-sm"
                                      value={responses[`${currentQuestion.id}_${rowIndex}_${colIndex}`] || ''}
                                      onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, rowIndex, colIndex)}
                                    >
                                      <option value="">Select</option>
                                      {currentQuestion.matrix?.dropdownOptions[colIndex]?.map((option, i) => (
                                        <option key={i} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      className="w-full p-1 border border-gray-300 rounded-md text-sm"
                                      value={responses[`${currentQuestion.id}_${rowIndex}_${colIndex}`] || ''}
                                      onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, rowIndex, colIndex)}
                                    />
                                  )
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {currentQuestion.matrix?.displayTextBox && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Additional Information
                      </label>
                      <textarea
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        placeholder={`Enter any additional information ${currentQuestion.type === 'allergies' ? 'about your allergies' : ''}`}
                        value={responses[`${currentQuestion.id}_additionalInfo`] || ''}
                        onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, 'additionalInfo')}
                      />
                    </div>
                  )}
                </div>
              ) : currentQuestion.type === 'multipleChoiceSingle' ? (
                <div className="space-y-3">
                  {currentQuestion.options?.map((option, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <input
                        type="radio"
                        id={`${currentQuestion.id}_option_${index}`}
                        name={`${currentQuestion.id}_options`}
                        value={option}
                        checked={responses[currentQuestion.id] === option}
                        onChange={() => handleInputChange(currentQuestion.id, option)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor={`${currentQuestion.id}_option_${index}`} className="text-gray-700">
                        {option}
                      </label>
                    </div>
                  ))}
                </div>
              ) : currentQuestion.type === 'multipleChoiceMultiple' ? (
                <div className="space-y-3">
                  {currentQuestion.options?.map((option, index) => {
                    const selectedOptions = responses[currentQuestion.id] || [];
                    const isChecked = Array.isArray(selectedOptions) && selectedOptions.includes(option);
                    return (
                      <div key={index} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`${currentQuestion.id}_option_${index}`}
                          value={option}
                          checked={isChecked}
                          onChange={(e) => {
                            const currentSelections = Array.isArray(responses[currentQuestion.id]) ? [...responses[currentQuestion.id]] : [];
                            if (e.target.checked) {
                              handleInputChange(currentQuestion.id, [...currentSelections, option]);
                            } else {
                              handleInputChange(currentQuestion.id, currentSelections.filter(item => item !== option));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={`${currentQuestion.id}_option_${index}`} className="text-gray-700">
                          {option}
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : currentQuestion.type === 'fileAttachment' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-full">
                    <label
                      htmlFor={`file-upload-${currentQuestion.id}`}
                      className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg
                          className="w-8 h-8 mb-3 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">
                          {currentQuestion.fileTypes?.length ? (currentQuestion.fileTypes.includes('all') ? 'All file types accepted' : `Allowed: ${currentQuestion.fileTypes.join(', ')}`) : 'All file types accepted'}
                        </p>
                        {currentQuestion.maxFileSize && (
                          <p className="text-xs text-gray-500">
                            Max size: {currentQuestion.maxFileSize}MB
                          </p>
                        )}
                      </div>
                      <input
                        id={`file-upload-${currentQuestion.id}`}
                        type="file"
                        className="hidden"
                        accept={currentQuestion.fileTypes && !currentQuestion.fileTypes.includes('all') ? currentQuestion.fileTypes.join(',') : undefined}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const maxSizeBytes = (currentQuestion.maxFileSize || 5) * 1024 * 1024;
                            const files = Array.from(e.target.files).filter(file => file.size <= maxSizeBytes);
                            if (files.length !== e.target.files.length) {
                              alert(`Some files exceed the maximum size of ${currentQuestion.maxFileSize || 5}MB`);
                              return;
                            }
                            handleInputChange(currentQuestion.id, files);
                          }
                        }}
                        multiple={currentQuestion.type === 'fileAttachment'}
                      />
                    </label>
                  </div>
                  {responses[currentQuestion.id] && (
                    <div className="mt-2">
                      <p className="text-sm text-gray-600">
                        Selected file(s): {Array.from(responses[currentQuestion.id] || []).map((file: File) => file.name).join(', ') || 'None'}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleInputChange(currentQuestion.id, null)}
                        className="mt-1 text-xs text-red-600 hover:text-red-800"
                      >
                        Remove file(s)
                      </button>
                    </div>
                  )}
                </div>
              ) : currentQuestion.type === 'eSignature' ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Signature{currentQuestion.isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <div className="border border-gray-300 rounded-md p-4">
                    <input
                      type="text"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Type your name to sign"
                      value={responses[currentQuestion.id] || ''}
                      onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">{currentQuestion.signaturePrompt || 'Type your name to provide an electronic signature'}</p>
                  </div>
                </div>
              ) : currentQuestion.type === 'bodyMap' ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Body Map{currentQuestion.isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <div className="border border-gray-300 rounded-md p-4">
                    {currentQuestion.allowPatientMarkings ? (
                      <>
                        <canvas
                          ref={canvasRef}
                          width={300}
                          height={500}
                          className="w-full border border-gray-300 rounded-md"
                          onMouseDown={handleCanvasMouseDown}
                          onMouseMove={handleCanvasMouseMove}
                          onMouseUp={handleCanvasMouseUp}
                          onMouseLeave={handleCanvasMouseUp}
                        />
                        <p className="text-sm text-gray-600 mt-2">Click and drag to mark areas on the body map</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-600">View-only body map (markings disabled)</p>
                    )}
                    <textarea
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 mt-2"
                      rows={3}
                      placeholder="Describe any issues related to the marked areas"
                      value={responses[currentQuestion.id]?.description || ''}
                      onChange={(e) => handleInputChange(currentQuestion.id, { markings: responses[currentQuestion.id]?.markings || [], description: e.target.value })}
                    />
                  </div>
                </div>
              ) : currentQuestion.type === 'smartEditor' ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {currentQuestion.questionText}{currentQuestion.isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <div className="border border-gray-300 rounded-md p-4">
                    <div
                      className="prose max-w-none mb-4"
                      dangerouslySetInnerHTML={{ __html: currentQuestion.editorContent || '<p>No content provided</p>' }}
                    />
                    <ReactQuill
                      ref={quillRef}
                      value={responses[currentQuestion.id] || ''}
                      onChange={(value) => handleInputChange(currentQuestion.id, value)}
                      modules={quillModules}
                      formats={quillFormats}
                      className="border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              ) : currentQuestion.type === 'date' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {currentQuestion.questionText}{currentQuestion.isRequired && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    value={responses[currentQuestion.id] || ''}
                    onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                  />
                </div>
              ) : currentQuestion.type === 'mixedControls' ? (
                <div className="space-y-4">
                  {currentQuestion.mixedControlsConfig?.length ? (
                    currentQuestion.mixedControlsConfig.map((control, index) => (
                      <div key={index} className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {control.label}{control.required && <span className="text-red-500">*</span>}
                        </label>
                        {control.controlType === 'text' && (
                          <input
                            type="text"
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder={control.placeholder || ''}
                            value={responses[`${currentQuestion.id}_${index}`] || ''}
                            onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, undefined, undefined, index)}
                          />
                        )}
                        {control.controlType === 'date' && (
                          <input
                            type="date"
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={responses[`${currentQuestion.id}_${index}`] || ''}
                            onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, undefined, undefined, index)}
                          />
                        )}
                        {control.controlType === 'textarea' && (
                          <textarea
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                            placeholder={control.placeholder || ''}
                            value={responses[`${currentQuestion.id}_${index}`] || ''}
                            onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, undefined, undefined, index)}
                          />
                        )}
                        {control.controlType === 'dropdown' && (
                          <select
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={responses[`${currentQuestion.id}_${index}`] || ''}
                            onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, undefined, undefined, index)}
                          >
                            <option value="">Select {control.label}</option>
                            {control.options?.map((option, i) => (
                              <option key={i} value={option}>{option}</option>
                            ))}
                          </select>
                        )}
                        {control.controlType === 'checkbox' && (
                          <div className="space-y-2">
                            {control.options?.map((option, optIndex) => (
                              <div key={optIndex} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`${currentQuestion.id}_${index}_option_${optIndex}`}
                                  value={option}
                                  checked={Array.isArray(responses[`${currentQuestion.id}_${index}`]) && responses[`${currentQuestion.id}_${index}`].includes(option)}
                                  onChange={(e) => {
                                    const currentSelections = Array.isArray(responses[`${currentQuestion.id}_${index}`]) ? [...responses[`${currentQuestion.id}_${index}`]] : [];
                                    if (e.target.checked) {
                                      handleInputChange(currentQuestion.id, [...currentSelections, option], undefined, undefined, undefined, index);
                                    } else {
                                      handleInputChange(currentQuestion.id, currentSelections.filter(item => item !== option), undefined, undefined, undefined, index);
                                    }
                                  }}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor={`${currentQuestion.id}_${index}_option_${optIndex}`} className="text-gray-700">
                                  {option}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                        {control.controlType === 'radio' && (
                          <div className="space-y-2">
                            {control.options?.map((option, optIndex) => (
                              <div key={optIndex} className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id={`${currentQuestion.id}_${index}_option_${optIndex}`}
                                  name={`${currentQuestion.id}_${index}_options`}
                                  value={option}
                                  checked={responses[`${currentQuestion.id}_${index}`] === option}
                                  onChange={(e) => handleInputChange(currentQuestion.id, e.target.value, undefined, undefined, undefined, index)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor={`${currentQuestion.id}_${index}_option_${optIndex}`} className="text-gray-700">
                                  {option}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-600">No controls configured for this question.</p>
                  )}
                </div>
              ) : currentQuestion.questionText.includes('Language Preference') ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="english"
                      name="language"
                      checked={language === 'english'}
                      onChange={() => handleLanguageChange('english')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="english" className="text-gray-700">I am able to complete this form in English</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="spanish"
                      name="language"
                      checked={language === 'spanish'}
                      onChange={() => handleLanguageChange('spanish')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="spanish" className="text-gray-700">Mejor puedo responder este formulario en español</label>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder={currentQuestion.placeholder || 'Enter your answer here'}
                    value={responses[currentQuestion.id] || ''}
                    onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50 flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous
            </button>

            {currentStep < filteredItems.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-blue-600 text-white rounded-md flex items-center"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-green-600 text-white rounded-md"
                disabled={Loading}
              >
                {Loading ? 'Submitting...' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientIntakeFormPreview