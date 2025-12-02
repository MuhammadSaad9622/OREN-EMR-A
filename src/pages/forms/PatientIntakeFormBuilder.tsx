import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Send, Eye, Plus, ArrowLeft, ChevronUp, ChevronDown, Copy, Trash2 } from 'lucide-react';
import PatientIntakeFormEditor from '../../components/forms/PatientIntakeFormEditor';
import SendFormModal from '../../components/forms/SendFormModal';

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

const PatientIntakeFormBuilder: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [formTemplate, setFormTemplate] = useState<FormTemplate>({
    title: 'New Patient Form',
    description: 'Patient intake form',
    isActive: true,
    isPublic: true,
    language: 'english',
    items: []
  });
  
  const [currentItemIndex, setCurrentItemIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  
  // Predefined questions from the text file
  const predefinedQuestions = [
    { id: '1', questionText: 'Language Preference', type: 'openAnswer', isRequired: false },
    { id: '2', questionText: 'Who referred you? Which hospital, clinic, urgent care and/or medical provider?', type: 'openAnswer', isRequired: false },
    { id: '3', questionText: 'Who referred you? Which hospital, clinic, urgent care and/or medical provider? ¿Es usted un paciente nuevo o ya establecido en Hand, Nerve & Microsurgery PC?', type: 'openAnswer', isRequired: false },
    { id: '4', questionText: 'Please enter your information.', type: 'demographics', isRequired: true },
    { id: '5', questionText: 'Please enter your information. Por favor, introduzca su información.', type: 'demographics', isRequired: true },
    { id: '6', questionText: 'Do you have medical insurance?', type: 'openAnswer', isRequired: true },
    { id: '7', questionText: 'Do you have medical insurance? ¿Tiene seguro médico?', type: 'openAnswer', isRequired: true },
    { id: '8', questionText: 'Primary Insurance', type: 'primaryInsurance', isRequired: true },
    { id: '9', questionText: 'Primary Insurance Seguro Primario', type: 'primaryInsurance', isRequired: true },
    { id: '10', questionText: 'Please capture a high-resolution image of the front side of your government issued identification card by positioning it on a level surface. Ensure the card occupies the majority of the camera\'s viewfinder to enhance readability.', type: 'openAnswer', isRequired: true },
    { id: '11', questionText: 'Please capture a high-resolution image of the front side of your government issued identification card by positioning it on a level surface. Ensure the card occupies the majority of the camera\'s viewfinder to enhance readability. Por favor, tome una imagen en alta resolución de la parte frontal de su tarjeta de identificación emitida por el gobierno, colocándola en una superficie nivelada. Asegúrese de que la tarjeta ocupe la mayor parte del visor de la cámara para mejorar la legibilidad.', type: 'openAnswer', isRequired: true },
    { id: '12', questionText: 'Please capture a high-resolution image of the front side and backside of your health insurance card by positioning it on a level surface. Ensure the card occupies the majority of the camera\'s viewfinder to enhance readability.', type: 'openAnswer', isRequired: true },
    { id: '13', questionText: 'Please capture a high-resolution image of the front side and backside of your health insurance card by positioning it on a level surface. Ensure the card occupies the majority of the camera\'s viewfinder to enhance readability. Por favor, tome una imagen en alta resolución de ambos lados (frontal y posterior) de su tarjeta de seguro de salud, colocándola en una superficie nivelada. Asegúrese de que la tarjeta ocupe la mayor parte del visor de la cámara para mejorar la legibilidad.', type: 'openAnswer', isRequired: true },
    { id: '14', questionText: 'Please capture a high-resolution image of your auto insurance card by positioning it on a level surface. Ensure the card occupies the majority of the camera\'s viewfinder to enhance readability. Por favor, tome una imagen en alta resolución de su tarjeta de seguro de automóvil, colocándola en una superficie nivelada. Asegúrese de que la tarjeta ocupe la mayor parte del visor de la cámara para mejorar la legibilidad.', type: 'openAnswer', isRequired: true },
    { id: '15', questionText: 'Hand Dominance, Occupation, Hobbies', type: 'openAnswer', isRequired: false },
    { id: '16', questionText: 'Hand Dominance, Occupation, Hobbies Dominancia Manual, Ocupación, Aficiones', type: 'openAnswer', isRequired: false },
    { id: '17', questionText: 'Is this visit for an established problem or a new problem?', type: 'openAnswer', isRequired: true },
    { id: '18', questionText: 'Is this visit for an established problem or a new problem? ¿Esta visita es por un problema establecido o un problema nuevo?', type: 'openAnswer', isRequired: true },
    { id: '19', questionText: 'Visit Related Details', type: 'openAnswer', isRequired: false },
    { id: '20', questionText: 'Visit Related Details Detalles Relacionados con la Visita', type: 'openAnswer', isRequired: false },
    { id: '21', questionText: 'Previous Care', type: 'openAnswer', isRequired: false },
    { id: '22', questionText: 'Previous Care Cuidados Previos', type: 'openAnswer', isRequired: false },
    { id: '23', questionText: 'Please provide as much detail as possible about the incident surrounding the injury so that I can write as detailed a note as possible to help your case. Try to Include how it happened, where it happened, care received initially and ongoing, any relevant dates.', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '24', questionText: 'Please provide as much detail as possible about the incident surrounding the injury so that I can write as detailed a note as possible to help your case. Try to Include how it happened, where it happened, care received initially and ongoing, any relevant dates. Por favor, proporcione tanto detalle como sea posible sobre el incidente que rodea la lesión para que pueda escribir una nota lo más detallada posible para ayudar en su caso. Intente incluir cómo sucedió, dónde sucedió, atención recibida inicialmente y continuada, cualquier fecha relevante.', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '25', questionText: 'How does it impact your quality of life?', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '26', questionText: 'How does it impact your quality of life? ¿Cómo afecta esto a su calidad de vida?', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '27', questionText: 'Have you had any serious conditions, illnesses, injuries, and/or hospitalizations in the past? If \'yes\', please list approximate dates. If you have none write "not applicable".', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '28', questionText: 'Have you had any serious conditions, illnesses, injuries, and/or hospitalizations in the past? If \'yes\', please list approximate dates. If you have none write "not applicable". ¿Ha tenido alguna condición seria, enfermedad, lesión y/o hospitalización en el pasado? Si es \'sí\', por favor liste las fechas aproximadas. Si no tiene ninguno, escriba "no aplica".', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '29', questionText: 'Do you have any allergies (medicines, cosmetics, environmental, foods)? If \'yes\', please describe. If you have none write "no".', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '30', questionText: 'Do you have any allergies (medicines, cosmetics, environmental, foods)? If \'yes\', please describe. ¿Tiene alguna alergia (medicamentos, cosméticos, ambientales, alimentos)? Si es \'sí\', por favor describa. Si no tiene ninguno, escriba "no".', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '31', questionText: 'Cardiovascular Please check the boxes for any condition(s) you have experienced or are experiencing:', type: 'openAnswer', isRequired: false },
    { id: '32', questionText: 'Cardiovascular Please check the boxes for any condition(s) you have experienced or are experiencing: Cardiovascular Por favor, marque las casillas de cualquier condición que haya experimentado o esté experimentando:', type: 'openAnswer', isRequired: false },
    { id: '33', questionText: 'Respiratory Please check the boxes for any condition(s) you have experienced or are experiencing:', type: 'openAnswer', isRequired: false },
    { id: '34', questionText: 'Respiratory / Respiratorio Please check the boxes for any condition(s) you have experienced or are experiencing: Por favor, marque las casillas de cualquier condición que haya experimentado o esté experimentando:', type: 'openAnswer', isRequired: false },
    { id: '35', questionText: 'Communicable Diseases Please check the boxes for any condition(s) you have experienced or are experiencing:', type: 'openAnswer', isRequired: false },
    { id: '36', questionText: 'Communicable Diseases / Enfermedades transmisibles Please check the boxes for any condition(s) you have experienced or are experiencing: Por favor, marque las casillas de cualquier condición que haya experimentado o esté experimentando:', type: 'openAnswer', isRequired: false },
    { id: '37', questionText: 'Diabetes', type: 'openAnswer', isRequired: false },
    { id: '38', questionText: 'Diabetes', type: 'openAnswer', isRequired: false },
    { id: '39', questionText: 'Please list any previous surgical procedures and any details/hardware (i.e. prosthesis, wires, internal pins/fixators). If no then press no.', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '40', questionText: 'Please list any previous surgical procedures and any details/hardware (i.e. prosthesis, wires, internal pins/fixators). Por favor, liste cualquier procedimiento quirúrgico previo y cualquier detalle/hardware (por ejemplo, prótesis, alambres, clavos/pinzas internos). Si no tiene, escriba "no".', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '41', questionText: 'Habits and Lifestyle', type: 'openAnswer', isRequired: false },
    { id: '42', questionText: 'Habits and Lifestyle Hábitos y Estilo de Vida', type: 'openAnswer', isRequired: false },
    { id: '43', questionText: 'Please list all current medications (prescription, over-the-counter, vitamins, herbs, homeopathics) and specify the date your started using it and dosage.', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '44', questionText: 'Please list all current medications (prescription, over-the-counter, vitamins, herbs, homeopathics) and specify the date your started using it and dosage. Por favor, liste todos los medicamentos actuales (prescripción, sin receta, vitaminas, hierbas, homeopáticos) y especifique la fecha en que comenzó a usarlo y la dosis.', type: 'openAnswer', isRequired: true, multipleLines: true },
    { id: '45', questionText: 'Supplements:', type: 'openAnswer', isRequired: false },
    { id: '46', questionText: 'Supplements: Suplementos:', type: 'openAnswer', isRequired: false },
    { id: '47', questionText: 'Please upload any relevant medical reports or documentation that will aid in the assessment and management of your condition. This may include, but is not limited to, imaging studies such as X-rays, MRI, or CT scans; nerve conduction studies; and clear, high-resolution photographs of your injury. Additionally, please feel free to include any other information or documentation that you believe may be pertinent to your case. Providing comprehensive and detailed information will enable us to gain a better understanding of your condition and facilitate the delivery of the highest quality care tailored to your needs.', type: 'openAnswer', isRequired: false, multipleLines: true },
    { id: '48', questionText: 'Please upload any relevant medical reports or documentation that will aid in the assessment and management of your condition. This may include, but is not limited to, imaging studies such as X-rays, MRI, or CT scans; nerve conduction studies; and clear, high-resolution photographs of your injury. Additionally, please feel free to include any other information or documentation that you believe may be pertinent to your case. Providing comprehensive and detailed information will enable us to gain a better understanding of your condition and facilitate the delivery of the highest quality care tailored to your needs. Por favor, suba cualquier informe médico relevante o documentación que ayudará en la evaluación y manejo de su condición. Esto puede incluir, pero no se limita a, estudios de imagen como rayos X, MRI o tomografías computarizadas; estudios de conducción nerviosa; y fotografías claras y en alta resolución de su lesión. Adicionalmente, no dude en incluir cualquier otra información o documentación que crea que pueda ser pertinente a su caso. Proporcionar información completa y detallada nos permitirá obtener una mejor comprensión de su condición y facilitar la entrega de la atención de la más alta calidad adaptada a sus necesidades.', type: 'openAnswer', isRequired: false, multipleLines: true },
    { id: '49', questionText: 'Communication Preferences in reference to the previous section on HIPAA Please indicate how you would like to receive communications from our office regarding your medical care, appointments, test results, or billing information. You may select one or more options:', type: 'openAnswer', isRequired: true },
    { id: '50', questionText: 'Preferencias de Comunicación en referencia a la sección anterior sobre HIPAA Indique cómo prefiere recibir comunicaciones de nuestra oficina con respecto a su atención médica, citas, resultados de exámenes o información de facturación. Puede seleccionar una o más opciones:', type: 'openAnswer', isRequired: true },
    { id: '51', questionText: 'INSURANCE AND SELF PAY (section)', type: 'openAnswer', isRequired: false },
    { id: '52', questionText: 'INSURANCE AND SELF PAY / SEGURO Y PAGO POR CUENTA PROPIA (section)', type: 'openAnswer', isRequired: false },
    { id: '53', questionText: 'Flexible Healthcare Financing (section)', type: 'openAnswer', isRequired: false },
    { id: '54', questionText: 'Flexible Healthcare Financing Spanish (section)', type: 'openAnswer', isRequired: false },
    { id: '55', questionText: 'Signature', type: 'openAnswer', isRequired: true }
  ];
  
  // Fetch form template if in edit mode
  useEffect(() => {
    if (id) {
      fetchFormTemplate();
    } else {
      // Initialize with predefined questions
      setFormTemplate(prev => ({
        ...prev,
        items: predefinedQuestions
      }));
    }
  }, [id]);

  // Close the add menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const fetchFormTemplate = async () => {
    if (!id) return; // Don't fetch if no ID (new form)
    
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/form-templates/${id}`);
      
      if (response.data) {
        // Ensure items array exists and has proper structure
        const items = response.data.items || [];
        const itemsWithIds = items.map((item: any, index: number) => ({
          ...item,
          id: item.id || `item_${index}_${Date.now()}`
        }));
        
        setFormTemplate({
          ...response.data,
          items: itemsWithIds.length > 0 ? itemsWithIds : predefinedQuestions
        });
      } else {
        // If no data, initialize with predefined questions
        setFormTemplate(prev => ({
          ...prev,
          items: predefinedQuestions
        }));
      }
    } catch (error: any) {
      console.error('Error fetching form template:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. You do not have permission to view this form.');
        navigate('/forms/templates');
      } else if (error.response?.status === 404) {
        toast.error('Form template not found.');
        navigate('/forms/templates');
      } else {
        toast.error('Failed to load form template');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    // For checkboxes
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormTemplate(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setFormTemplate(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };
  
  const addNewQuestion = (questionType: string) => {
    let newItem: FormItem;
    
    switch (questionType) {
      case 'blank': // Keep for backward compatibility
      case 'openAnswer':
        newItem = {
          id: `item_${Date.now()}`,
          type: 'openAnswer',
          questionText: 'Type your question text here',
          isRequired: false,
          placeholder: 'Enter your answer here',
          multipleLines: false
        };
        break;
      case 'demographics':
        newItem = {
          id: `item_${Date.now()}`,
          type: 'demographics',
          questionText: 'Demographics Information',
          isRequired: false,
          instructions: 'Please enter your information.',
          demographicFields: [
            { fieldName: 'First Name', fieldType: 'text', required: true },
            { fieldName: 'Last Name', fieldType: 'text', required: true },
            { fieldName: 'Date of Birth', fieldType: 'date', required: true },
            { fieldName: 'Gender', fieldType: 'dropdown', required: true, options: ['Female', 'Male', 'Non-Binary'] },
            { fieldName: 'Email', fieldType: 'text', required: true },
            { fieldName: 'Phone', fieldType: 'text', required: true }
          ]
        };
        break;
      case 'primaryInsurance':
        newItem = {
          id: `item_${Date.now()}`,
          type: 'primaryInsurance',
          questionText: 'Primary Insurance Information',
          isRequired: false,
          instructions: 'Primary Insurance',
          insuranceFields: [
            { fieldName: 'Insurance Company', fieldType: 'text', required: true },
            { fieldName: 'Member ID / Policy #', fieldType: 'text', required: true },
            { fieldName: 'Group Number', fieldType: 'text', required: false },
            { fieldName: 'Relationship to Insured', fieldType: 'dropdown', required: true, options: ['Self', 'Spouse', 'Child', 'Other'] }
          ]
        };
        break;
      case 'secondaryInsurance':
        newItem = {
          id: `item_${Date.now()}`,
          type: 'secondaryInsurance',
          questionText: 'Secondary Insurance Information',
          isRequired: false,
          instructions: 'Secondary Insurance',
          insuranceFields: [
            { fieldName: 'Insurance Company', fieldType: 'text', required: true },
            { fieldName: 'Member ID / Policy #', fieldType: 'text', required: true },
            { fieldName: 'Group Number', fieldType: 'text', required: false },
            { fieldName: 'Relationship to Insured', fieldType: 'dropdown', required: true, options: ['Self', 'Spouse', 'Child', 'Other'] }
          ]
        };
        break;
      case 'allergies':
        newItem = {
          id: `item_${Date.now()}`,
          type: 'allergies',
          questionText: 'Please enter the details of any allergies',
          isRequired: false,
          matrix: {
            rowHeader: 'Allergies',
            columnHeaders: ['Allergic To', 'Allergy Type', 'Reaction', 'Severity', 'Date of Onset', 'End Date'],
            columnTypes: ['text', 'dropdown', 'dropdown', 'dropdown', 'text', 'text'],
            rows: ['1', '2', '3'],
            dropdownOptions: [
              [], // No options for 'Allergic To' (text field)
              ['Food', 'Medication', 'Environmental', 'Other'], // Options for 'Allergy Type'
              ['Rash', 'Hives', 'Swelling', 'Anaphylaxis', 'GI Issues', 'Respiratory', 'Other'], // Options for 'Reaction'
              ['Mild', 'Moderate', 'Severe', 'Life-threatening'], // Options for 'Severity'
              [], // No options for 'Date of Onset' (text field)
              []  // No options for 'End Date' (text field)
            ],
            displayTextBox: true
          }
        };
        break;
      default:
        newItem = {
          id: `item_${Date.now()}`,
          type: 'openAnswer',
          questionText: 'Type your question text here',
          isRequired: false,
          placeholder: 'Enter your answer here',
          multipleLines: false
        };
    }
    
    const updatedItems = [...formTemplate.items, newItem];
    setFormTemplate(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Select the newly added item
    setCurrentItemIndex(updatedItems.length - 1);
    setShowAddMenu(false);
  };
  
  const updateQuestion = (index: number, updatedItem: FormItem) => {
    const updatedItems = [...formTemplate.items];
    updatedItems[index] = updatedItem;
    
    setFormTemplate(prev => ({
      ...prev,
      items: updatedItems
    }));
  };
  
  const duplicateQuestion = (index: number) => {
    const itemToDuplicate = { ...formTemplate.items[index], id: `item_${Date.now()}` };
    
    const updatedItems = [
      ...formTemplate.items.slice(0, index + 1),
      itemToDuplicate,
      ...formTemplate.items.slice(index + 1)
    ];
    
    setFormTemplate(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Select the duplicated item
    setCurrentItemIndex(index + 1);
  };
  
  const deleteQuestion = (index: number) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      const updatedItems = formTemplate.items.filter((_, i) => i !== index);
      
      setFormTemplate(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Update current item index
      if (currentItemIndex === index) {
        if (updatedItems.length > 0) {
          if (index < updatedItems.length) {
            setCurrentItemIndex(index);
          } else {
            setCurrentItemIndex(updatedItems.length - 1);
          }
        } else {
          setCurrentItemIndex(null);
        }
      } else if (currentItemIndex !== null && currentItemIndex > index) {
        setCurrentItemIndex(currentItemIndex - 1);
      }
    }
  };
  
  const moveQuestionUp = (index: number) => {
    if (index === 0) return;
    
    const updatedItems = [...formTemplate.items];
    const temp = updatedItems[index];
    updatedItems[index] = updatedItems[index - 1];
    updatedItems[index - 1] = temp;
    
    setFormTemplate(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Update current item index
    if (currentItemIndex === index) {
      setCurrentItemIndex(index - 1);
    } else if (currentItemIndex === index - 1) {
      setCurrentItemIndex(index);
    }
  };
  
  const moveQuestionDown = (index: number) => {
    if (index === formTemplate.items.length - 1) return;
    
    const updatedItems = [...formTemplate.items];
    const temp = updatedItems[index];
    updatedItems[index] = updatedItems[index + 1];
    updatedItems[index + 1] = temp;
    
    setFormTemplate(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Update current item index
    if (currentItemIndex === index) {
      setCurrentItemIndex(index + 1);
    } else if (currentItemIndex === index + 1) {
      setCurrentItemIndex(index);
    }
  };
  
  const saveFormTemplate = async () => {
    // Validate form
    if (!formTemplate.title.trim()) {
      toast.error('Form title is required');
      return;
    }
    
    if (formTemplate.items.length === 0) {
      toast.error('Form must have at least one question');
      return;
    }
    
    setIsSaving(true);
    
    try {
      let response;
      
      if (id) {
        response = await axios.put(`/api/form-templates/${id}`, formTemplate);
        toast.success('Form template updated successfully');
      } else {
        response = await axios.post('/api/form-templates', formTemplate);
        toast.success('Form template created successfully');
      }
      
      // Navigate to form templates list
      navigate('/forms/templates');
    } catch (error) {
      console.error('Error saving form template:', error);
      toast.error('Failed to save form template');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSendForm = async (data: any) => {
    try {
      await axios.post('/api/patients/send-to-client', {
        email: data.clientEmail,
        name: data.clientName,
        instructions: data.instructions,
        formTemplateId: id
      });
      
      // Success notification is handled by SendFormModal component
      setShowSendModal(false);
      return Promise.resolve();
    } catch (error) {
      console.error('Error sending form:', error);
      return Promise.reject(error);
    }
  };
  
  const handlePreview = () => {
    // Save the form first to ensure all changes are persisted
    saveFormTemplate().then(() => {
      // Open the preview in a new window/tab
      window.open(`/forms/templates/${id || 'new'}/preview`, '_blank');
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-0">
      {/* Top Navigation Bar */}
      <div className="flex items-center bg-blue-900 text-white h-12">
        <button
          onClick={() => navigate('/forms/templates')}
          className="px-4 h-full flex items-center hover:bg-blue-800"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        
        <button
          onClick={() => setShowSendModal(true)}
          className="px-4 h-full flex items-center hover:bg-blue-800 border-l border-blue-800"
        >
          <Send className="h-5 w-5 mr-2" />
          <span>Send to Client</span>
        </button>
        
        <button
          onClick={handlePreview}
          className="px-4 h-full flex items-center hover:bg-blue-800 border-l border-blue-800"
        >
          <Eye className="h-5 w-5 mr-2" />
          <span>Preview</span>
        </button>
        
        <div className="px-4 h-full flex items-center hover:bg-blue-800 border-l border-blue-800 relative" ref={menuRef}>
          <button onClick={() => setShowAddMenu(!showAddMenu)}>
            <Plus className="h-5 w-5" />
          </button>
          
          {showAddMenu && (
            <div className="absolute top-12 left-0 bg-white shadow-md rounded-md z-10 w-64">
              <button
                onClick={() => addNewQuestion('openAnswer')}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 border-b border-gray-200"
              >
                Add Open Answer Question
              </button>
              <button
                onClick={() => addNewQuestion('demographics')}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 border-b border-gray-200"
              >
                Add Demographics Question
              </button>
              <button
                onClick={() => addNewQuestion('primaryInsurance')}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 border-b border-gray-200"
              >
                Add Primary Insurance Question
              </button>
              <button
                onClick={() => addNewQuestion('secondaryInsurance')}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 border-b border-gray-200"
              >
                Add Secondary Insurance Question
              </button>
              <button
                onClick={() => addNewQuestion('allergies')}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100"
              >
                Add Allergies Question
              </button>
            </div>
          )}
        </div>
        
        <div className="flex-grow"></div>
        
        <button
          className="px-4 h-full flex items-center bg-green-600 hover:bg-green-700"
        >
          <span>Read Only</span>
        </button>
      </div>
      
      <div className="flex h-[calc(100vh-48px)]">
        {/* Left Sidebar - Questions List */}
        <div className="w-1/3 bg-gray-50 border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex items-center">
            <input
              type="checkbox"
              className="mr-2"
              disabled
            />
            <h2 className="text-blue-800 font-medium">New Patient Form (Read Only)</h2>
            <button className="ml-auto">
              <Plus className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          
          <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
            {formTemplate.items && formTemplate.items.length > 0 ? (
              formTemplate.items.map((item, index) => (
              <div 
                key={item.id} 
                className={`flex items-start p-4 border-b border-gray-200 hover:bg-gray-100 cursor-pointer ${currentItemIndex === index ? 'bg-yellow-50' : ''}`}
                onClick={() => setCurrentItemIndex(index)}
              >
                <input
                  type="checkbox"
                  className="mt-1 mr-2"
                  checked={item.isRequired}
                  onChange={(e) => {
                    const updatedItem = { ...item, isRequired: e.target.checked };
                    updateQuestion(index, updatedItem);
                  }}
                />
                <div className="flex-grow">
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-2">{index + 1}.</span>
                    <span className="text-sm">{item.questionText.length > 60 ? item.questionText.substring(0, 60) + '...' : item.questionText}</span>
                  </div>
                </div>
                <div className="flex items-center ml-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      moveQuestionUp(index);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-700"
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      moveQuestionDown(index);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-700"
                    disabled={index === formTemplate.items.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                <p>No questions added yet. Click the "+" button to add questions.</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Right Content - Question Editor */}
        <div className="w-2/3 bg-white overflow-y-auto p-6">
          {currentItemIndex !== null && formTemplate.items[currentItemIndex] ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Edit Question</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => duplicateQuestion(currentItemIndex)}
                    className="p-2 text-gray-600 hover:text-blue-600 border border-gray-300 rounded-md"
                    title="Duplicate"
                  >
                    <Copy className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => deleteQuestion(currentItemIndex)}
                    className="p-2 text-gray-600 hover:text-red-600 border border-gray-300 rounded-md"
                    title="Delete"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              
              <PatientIntakeFormEditor
                item={formTemplate.items[currentItemIndex]}
                onChange={(updatedItem) => updateQuestion(currentItemIndex, updatedItem)}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="mb-4">Select a question to edit or add a new question</p>
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2 inline" />
                Add Question
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Send Form Modal */}
      <SendFormModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSend={handleSendForm}
        formId={id}
      />
    </div>
  );
};

export default PatientIntakeFormBuilder;