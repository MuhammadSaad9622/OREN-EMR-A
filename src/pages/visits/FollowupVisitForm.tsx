import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Save, X } from 'lucide-react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
}

interface Visit {
  _id: string;
  date: string;
  visitType: string;
  __t: string;
}

// Define the interface for the form data
interface FollowupVisitFormData {
  previousVisit: string;
  areas: string;
  areasImproving: boolean;
  areasExacerbated: boolean;
  areasSame: boolean;
  musclePalpation: string;
  painRadiating: string;
  romWnlNoPain: boolean;
  romWnlWithPain: boolean;
  romImproved: boolean;
  romDecreased: boolean;
  romSame: boolean;
  orthos: {
    tests: string;
    result: string;
  };
  activitiesCausePain: string;
  activitiesCausePainOther: string;
  treatmentPlan: {
    treatments: string;
    timesPerWeek: string;
  };
  overallResponse: {
    improving: boolean;
    worse: boolean;
    same: boolean;
  };
  referrals: string;
  diagnosticStudy: {
    study: string;
    bodyPart: string;
    result: string;
  };
  homeCare: string;
  homeCareSuggestions?: string;
  notes: string;

  // ✅ ADD THIS to store modal-fetched auto data
  fetchedData?: {
    initialVisitData?: any;

    musclePalpationData?: {
      muscleStrength?: any;
      strength?: any;
      tenderness?: any;
      spasm?: any;
    };

    orthoTestsData?: {
      [region: string]: {
        [testName: string]: {
          left: string;
          right: string;
          ligLaxity: string;
        };
      };
    };

    aromData?: {
      [region: string]: {
        [movementName: string]: {
          left: string;
          right: string;
          ligLaxity: string;
        };
      };
    };

    activitiesPainData?: {
      chiropracticAdjustment: string[];
      chiropracticOther: string;
      acupuncture: string[];
      acupunctureOther: string;
      physiotherapy: string[];
      rehabilitationExercises: string[];
      durationFrequency: {
        timesPerWeek: string;
        reEvalInWeeks: string;
      };
      diagnosticUltrasound: string;
      disabilityDuration: string;
    };

    treatmentListData?: {
      chiropracticAdjustment: string[];
      chiropracticOther: string;
      acupuncture: string[];
      acupunctureOther: string;
      physiotherapy: string[];
      rehabilitationExercises: string[];
      durationFrequency: {
        timesPerWeek: string;
        reEvalInWeeks: string;
      };
      referrals: string[];
      imaging: {
        xray: string[];
        mri: string[];
        ct: string[];
      };
      diagnosticUltrasound: string;
      nerveStudy: string[];
      restrictions: {
        avoidActivityWeeks: string;
        liftingLimitLbs: string;
        avoidProlongedSitting: boolean;
      };
      disabilityDuration: string;
      otherNotes: string;
    };

    imagingData?: {
      physiotherapy: string[];
      rehabilitationExercises: string[];
      durationFrequency: {
        timesPerWeek: string;
        reEvalInWeeks: string;
      };
      referrals: string[];
      imaging: {
        xray: string[];
        mri: string[];
        ct: string[];
      };
    };

    homeCareSuggestions?: string;
  };
}


const FollowupVisitForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: _user } = useAuth(); // Prefix with _ to indicate intentionally unused
  const [musclePalpationData, setMusclePalpationData] = useState<any>(null); // State for storing fetched muscle palpation data
const [isMuscleModalOpen, setIsMuscleModalOpen] = useState(false); // State for controlling modal visibility
const [isOrthoModalOpen, setIsOrthoModalOpen] = useState(false);
  const [orthoTestsData, setOrthoTestsData] = useState<any>({});
  const [aromData, setAromData] = useState<any>({});
  const [activitiesPainData, setActivitiesPainData] = useState<string[]>([]);
const [isActivitiesModalOpen, setIsActivitiesModalOpen] = useState(false);
const [treatmentListData, setTreatmentListData] = useState<any>(null);
const [isTreatmentModalOpen, setIsTreatmentModalOpen] = useState(false);
const [imagingData, setImagingData] = useState<any>(null);
const [isImagingModalOpen, setIsImagingModalOpen] = useState(false);

  
  const [patient, setPatient] = useState<Patient | null>(null);
  const [previousVisits, setPreviousVisits] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialVisitData, setInitialVisitData] = useState<any>(null);
  const [hasLoadedVisits, setHasLoadedVisits] = useState(false);
  const [homeCareSuggestions, setHomeCareSuggestions] = useState('');
const [isHomeCareModalOpen, setIsHomeCareModalOpen] = useState(false);

  // Use the defined interface for the state type
  const [formData, setFormData] = useState<FollowupVisitFormData>({
    previousVisit: '',
    areas: '',
    areasImproving: false,
    areasExacerbated: false,
    areasSame: false,
    musclePalpation: '',
    painRadiating: '',
    romWnlNoPain: false,
    romWnlWithPain: false,
    romImproved: false,
    romDecreased: false,
    romSame: false,
    orthos: {
      tests: '',
      result: ''
    },
    activitiesCausePain: '',
    activitiesCausePainOther: '',
    treatmentPlan: {
      treatments: '',
      timesPerWeek: ''
    },
    overallResponse: {
      improving: false,
      worse: false,
      same: false
    },
    referrals: '',
    diagnosticStudy: {
      study: '',
      bodyPart: '',
      result: ''
    },
    homeCare: '',
    notes: ''
  });
  
  // Auto-save timer
  // Update the type to include NodeJS.Timeout for compatibility
  const [autoSaveTimer, setAutoSaveTimer] = useState<NodeJS.Timeout | number | null>(null);
  const [localFormData, setLocalFormData] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch patient data
        const [patientResponse, visitsResponse] = await Promise.all([
          axios.get(`/api/patients/${id}`),
          axios.get(`/api/patients/${id}/visits`)
        ]);
        
        if (isMounted) {
          setPatient(patientResponse.data);
          
          // Debug: Log the raw visits data
          console.log('Raw visits data:', visitsResponse.data);
          

       // Include all visits and sort by date ascending
const sortedVisits = visitsResponse.data
.filter((visit: any) => !!visit.date) // Ensure each visit has a date
.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

console.log('All sorted visits:', sortedVisits);

setPreviousVisits(sortedVisits);

          
          console.log('Filtered initial visits:', initialVisits);
          setPreviousVisits(initialVisits);
          setHasLoadedVisits(true);
          
          // Check for locally saved form data
          const savedData = localStorage.getItem(`followupVisit_${id}`);
          if (savedData) {
            setLocalFormData(savedData);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        if (isMounted) {
          setHasLoadedVisits(true); // Ensure we don't get stuck in loading state
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    
    fetchData();
    
    // Clean up
    return () => {
      isMounted = false;
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer as any);
      }
    };
  }, [id]);


  const saveMusclePalpationData = async (visitId: string, data: any) => {
    if (!visitId) return;
    try {
      await axios.put(`/api/patients/visits/${visitId}`, {
        muscleStrength: data.muscleStrength,
        strength: data.strength,
        tenderness: data.tenderness,
        spasm: data.spasm,
      });
      console.log("✅ Muscle data saved");
    } catch (error) {
      console.error("❌ Failed to save muscle data", error);
    }
  };
  
  const saveOrthoTestsData = async (visitId: string, data: any, arom: any) => {
    if (!visitId) return;
    try {
      await axios.put(`/api/patients/visits/${visitId}`, {
        ortho: data,
        arom: arom,
      });
      console.log("✅ Ortho tests data saved");
    } catch (error) {
      console.error("❌ Failed to save ortho tests data", error);
    }
  };
  
  const saveTreatmentPlanData = async (visitId: string, data: any) => {
    if (!visitId) return;
    try {
      await axios.put(`/api/patients/visits/${visitId}`, {
        chiropracticAdjustment: data.chiropracticAdjustment,
        chiropracticOther: data.chiropracticOther,
        acupuncture: data.acupuncture,
        acupunctureOther: data.acupunctureOther,
        physiotherapy: data.physiotherapy,
        rehabilitationExercises: data.rehabilitationExercises,
        durationFrequency: data.durationFrequency,
        diagnosticUltrasound: data.diagnosticUltrasound,
        disabilityDuration: data.disabilityDuration,
      });
      console.log("✅ Treatment plan data saved");
    } catch (error) {
      console.error("❌ Failed to save treatment plan data", error);
    }
  };
  
  const saveTreatmentListData = async (visitId: string, data: any) => {
    if (!visitId) return;
    try {
      await axios.put(`/api/patients/visits/${visitId}`, {
        chiropracticAdjustment: data.chiropracticAdjustment,
        chiropracticOther: data.chiropracticOther,
        acupuncture: data.acupuncture,
        acupunctureOther: data.acupunctureOther,
        physiotherapy: data.physiotherapy,
        rehabilitationExercises: data.rehabilitationExercises,
        durationFrequency: data.durationFrequency,
        referrals: data.referrals,
        imaging: data.imaging,
        diagnosticUltrasound: data.diagnosticUltrasound,
        nerveStudy: data.nerveStudy,
        restrictions: data.restrictions,
        disabilityDuration: data.disabilityDuration,
        otherNotes: data.otherNotes,
      });
      console.log("✅ Treatment list data saved");
    } catch (error) {
      console.error("❌ Failed to save treatment list data", error);
    }
  };
  
  const saveImagingAndSpecialistData = async (visitId: string, data: any) => {
    if (!visitId) return;
    try {
      await axios.put(`/api/patients/visits/${visitId}`, {
        physiotherapy: data.physiotherapy,
        rehabilitationExercises: data.rehabilitationExercises,
        durationFrequency: data.durationFrequency,
        referrals: data.referrals,
        imaging: data.imaging,
      });
      console.log("✅ Imaging and specialist data saved");
    } catch (error) {
      console.error("❌ Failed to save imaging and specialist data", error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saveData = {
        ...formData,
        ...(formData.fetchedData || {}), // ⬅️ this line spreads fetched modal data into the main save body
      };
  
      if (visitId) {
        // PUT to update
        await axios.put(`/api/visits/${visitId}`, saveData);
      } else {
        // POST to create
        saveData.visitType = 'followup';
        saveData.patient = patientId;
        await axios.post('/api/visits', saveData);
      }
  
      alert('Visit saved successfully!');
      navigate(-1);
    } catch (error) {
      console.error('Error saving visit:', error);
      alert('Failed to save visit.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const fetchMusclePalpationData = async (visitId: string) => {
    if (!visitId) return alert("Please select a valid previous visit.");
  
    try {
      const res = await axios.get(`/api/patients/visits/${visitId}`);
      const visit = res.data;
  
      // Check if data exists for followup or initial
      const musclePalpationData = {
        muscleStrength: visit.muscleStrength || [],
        strength: visit.strength || {},
        tenderness: visit.tenderness || {},
        spasm: visit.spasm || {},
      };
  
      setMusclePalpationData(musclePalpationData);
      setIsMuscleModalOpen(true);
  
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          musclePalpationData,
        },
      }));
    } catch (error) {
      console.error("Error fetching muscle palpation data:", error);
      alert("Failed to load data.");
    }
  };
  
  const fetchOrthoTestsData = async (visitId: string) => {
    if (!visitId) {
      console.error("Visit ID is missing.");
      alert("Please select a valid previous visit.");
      return;
    }
  
    try {
      const response = await axios.get(`/api/patients/visits/${visitId}`);
      const visitData = response.data;
  
      if (!visitData) {
        console.error("Visit data is missing.");
        alert("Failed to load visit data.");
        return;
      }
  
      // Extract and structure ortho tests data
      const orthoTestsData: {
        [region: string]: {
          [testName: string]: { left: string; right: string; ligLaxity: string };
        };
      } = visitData.ortho
        ? Object.entries(visitData.ortho).reduce((acc, [testName, testResult]) => {
            const region = testName.split(" ")[0];
            const { left, right, ligLaxity } = testResult as {
              left: string;
              right: string;
              ligLaxity: string;
            };
  
            if (!acc[region]) acc[region] = {};
  
            acc[region][testName] = {
              left: left || "N/A",
              right: right || "N/A",
              ligLaxity: ligLaxity || "N/A",
            };
            return acc;
          }, {})
        : {};
  
      // Extract and structure AROM data
      const aromData: {
        [region: string]: {
          [movementName: string]: { left: string; right: string; ligLaxity: string };
        };
      } = visitData.arom
        ? Object.entries(visitData.arom).reduce((acc, [region, movements]) => {
            acc[region] = Object.entries(movements).reduce((movementAcc, [movementName, movementData]) => {
              const { left, right, ligLaxity } = movementData as {
                left: string;
                right: string;
                ligLaxity: string;
              };
  
              movementAcc[movementName] = {
                left: left || "N/A",
                right: right || "N/A",
                ligLaxity: ligLaxity || "N/A",
              };
              return movementAcc;
            }, {});
            return acc;
          }, {})
        : {};
  
      // Update state for modal display
      setOrthoTestsData(orthoTestsData);
      setAromData(aromData);
      setIsOrthoModalOpen(true);
  
      // ✅ Save in formData.fetchedData for backend persistence
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          orthoTestsData,
          aromData,
        },
      }));
    } catch (error) {
      console.error("Error fetching orthopedic tests data:", error);
      alert("Failed to load orthopedic tests data.");
    }
  };  

  const fetchTreatmentPlanData = async (visitId: string) => {
    if (!visitId) {
      console.error("Visit ID is missing.");
      alert("Please select a valid previous visit.");
      return;
    }
  
    try {
      const response = await axios.get(`/api/patients/visits/${visitId}`);
      const visitData = response.data;
  
      // Filter only treatment plan data
      const treatmentData = {
        chiropracticAdjustment: visitData.chiropracticAdjustment || [],
        chiropracticOther: visitData.chiropracticOther || '',
        acupuncture: visitData.acupuncture || [],
        acupunctureOther: visitData.acupunctureOther || '',
        physiotherapy: visitData.physiotherapy || [],
        rehabilitationExercises: visitData.rehabilitationExercises || [],
        durationFrequency: visitData.durationFrequency || {
          timesPerWeek: '',
          reEvalInWeeks: '',
        },
        diagnosticUltrasound: visitData.diagnosticUltrasound || '',
        disabilityDuration: visitData.disabilityDuration || '',
      };
  
      // Show in modal
      setActivitiesPainData(treatmentData);
      setIsActivitiesModalOpen(true);
  
      // ✅ Save to formData.fetchedData for backend submission
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          activitiesPainData: treatmentData,
        },
      }));
    } catch (error) {
      console.error("Error fetching treatment plan data:", error);
      alert("Failed to load treatment plan data.");
    }
  };
  
  const fetchTreatmentListData = async (visitId: string) => {
    if (!visitId) {
      console.error("Visit ID is missing.");
      alert("Please select a valid previous visit.");
      return;
    }
  
    try {
      const response = await axios.get(`/api/patients/visits/${visitId}`);
      const visitData = response.data;
  
      const treatmentList = {
        chiropracticAdjustment: visitData.chiropracticAdjustment || [],
        chiropracticOther: visitData.chiropracticOther || '',
        acupuncture: visitData.acupuncture || [],
        acupunctureOther: visitData.acupunctureOther || '',
        physiotherapy: visitData.physiotherapy || [],
        rehabilitationExercises: visitData.rehabilitationExercises || [],
        durationFrequency: visitData.durationFrequency || { timesPerWeek: '', reEvalInWeeks: '' },
        referrals: visitData.referrals || [],
        imaging: visitData.imaging || { xray: [], mri: [], ct: [] },
        diagnosticUltrasound: visitData.diagnosticUltrasound || '',
        nerveStudy: visitData.nerveStudy || [],
        restrictions: visitData.restrictions || {
          avoidActivityWeeks: '',
          liftingLimitLbs: '',
          avoidProlongedSitting: false,
        },
        disabilityDuration: visitData.disabilityDuration || '',
        otherNotes: visitData.otherNotes || '',
      };
  
      // Set for modal display
      setTreatmentListData(treatmentList);
      setIsTreatmentModalOpen(true);
  
      // ✅ Save in formData.fetchedData for backend persistence
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          treatmentListData: treatmentList,
        },
      }));
    } catch (error) {
      console.error("Error fetching treatment list:", error);
      alert("Failed to load treatment plan.");
    }
  };
  
  const fetchImagingAndSpecialistData = async (visitId: string) => {
    if (!visitId) {
      console.error("Visit ID is missing.");
      alert("Please select a valid previous visit.");
      return;
    }
  
    try {
      const response = await axios.get(`/api/patients/visits/${visitId}`);
      const visitData = response.data;
  
      const imagingAndSpecialistData = {
        physiotherapy: visitData.physiotherapy || [],
        rehabilitationExercises: visitData.rehabilitationExercises || [],
        durationFrequency: visitData.durationFrequency || {
          timesPerWeek: '',
          reEvalInWeeks: '',
        },
        referrals: visitData.referrals || [],
        imaging: visitData.imaging || {
          xray: [],
          mri: [],
          ct: [],
        },
      };
  
      // Set modal data
      setImagingData(imagingAndSpecialistData);
      setIsImagingModalOpen(true);
  
      // ✅ Store in formData.fetchedData for backend submission
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          imagingData: imagingAndSpecialistData,
        },
      }));
    } catch (error) {
      console.error("Error fetching imaging and specialist data:", error);
      alert("Failed to load data.");
    }
  };
  
  const handleHomeCareAI = async () => {
    try {
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-b2f10ae71f37484c83093c51b49d29bc", // 🔐 Replace for production
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.3,
          max_tokens: 400, // Keep small to limit response size and time
          messages: [
            {
              role: "system",
              content: `
You are a clinical therapist AI.

Based on the patient's clinical data, return a short, visually clean home care summary in raw HTML.

Format:

<h3 class='text-md font-semibold mt-4 mb-2'>Exercises</h3>
<ul class='list-disc list-inside text-gray-800'>
  <li><strong>Neck Retractions</strong> – 10 reps, 3x/day to improve posture.</li>
  <li>...</li>
</ul>

<h3 class='text-md font-semibold mt-4 mb-2'>Ergonomic Tips</h3>
<ul class='list-disc list-inside text-gray-800'>
  <li>...</li>
</ul>

<h3 class='text-md font-semibold mt-4 mb-2'>Pain Relief</h3>
<ul class='list-disc list-inside text-gray-800'>
  <li>...</li>
</ul>

<h3 class='text-md font-semibold mt-4 mb-2'>Follow-up & Safety</h3>
<ul class='list-disc list-inside text-gray-800'>
  <li>...</li>
</ul>

Rules:
- Use <h2> and <h3> for headings with Tailwind classes.
- Use <ul><li> with list-disc, list-inside, text-gray-800.
- No paragraphs, no extra commentary.
- Max 3 bullet points per section.
- Response must be in under 250 words and generated in 2 seconds.

Now generate this summary using the provided patient data:
`.trim(),

            },
            {
              role: "user",
              content: JSON.stringify(formData, null, 2)
            }
          ]
        }),
      });
  
      const data = await response.json();
      const aiText = data?.choices?.[0]?.message?.content || "No suggestions returned by AI.";
  
      setHomeCareSuggestions(aiText);
      setIsHomeCareModalOpen(true);
  
      setFormData((prev) => ({
        ...prev,
        homeCare: aiText,
        fetchedData: {
          ...prev.fetchedData,
          homeCareSuggestions: aiText,
        }
      }));
  
    } catch (error) {
      console.error("Error calling DeepSeek:", error);
      alert("Failed to fetch AI suggestions.");
    }
  };  

  const fetchInitialVisitData = async (visitId: string) => {
    try {
      // Get the visit details using the correct endpoint
      const response = await axios.get(`/api/patients/visits/${visitId}`);
      
      // Check if it's an initial visit (check both __t and visitType for compatibility)
      const isInitialVisit = response.data.__t === 'InitialVisit' || response.data.visitType === 'initial';
  
      if (!isInitialVisit) {
        console.error('Visit data:', response.data);
        throw new Error(`Selected visit is not an initial visit. Visit type: ${response.data.visitType}, __t: ${response.data.__t}`);
      }
  
      // Set modal display data
      setInitialVisitData(response.data);
      setIsModalOpen(true);
  
      // Save to formData.fetchedData for DB persistence
      setFormData((prev) => ({
        ...prev,
        fetchedData: {
          ...prev.fetchedData,
          initialVisitData: response.data,
        },
      }));
    } catch (err: any) {
      console.error('Error fetching initial visit data:', err);
      if (err.response?.status === 404) {
        alert('Visit not found. The selected visit may have been deleted.');
      } else {
        alert(`Failed to load initial visit data: ${err.message}. Please ensure the selected visit is an initial visit.`);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => {
      let updatedValue: any = value;

      if (type === 'checkbox' && e.target instanceof HTMLInputElement) {
        updatedValue = e.target.checked;
      }

      // Handle nested objects using type assertion
      if (name.includes('.')) {
        const [parent, child] = name.split('.') as [keyof FollowupVisitFormData, string];
        const currentParent = prev[parent];

        // Ensure the parent is an object before updating
        if (typeof currentParent === 'object' && currentParent !== null) {
           return {
            ...prev,
            [parent]: {
              ...currentParent as any,
              [child]: updatedValue
            }
          };
        }
        // If parent is not an object, return previous state
        return prev;

      } else {
        return { ...prev, [name as keyof FollowupVisitFormData]: updatedValue };
      }
    });
    
    // Set up auto-save
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer as any); // Cast to any for compatibility
    }
    
    const timer = setTimeout(() => {
      localStorage.setItem(`followupVisit_${id}`, JSON.stringify(formData));
      setAutoSaveStatus('Form auto-saved');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    }, 2000);
    
    setAutoSaveTimer(timer);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.previousVisit) {
      alert('Please select a previous visit');
      return;
    }
    
    setIsSaving(true);
    
    try {
      // 1. Save the visit data
      const {
        musclePalpationData,
        orthoTestsData,
        aromData,
        activitiesPainData,
        treatmentListData,
        imagingData,
        homeCareSuggestions
      } = formData.fetchedData || {};
      
      const flattenedData = {
        ...formData,
      
        // ✅ Muscle Palpation
        ...musclePalpationData,
      
        // ✅ Ortho and AROM
        ortho: orthoTestsData,
        arom: aromData,
      
        // ✅ Activities & Treatment Plan
        ...(activitiesPainData || {}),
      
        // ✅ Full Treatment Plan List
        ...(treatmentListData || {}),
      
        // ✅ Imaging & Referrals
        ...(imagingData || {}),
      
        // ✅ Home Care AI
        homeCare: homeCareSuggestions || '',
      
        patient: id,
        doctor: _user?._id,
        visitType: 'followup'
      };
      
      const response = await axios.post(`/api/visits`, flattenedData);
      
      
      const savedVisitId = response.data.visit._id; // Assuming the saved visit ID is returned

      // 2. Generate AI narrative
      try {
        const aiResponse = await axios.post(`${import.meta.env.VITE_API_URL}/api/generate-narrative`, {
          ...formData,
          visitType: 'followup'
        });

        if (aiResponse.data.success) {
          // 3. Update the visit with the AI narrative
          await axios.patch(`/api/visits/${savedVisitId}`, {
            aiNarrative: aiResponse.data.narrative
          });
        }
      } catch (aiError) {
        console.error('Error generating AI narrative:', aiError);
        // Continue with the form submission even if AI generation fails
      }

      // Clear local storage after successful submission
      localStorage.removeItem(`followupVisit_${id}`);
      
      navigate(`/patients/${id}`);
    } catch (error) {
      console.error('Error saving visit:', error);
      alert('Failed to save visit. Please try again.');
    } finally {
      setIsSaving(false);
    }
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

  // Show loading state while fetching data
  if (isLoading || !hasLoadedVisits) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(`/patients/${id}`)}
          className="mr-4 p-2 rounded-full hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">EXAM FORM---REEVALUATION</h1>
          <p className="text-gray-600">
            Patient: {patient.firstName} {patient.lastName}
          </p>
          <p className="text-gray-600">
            Date: {new Date().toLocaleDateString()}
          </p>
        </div>
        {formData.previousVisit && (
          <button
            type="button"
            onClick={() => fetchInitialVisitData(formData.previousVisit)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md ml-4"
          >
            View Initial Visit Data
          </button>
        )}
      </div>
{/* Modal */}
{isModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    {/* Modal */}
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-lg">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h3 className="text-2xl font-semibold text-gray-800">Initial Visit Data</h3>
        <button
          onClick={() => setIsModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      {/* Displaying Initial Visit Data */}
      <div className="space-y-6">

        {/* Displaying Chief Complaint */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Chief Complaint:</h4>
          <p className="text-gray-700">{initialVisitData?.chiefComplaint || 'N/A'}</p>
        </div>

        {/* Displaying Vitals */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Vitals:</h4>
          <div className="grid grid-cols-2 gap-4">
            <p><span className="font-medium">Height:</span> {initialVisitData?.vitals?.height || 'N/A'}</p>
            <p><span className="font-medium">Weight:</span> {initialVisitData?.vitals?.weight || 'N/A'}</p>
            <p><span className="font-medium">Temperature:</span> {initialVisitData?.vitals?.temp || 'N/A'}</p>
            <p><span className="font-medium">Blood Pressure:</span> {initialVisitData?.vitals?.bp || 'N/A'}</p>
            <p><span className="font-medium">Pulse:</span> {initialVisitData?.vitals?.pulse || 'N/A'}</p>
          </div>
        </div>

        {/* Displaying Grip Strength */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Grip Strength:</h4>
          <div className="grid grid-cols-2 gap-4">
            {['right1', 'right2', 'right3', 'left1', 'left2', 'left3'].map((key, idx) => (
              <p key={idx}><span className="font-medium">{key.replace('right', 'Right Hand').replace('left', 'Left Hand')}:</span> {initialVisitData?.grip?.[key] || 'N/A'}</p>
            ))}
          </div>
        </div>

        {/* Displaying Appearance */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Appearance:</h4>
          <p className="text-gray-700">{initialVisitData?.appearance?.length > 0 ? initialVisitData.appearance.join(', ') : 'N/A'}</p>
        </div>

        {/* Displaying Posture */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Posture:</h4>
          <p className="text-gray-700">{initialVisitData?.posture?.length > 0 ? initialVisitData.posture.join(', ') : 'N/A'}</p>
        </div>

        {/* Displaying Gait */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Gait:</h4>
          <p className="text-gray-700">{initialVisitData?.gait?.length > 0 ? initialVisitData.gait.join(', ') : 'N/A'}</p>
        </div>

        {/* Displaying Strength */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Strength:</h4>
          <div className="grid grid-cols-2 gap-4">
            {Object.keys(initialVisitData?.strength || {}).map((key) => (
              <p key={key}><span className="font-medium">{key}:</span> {initialVisitData?.strength?.[key] || 'N/A'}</p>
            ))}
          </div>
        </div>

        {/* Displaying Range of Motion (ROM) */}
        <div className="section">
  <h4 className="font-semibold text-lg text-gray-800 mb-2">Range of Motion (ROM):</h4>
  {initialVisitData?.arom ? (
    Object.keys(initialVisitData.arom).map((region) => (
      <div key={region} className="mb-6">
        <h5 className="font-semibold text-md text-gray-700 mb-4">{region}</h5>
        
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="border-b p-2 text-left text-sm font-medium text-gray-700">Movement</th>
              <th className="border-b p-2 text-left text-sm font-medium text-gray-700">Left</th>
              <th className="border-b p-2 text-left text-sm font-medium text-gray-700">Right</th>
              <th className="border-b p-2 text-left text-sm font-medium text-gray-700">Ligament Laxity</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(initialVisitData.arom[region]).map(([movement, movementData]) => (
              <tr key={movement}>
                <td className="border-b p-2 text-sm text-gray-600">{movement}</td>
                <td className="border-b p-2 text-sm text-gray-600">{movementData.left || 'N/A'}</td>
                <td className="border-b p-2 text-sm text-gray-600">{movementData.right || 'N/A'}</td>
                <td className="border-b p-2 text-sm text-gray-600">{movementData.ligLaxity || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))
  ) : (
    <p className="text-gray-700">N/A</p>
  )}
</div>


        {/* Displaying Orthopedic Tests */}
        <div className="section">
  <h4 className="font-semibold text-lg text-gray-800 mb-4">Orthopedic Tests:</h4>
  {initialVisitData?.ortho ? (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto border-collapse">
        <thead>
          <tr>
            <th className="border-b p-4 text-left text-sm font-medium text-gray-700">Test</th>
            <th className="border-b p-4 text-left text-sm font-medium text-gray-700">Left</th>
            <th className="border-b p-4 text-left text-sm font-medium text-gray-700">Right</th>
            <th className="border-b p-4 text-left text-sm font-medium text-gray-700">Ligament Laxity</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(initialVisitData.ortho).map((test) => (
            <tr key={test}>
              <td className="border-b p-4 text-sm text-gray-600">{test} (Left)</td>
              <td className="border-b p-4 text-sm text-gray-600">{initialVisitData.ortho[test].left || 'N/A'}</td>
              <td className="border-b p-4 text-sm text-gray-600">{initialVisitData.ortho[test].right || 'N/A'}</td>
              <td className="border-b p-4 text-sm text-gray-600">{initialVisitData.ortho[test].ligLaxity || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p>N/A</p>
  )}
</div>



        {/* Displaying Tenderness */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Tenderness:</h4>
          {initialVisitData?.tenderness ? (
            Object.keys(initialVisitData.tenderness).map((region) => (
              <p key={region}><span className="font-medium">{region}:</span> {initialVisitData.tenderness[region].join(', ')}</p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Displaying Spasm */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Spasm:</h4>
          {initialVisitData?.spasm ? (
            Object.keys(initialVisitData.spasm).map((region) => (
              <p key={region}><span className="font-medium">{region}:</span> {initialVisitData.spasm[region].join(', ')}</p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Displaying Lumbar Touching Toes Movement */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Lumbar Touching Toes Movement:</h4>
          {initialVisitData?.lumbarTouchingToesMovement ? (
            Object.keys(initialVisitData.lumbarTouchingToesMovement).map((movement) => (
              <p key={movement}>
                <span className="font-medium">{movement}:</span> {initialVisitData.lumbarTouchingToesMovement[movement] ? 'Yes' : 'No'}
              </p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Displaying Cervical AROM Checkmarks */}
        <div className="section">
          <h4 className="font-semibold text-lg text-gray-800 mb-2">Cervical AROM Checkmarks:</h4>
          {initialVisitData?.cervicalAROMCheckmarks ? (
            Object.keys(initialVisitData.cervicalAROMCheckmarks).map((checkmark) => (
              <p key={checkmark}>
                <span className="font-medium">{checkmark}:</span> {initialVisitData.cervicalAROMCheckmarks[checkmark] ? 'Yes' : 'No'}
              </p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

      </div>

      {/* Close Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}




      {localFormData && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                You have an unsaved form. Would you like to continue where you left off?
              </p>
              <div className="mt-2">
                <button
                  onClick={() => {
                    setFormData(JSON.parse(localFormData));
                    setLocalFormData(null);
                  }}
                  className="mr-2 text-sm font-medium text-yellow-700 hover:text-yellow-600"
                >
                  Load saved form
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem(`followupVisit_${id}`);
                    setLocalFormData(null);
                  }}
                  className="text-sm font-medium text-gray-600 hover:text-gray-500"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {autoSaveStatus && (
        <div className="fixed bottom-4 right-4 bg-green-100 text-green-800 px-4 py-2 rounded-md shadow-md">
          {autoSaveStatus}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 relative">
        <div className="space-y-6">
          {/* Previous Visit Selection */}
<div className="mb-6">
  <label htmlFor="previousVisit" className="block text-sm font-medium text-gray-700 mb-1">
    Previous Visit
  </label>
  <select
    id="previousVisit"
    name="previousVisit"
    value={formData.previousVisit}
    onChange={handleChange}
    required
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    disabled={previousVisits.length === 0}
  >
    <option value="">
      {previousVisits.length > 0 
        ? "Select previous visit" 
        : "No visits found"}
    </option>

    {/* Dynamically render all visit types */}
    {previousVisits.map((visit) => (
      <option key={visit._id} value={visit._id}>
        {visit.__t || visit.visitType || 'Visit'} - {new Date(visit.date).toLocaleDateString()}
      </option>
    ))}
  </select>

  {/* If no visits, show CTA to create initial visit */}
  {previousVisits.length === 0 && (
    <div className="mt-4 flex items-center">
      <p className="text-sm text-gray-600 mr-4">
        Please create an initial visit first.
      </p>
      <button
        onClick={() => navigate(`/patients/${id}/visits/initial`)}
        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Create Initial Visit
      </button>
    </div>
  )}
</div>


          {/* Areas */}
          <div>
          <button
  type="button"
  onClick={() => fetchInitialVisitData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none mb-4" >
  Areas: Auto generated from Initial
</button>

            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <input
                  id="areasImproving"
                  name="areasImproving"
                  type="checkbox"
                  checked={formData.areasImproving}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="areasImproving" className="ml-2 block text-sm text-gray-900">Improving</label>
              </div>
              <div className="flex items-center">
                <input
                  id="areasExacerbated"
                  name="areasExacerbated"
                  type="checkbox"
                  checked={formData.areasExacerbated}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="areasExacerbated" className="ml-2 block text-sm text-gray-900">Exacerbated</label>
              </div>
              <div className="flex items-center">
                <input
                  id="areasSame"
                  name="areasSame"
                  type="checkbox"
                  checked={formData.areasSame}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="areasSame" className="ml-2 block text-sm text-gray-900">Same</label>
              </div>
            </div>
          </div>

          {/* Muscle Palpation */}
          <div>
  <label htmlFor="musclePalpation" className="block text-sm font-medium text-gray-700 mb-1">Muscle Palpation: </label>
  <button
  type="button"
  onClick={() => fetchMusclePalpationData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none"
>
  List of muscles specific to that body part
</button>

</div>

{isMuscleModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">Muscle Palpation Data</h3>
        <button
          onClick={() => setIsMuscleModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      {/* Displaying muscle palpation data */}
      <div className="bg-gray-50 p-4 rounded-md space-y-6">
        {/* Muscle Strength */}
        <div>
          <h4 className="font-bold text-lg text-gray-800">Muscle Strength:</h4>
          {musclePalpationData?.muscleStrength ? (
            <ul className="list-disc ml-5">
              {musclePalpationData.muscleStrength.map((strength: string, index: number) => (
                <li key={index} className="text-sm text-gray-700">
                  {strength || 'N/A'}
                </li>
              ))}
            </ul>
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Strength */}
        <div>
          <h4 className="font-bold text-lg text-gray-800">Strength:</h4>
          {musclePalpationData?.strength ? (
            Object.entries(musclePalpationData.strength).map(([key, value]) => (
              <p key={key} className="text-sm text-gray-700">
                <span className="font-semibold">{key}:</span> {value || 'N/A'}
              </p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Tenderness */}
        <div>
          <h4 className="font-bold text-lg text-gray-800">Tenderness:</h4>
          {musclePalpationData?.tenderness ? (
            Object.entries(musclePalpationData.tenderness).map(([region, labels]) => (
              <p key={region} className="text-sm text-gray-700">
                <span className="font-semibold">{region}:</span> {labels.join(', ') || 'N/A'}
              </p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>

        {/* Spasm */}
        <div>
          <h4 className="font-bold text-lg text-gray-800">Spasm:</h4>
          {musclePalpationData?.spasm ? (
            Object.entries(musclePalpationData.spasm).map(([region, labels]) => (
              <p key={region} className="text-sm text-gray-700">
                <span className="font-semibold">{region}:</span> {labels.join(', ') || 'N/A'}
              </p>
            ))
          ) : (
            <p>N/A</p>
          )}
        </div>
      </div>

      {/* Close Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsMuscleModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}



          {/* Pain Radiating */}
          <div>
            <label htmlFor="painRadiating" className="block text-sm font-medium text-gray-700 mb-1">Pain Radiating: </label>
            <input
              type="text"
              id="painRadiating"
              name="painRadiating"
              value={formData.painRadiating}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* ROM */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ROM:</label>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <input
                  id="romWnlNoPain"
                  name="romWnlNoPain"
                  type="checkbox"
                  checked={formData.romWnlNoPain}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="romWnlNoPain" className="ml-2 block text-sm text-gray-900">WNL (No Pain)</label>
              </div>
              <div className="flex items-center">
                <input
                  id="romWnlWithPain"
                  name="romWnlWithPain"
                  type="checkbox"
                  checked={formData.romWnlWithPain}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="romWnlWithPain" className="ml-2 block text-sm text-gray-900">WNL (With Pain)</label>
              </div>
              <div className="flex items-center">
                <input
                  id="romImproved"
                  name="romImproved"
                  type="checkbox"
                  checked={formData.romImproved}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="romImproved" className="ml-2 block text-sm text-gray-900">Improved</label>
              </div>
              <div className="flex items-center">
                <input
                  id="romDecreased"
                  name="romDecreased"
                  type="checkbox"
                  checked={formData.romDecreased}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="romDecreased" className="ml-2 block text-sm text-gray-900">Decreased</label>
              </div>
               <div className="flex items-center">
                <input
                  id="romSame"
                  name="romSame"
                  type="checkbox"
                  checked={formData.romSame}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="romSame" className="ml-2 block text-sm text-gray-900">Same</label>
              </div>
            </div>
          </div>

          {/* Orthos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Orthos:</label>
            <button
  type="button"
  onClick={() => fetchOrthoTestsData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none"
>
List of tests specific for body part    
</button>
{isOrthoModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">Orthopedic Tests Data</h3>
        <button
          onClick={() => setIsOrthoModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      {/* Displaying Orthopedic Test Data */}
      <div className="bg-gray-50 p-4 rounded-md space-y-6">
        {/* Orthopedic Tests */}
        <div>
          <h4 className="font-bold text-lg text-gray-800 mb-2">Orthopedic Tests:</h4>
          {Object.entries(orthoTestsData).length > 0 ? (
            Object.entries(orthoTestsData).map(([region, tests]) => (
              <div key={region} className="mb-6">
                <h5 className="font-semibold text-lg text-gray-800">{region}</h5>
                {Object.entries(tests).map(([testName, testResult]) => (
                  <div key={testName} className="space-y-4">
                    <div className="flex items-center justify-between">
                      {/* Test Name */}
                      <span className="font-medium text-gray-600">{testName}:</span>
                      
                      {/* Display Orthopedic Test (Left, Right, Ligament Laxity) */}
                      <div className="flex space-x-4">
                        <input
                          type="text"
                          value={testResult.left || 'N/A'}
                          readOnly
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={testResult.right || 'N/A'}
                          readOnly
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none"
                        />
                        <input
                          type="text"
                          value={testResult.ligLaxity || 'N/A'}
                          readOnly
                          className="px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="text-gray-600">No orthopedic test data available.</p>
          )}
        </div>
      </div>

      {/* Close Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsOrthoModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
              <div>
                 <label htmlFor="orthos.result" className="block text-xs text-gray-500 mb-1">Result</label>
                 <input
                  type="text"
                  id="orthos.result"
                  name="orthos.result"
                  value={formData.orthos.result}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Activities that still cause pain */}
          <div>
          <button
  type="button"
  onClick={() => fetchTreatmentPlanData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none mt-2"
>
  List of activities that still cause pain
</button>

{isActivitiesModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">Treatment Plan Details</h3>
        <button
          onClick={() => setIsActivitiesModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      <div className="bg-gray-50 p-4 rounded-md space-y-4 text-sm text-gray-700">
        <div>
          <h4 className="font-semibold text-gray-700">Chiropractic Adjustment:</h4>
          <ul className="list-disc ml-5">
            {activitiesPainData?.chiropracticAdjustment?.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Chiropractic Other:</h4>
          <p>{activitiesPainData?.chiropracticOther || 'N/A'}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Acupuncture:</h4>
          <ul className="list-disc ml-5">
            {activitiesPainData?.acupuncture?.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Acupuncture Other:</h4>
          <p>{activitiesPainData?.acupunctureOther || 'N/A'}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Physiotherapy:</h4>
          <ul className="list-disc ml-5">
            {activitiesPainData?.physiotherapy?.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Rehabilitation Exercises:</h4>
          <ul className="list-disc ml-5">
            {activitiesPainData?.rehabilitationExercises?.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Duration & Frequency:</h4>
          <p>Times/Week: {activitiesPainData?.durationFrequency?.timesPerWeek || 'N/A'}</p>
          <p>Re-eval in Weeks: {activitiesPainData?.durationFrequency?.reEvalInWeeks || 'N/A'}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Diagnostic Ultrasound:</h4>
          <p>{activitiesPainData?.diagnosticUltrasound || 'N/A'}</p>
        </div>

        <div>
          <h4 className="font-semibold text-gray-700">Disability Duration:</h4>
          <p>{activitiesPainData?.disabilityDuration || 'N/A'}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsActivitiesModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}


                 <div>
                    <label htmlFor="activitiesCausePainOther" className="block text-xs text-gray-500 mb-1">Other:</label>
                    <input
                      type="text"
                      id="activitiesCausePainOther"
                      name="activitiesCausePainOther"
                      value={formData.activitiesCausePainOther}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
       

          <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-4">ASSESSMENT AND PLAN</h2>

          {/* Treatment plan */}
           <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment plan:</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
              <button
  type="button"
  onClick={() => fetchTreatmentListData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none mt-2"
>
  List of treatments
</button>
{isTreatmentModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">Complete Treatment Plan</h3>
        <button
          onClick={() => setIsTreatmentModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      <div className="space-y-4 text-sm text-gray-700">
        {/* Chiropractic */}
        <div>
          <h4 className="font-semibold">Chiropractic Adjustment:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.chiropracticAdjustment?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p><strong>Other:</strong> {treatmentListData?.chiropracticOther || 'N/A'}</p>
        </div>

        {/* Acupuncture */}
        <div>
          <h4 className="font-semibold">Acupuncture:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.acupuncture?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p><strong>Other:</strong> {treatmentListData?.acupunctureOther || 'N/A'}</p>
        </div>

        {/* Physiotherapy */}
        <div>
          <h4 className="font-semibold">Physiotherapy:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.physiotherapy?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Rehab Exercises */}
        <div>
          <h4 className="font-semibold">Rehabilitation Exercises:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.rehabilitationExercises?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Duration & Frequency */}
        <div>
          <h4 className="font-semibold">Duration & Frequency:</h4>
          <p>Times per Week: {treatmentListData?.durationFrequency?.timesPerWeek || 'N/A'}</p>
          <p>Re-evaluation in Weeks: {treatmentListData?.durationFrequency?.reEvalInWeeks || 'N/A'}</p>
        </div>

        {/* Referrals */}
        <div>
          <h4 className="font-semibold">Referrals:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.referrals?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Imaging */}
        <div>
          <h4 className="font-semibold">Imaging:</h4>
          <p><strong>X-ray:</strong> {treatmentListData?.imaging?.xray?.join(', ') || 'N/A'}</p>
          <p><strong>MRI:</strong> {treatmentListData?.imaging?.mri?.join(', ') || 'N/A'}</p>
          <p><strong>CT:</strong> {treatmentListData?.imaging?.ct?.join(', ') || 'N/A'}</p>
        </div>

        {/* Diagnostic Ultrasound */}
        <div>
          <h4 className="font-semibold">Diagnostic Ultrasound:</h4>
          <p>{treatmentListData?.diagnosticUltrasound || 'N/A'}</p>
        </div>

        {/* Nerve Study */}
        <div>
          <h4 className="font-semibold">Nerve Study:</h4>
          <ul className="list-disc ml-5">
            {treatmentListData?.nerveStudy?.map((item: string, i: number) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Restrictions */}
        <div>
          <h4 className="font-semibold">Restrictions:</h4>
          <p>Avoid Activity (Weeks): {treatmentListData?.restrictions?.avoidActivityWeeks || 'N/A'}</p>
          <p>Lifting Limit (lbs): {treatmentListData?.restrictions?.liftingLimitLbs || 'N/A'}</p>
          <p>Avoid Prolonged Sitting: {treatmentListData?.restrictions?.avoidProlongedSitting ? 'Yes' : 'No'}</p>
        </div>

        {/* Disability Duration */}
        <div>
          <h4 className="font-semibold">Disability Duration:</h4>
          <p>{treatmentListData?.disabilityDuration || 'N/A'}</p>
        </div>

        {/* Other Notes */}
        <div>
          <h4 className="font-semibold">Other Notes:</h4>
          <p>{treatmentListData?.otherNotes || 'N/A'}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsTreatmentModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}



              </div>
              <div>
                <input
                  type="text"
                  id="treatmentPlan.timesPerWeek"
                  name="treatmentPlan.timesPerWeek"
                  value={formData.treatmentPlan.timesPerWeek}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Times per week"
                />
              </div>
            </div>
          </div>

          {/* Overall response to care */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Overall response to care:</label>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <input
                  id="overallResponseImproving"
                  name="overallResponse.improving"
                  type="checkbox"
                  checked={formData.overallResponse.improving}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="overallResponseImproving" className="ml-2 block text-sm text-gray-900">Improving</label>
              </div>
              <div className="flex items-center">
                <input
                  id="overallResponseWorse"
                  name="overallResponse.worse"
                  type="checkbox"
                  checked={formData.overallResponse.worse}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="overallResponseWorse" className="ml-2 block text-sm text-gray-900">Worse</label>
              </div>
              <div className="flex items-center">
                <input
                  id="overallResponseSame"
                  name="overallResponse.same"
                  type="checkbox"
                  checked={formData.overallResponse.same}
                  onChange={handleChange}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label htmlFor="overallResponseSame" className="ml-2 block text-sm text-gray-900">Same</label>
              </div>
            </div>
          </div>

          {/* Referrals */}
          <div>
            <label htmlFor="referrals" className="block text-sm font-medium text-gray-700 mb-1">Referrals: </label>
            <button
  type="button"
  onClick={() => fetchImagingAndSpecialistData(formData.previousVisit)}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none mt-2"
>
  List of Imaging and Specialists
</button>
{isImagingModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">Referrals & Imaging Plan</h3>
        <button
          onClick={() => setIsImagingModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>

      <div className="bg-gray-50 p-4 rounded-md space-y-4 text-sm text-gray-700">
        {/* Referrals */}
        <div>
          <h4 className="font-semibold">Specialist Referrals:</h4>
          <ul className="list-disc ml-5">
            {imagingData?.referrals?.length > 0 ? (
              imagingData.referrals.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))
            ) : (
              <li>N/A</li>
            )}
          </ul>
        </div>

        {/* Physiotherapy */}
        <div>
          <h4 className="font-semibold">Physiotherapy:</h4>
          <ul className="list-disc ml-5">
            {imagingData?.physiotherapy?.length > 0 ? (
              imagingData.physiotherapy.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))
            ) : (
              <li>N/A</li>
            )}
          </ul>
        </div>

        {/* Rehabilitation Exercises */}
        <div>
          <h4 className="font-semibold">Rehabilitation Exercises:</h4>
          <ul className="list-disc ml-5">
            {imagingData?.rehabilitationExercises?.length > 0 ? (
              imagingData.rehabilitationExercises.map((item: string, i: number) => (
                <li key={i}>{item}</li>
              ))
            ) : (
              <li>N/A</li>
            )}
          </ul>
        </div>

        {/* Duration & Frequency */}
        <div>
          <h4 className="font-semibold">Duration & Frequency:</h4>
          <p><strong>Times per Week:</strong> {imagingData?.durationFrequency?.timesPerWeek || 'N/A'}</p>
          <p><strong>Re-evaluation in Weeks:</strong> {imagingData?.durationFrequency?.reEvalInWeeks || 'N/A'}</p>
        </div>

        {/* Imaging */}
        <div>
          <h4 className="font-semibold">Imaging:</h4>
          <p><strong>X-ray:</strong> {imagingData?.imaging?.xray?.join(', ') || 'N/A'}</p>
          <p><strong>MRI:</strong> {imagingData?.imaging?.mri?.join(', ') || 'N/A'}</p>
          <p><strong>CT:</strong> {imagingData?.imaging?.ct?.join(', ') || 'N/A'}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsImagingModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}


          </div>

          {/* Review of diagnostic study with the patient */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Review of diagnostic study with the patient:</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="diagnosticStudy.study" className="block text-xs text-gray-500 mb-1">Study</label>
                <input
                  type="text"
                  id="diagnosticStudy.study"
                  name="diagnosticStudy.study"
                  value={formData.diagnosticStudy.study}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="diagnosticStudy.bodyPart" className="block text-xs text-gray-500 mb-1">Body Part</label>
                <input
                  type="text"
                  id="diagnosticStudy.bodyPart"
                  name="diagnosticStudy.bodyPart"
                  value={formData.diagnosticStudy.bodyPart}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="diagnosticStudy.result" className="block text-xs text-gray-500 mb-1">Result:</label>
                <input
                  type="text"
                  id="diagnosticStudy.result"
                  name="diagnosticStudy.result"
                  value={formData.diagnosticStudy.result}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Home Care */}
          <div>
            <label htmlFor="homeCare" className="block text-sm font-medium text-gray-700 mb-1">Home Care: </label>
            <button
  type="button"
  onClick={handleHomeCareAI}
  className="bg-white text-blue-600 font-medium underline hover:text-blue-800 focus:outline-none mt-2"
>
  Suggest Home Care (AI)
</button>
{isHomeCareModalOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800"> Home Care </h3>
        <button
          onClick={() => setIsHomeCareModalOpen(false)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close modal"
        >
          <X size={24} />
        </button>
      </div>
      <div className="prose prose-sm max-w-none text-gray-800">
  <div dangerouslySetInnerHTML={{ __html: homeCareSuggestions }} />
</div>


      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setIsHomeCareModalOpen(false)}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

          </div>

          {/* Additional Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Any additional notes or observations"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/patients/${id}`)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Visit
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FollowupVisitForm;