import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaSave, FaArrowLeft, FaSpinner, FaTrash, FaRobot, FaEdit, FaDownload, FaFileImage } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';
import ConsultationNoteDisplay from '../../components/notes/ConsultationNoteDisplay';
import ReactQuill from 'react-quill';
import { API_URL } from '../../config/constants';
import 'react-quill/dist/quill.snow.css';
import { ChromePicker } from 'react-color';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface Visit {
  _id: string;
  visitType: string;
  date: string;
}

interface DiagnosisCode {
  code: string;
  description: string;
}

interface TreatmentCode {
  code: string;
  description: string;
}

interface Attachment {
  _id?: string;
  filename: string;
  originalname: string;
  path: string;
  mimetype: string;
  size: number;
}

interface Note {
  _id?: string;
  title: string;
  content: string;
  noteType: string;
  colorCode: string;
  patient: string | Patient;
  doctor?: string;
  visit?: string | Visit | null;
  diagnosisCodes: DiagnosisCode[];
  treatmentCodes: TreatmentCode[];
  attachments: Attachment[];
  isAiGenerated: boolean;
  headerImage?: string;
  footerImage?: string;
}

interface SOAPFormData {
  patientName: string;
  patientDOB: string;
  location: string;
  dateOfService: string;
  mrn: string;
  subjectiveKeyPoints: string;
  physicalExamFindings: string;
  planKeyPoints: string;
  subjective: string;
  objective: string;
  xRays: string;
  assessment: string;
  plan: string;
}

interface CorrespondingFormData {
  mrn: string;
  assessment: string;
  plan: string;
  medications: string;
  therapy: string;
  outsideImaging: string;
  splint: string;
  splintType: string;
  injections: string;
  injectionLocation: string;
  injectionMedication: string;
  workSchoolStatus: string;
  specificComments: string;
}

interface ERCorrespondingFormData {
  mrn: string;
  surgeon: string;
  implants: string;
  woundClass: string;
  preoperativeDiagnosis: string;
  postoperativeDiagnosis: string;
  procedureList: string;
  specificNotes: string;
}

interface ORCorrespondingFormData {
  mrn: string;
  surgeon: string;
  assistantSurgeon: string;
  anesthesiaType: string;
  implants: string;
  woundClass: string;
  preoperativeDiagnosis: string;
  postoperativeDiagnosis: string;
  procedureList: string;
  specificNotes: string;
}

const NoteForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quillRef = useRef<any>(null);

  const [note, setNote] = useState<Note>({
    title: '',
    content: '',
    noteType: '',
    colorCode: '#FFFFFF',
    patient: '',
    visit: null,
    diagnosisCodes: [],
    treatmentCodes: [],
    attachments: [],
    isAiGenerated: false,
    headerImage: '',
    footerImage: '',
  });

  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [diagnosisSearch, setDiagnosisSearch] = useState<string>('');
  const [treatmentSearch, setTreatmentSearch] = useState<string>('');
  const [diagnosisResults, setDiagnosisResults] = useState<DiagnosisCode[]>([]);
  const [treatmentResults, setTreatmentResults] = useState<TreatmentCode[]>([]);
  const [searchingDiagnosis, setSearchingDiagnosis] = useState<boolean>(false);
  const [searchingTreatment, setSearchingTreatment] = useState<boolean>(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [filesToRemove, setFilesToRemove] = useState<string[]>([]);
  const [generatingNote, setGeneratingNote] = useState<boolean>(false);
  const [promptData, setPromptData] = useState<string>('');
  const [consultationNoteData, setConsultationNoteData] = useState<any>(null);
  const [showJsonView, setShowJsonView] = useState<boolean>(false);
  const [showSOAPForm, setShowSOAPForm] = useState<boolean>(false);
  const [showCorrespondingForm, setShowCorrespondingForm] = useState<boolean>(false);
  const [showERCorrespondingForm, setShowERCorrespondingForm] = useState<boolean>(false);
  const [showORCorrespondingForm, setShowORCorrespondingForm] = useState<boolean>(false);
  const [correspondingFormData, setCorrespondingFormData] = useState<CorrespondingFormData>({
    mrn: '',
    assessment: '',
    plan: '',
    medications: 'None',
    therapy: 'None',
    outsideImaging: 'None',
    splint: 'None',
    splintType: '',
    injections: 'None (Default)',
    injectionLocation: '',
    injectionMedication: 'Kenalog',
    workSchoolStatus: 'No Restrictions',
    specificComments: '',
  });
  const [erCorrespondingFormData, setERCorrespondingFormData] = useState<ERCorrespondingFormData>({
    mrn: '',
    surgeon: '',
    implants: '',
    woundClass: 'Contaminated',
    preoperativeDiagnosis: '',
    postoperativeDiagnosis: '',
    procedureList: '',
    specificNotes: '',
  });
  const [orCorrespondingFormData, setORCorrespondingFormData] = useState<ORCorrespondingFormData>({
    mrn: '',
    surgeon: '',
    assistantSurgeon: '',
    anesthesiaType: '',
    implants: '',
    woundClass: 'Clean',
    preoperativeDiagnosis: '',
    postoperativeDiagnosis: '',
    procedureList: '',
    specificNotes: '',
  });
  const [soapFormData, setSoapFormData] = useState<SOAPFormData>({
    patientName: '',
    patientDOB: '',
    location: '',
    dateOfService: new Date().toLocaleDateString(),
    mrn: '',
    subjectiveKeyPoints: '',
    physicalExamFindings: '',
    planKeyPoints: '',
    subjective: '',
    objective: '',
    xRays: '',
    assessment: '',
    plan: '',
  });
  // Add these new state variables near the existing useState declarations
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [footerFile, setFooterFile] = useState<File | null>(null);
  const [existingTemplates, setExistingTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [useExistingTemplate, setUseExistingTemplate] = useState<boolean>(false);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState<string>('');
  const [footerPreviewUrl, setFooterPreviewUrl] = useState<string>('');

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ align: [] }],
      ['link', 'image', 'clean'],
    ],
  };

  const getSOAPTemplate = (formData: SOAPFormData) => {
    return `
<h2>SOAP Note - Progress Note</h2>
<p><strong>Patient Information:</strong></p>
<p>• <strong>Patient Name:</strong> ${formData.patientName || '[To be filled from patient selection]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${formData.patientDOB || '[To be filled from patient data]'}</p>
<p>• <strong>Location:</strong> ${formData.location || '[To be pulled from appointment settings]'}</p>
<p>• <strong>Date of Service:</strong> ${formData.dateOfService}</p>
<p>• <strong>MRN:</strong> ${formData.mrn || '[Internal MRN not hospital MRN]'}</p>
<h3>Corresponding Form</h3>
<p>• <strong>Key points about the subjective:</strong> ${formData.subjectiveKeyPoints || '[To be filled]'}</p>
<p>• <strong>Key physical exam findings:</strong> ${formData.physicalExamFindings || '[To be filled]'}</p>
<p>• <strong>Plan:</strong> ${formData.planKeyPoints || '[To be filled]'}</p>
<h3>SOAP Note</h3>
<h4>Subjective:</h4>
<p>${formData.subjective || '[The subjective portion should be written in paragraph format and must include...]'}</p>
<h4>Objective:</h4>
<p>${formData.objective || '[A standard exam that would be expected given the information provided...]'}</p>
<h4>X-Rays:</h4>
<p>${formData.xRays || '[For any patient whose diagnosis includes a fracture...]'}</p>
<h4>Assessment:</h4>
<p>${formData.assessment || '[Provide a comprehensive summary of the patient\'s medical condition...]'}</p>
<h4>Plan:</h4>
<p>${formData.plan || '[For anything that is not applicable put "not applicable"...]'}</p>
<hr>
<p><em>Note: This is a template for a SOAP note. Please fill in all the bracketed sections with the appropriate patient information and clinical details.</em></p>
    `;
  };

  // Consultation Note Template
  const getConsultTemplate = (selectedPatient?: Patient, formData?: CorrespondingFormData) => {
    const patientName = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '';
    const patientDOB = selectedPatient && selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '';
    const currentDate = new Date().toLocaleDateString();
    
    const cf = formData || correspondingFormData;

    return `<h2>Consultation Note</h2>

<p><strong>I expect that the following will be carried over directly from the intake form or EMR:</strong></p>
<p>• <strong>Patient Name:</strong> ${patientName || '[To be filled from patient selection]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${patientDOB || '[To be filled from patient data]'}</p>
<p>• <strong>Location:</strong> should be pulled from the appointment settings</p>
<p>• <strong>Date of Service:</strong> should be pulled from the appointment settings</p>

<h3>Corresponding Form</h3>
<p>• <strong>MRN:</strong> ${cf.mrn || '[To be filled]'}</p>
<p>• <strong>Assessment:</strong> ${cf.assessment || '[To be filled]'}</p>
<p>• <strong>Plan:</strong> ${cf.plan || '[To be filled]'}</p>
<p>• <strong>Medications:</strong> ${cf.medications || 'None, Ordered Antibiotics, Discontinue antibiotics, other_____'}</p>
<p>• <strong>Therapy:</strong> ${cf.therapy || 'None, Ordered, Continue, Discontinue, Offered and Declined'}</p>
<p>• <strong>Outside Imaging or Nerve Study:</strong> ${cf.outsideImaging || 'None, Prescription Provided for ______'}</p>
<p>• <strong>Splint:</strong> ${cf.splint || 'Options should be provided, ordered, discontinued or continued'}</p>
${cf.splintType ? `<p>&nbsp;&nbsp;&nbsp;&nbsp;• <strong>Type:</strong> ${cf.splintType}</p>` : '<p>&nbsp;&nbsp;&nbsp;&nbsp;• <strong>Type:</strong> ________</p>'}
<p>• <strong>Injections:</strong> ${cf.injections || 'None (Default), Fluoroscopy guided, not fluoroscopy guided'}</p>
${cf.injectionLocation ? `<p>&nbsp;&nbsp;&nbsp;&nbsp;• <strong>Location:</strong> ${cf.injectionLocation}</p>` : '<p>&nbsp;&nbsp;&nbsp;&nbsp;• <strong>Location:</strong> [To be filled]</p>'}
<p>&nbsp;&nbsp;&nbsp;&nbsp;• <strong>Medication:</strong> ${cf.injectionMedication || 'Kenalog, Kenalog'}</p>
<p>• <strong>Work/School Status:</strong> ${cf.workSchoolStatus || 'No Restrictions, One handed duty, 5Lbs restriction, 10lbs restriction, 15lbs Restriction, 20lbs restriction, no gym class'}</p>
<p>• <strong>Specific Comments:</strong> ${cf.specificComments || '[To be filled]'}</p>

<h3>Consult Note Generation Prompt</h3>
<p>You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience for this consult note includes insurance auditors, judges, or juries, where fine details are critical.</p>

<h4>Key Instructions:</h4>
<p><strong>Tone and Detail:</strong></p>
<p>All responses must be overly detailed. Every piece of information provided in the prompt is essential; no details should be removed. If any details are missing or unclear, you must add or clarify them. Please pull detail from the intake forms, visit forms, and any uploaded images or PDFs. For Any images or PDF of reports please analyze the text and focus on the interpretation or results section if present.</p>

<h4>Appointment Details:</h4>
<p>• <strong>Patient Name:</strong> ${patientName}</p>
<p>• <strong>Date of Birth:</strong> ${patientDOB}</p>
<p>• <strong>Date of Service:</strong> [should be pulled from the appointment settings]</p>
<p>• <strong>Location:</strong> [should be pulled from the appointment settings]</p>
<p>• <strong>Place of Service:</strong> [To be filled]</p>
<p>• <strong>MRN:</strong> [To be filled]</p>

<h4>Chief Complaint:</h4>
<p>Short description of why the consult is conducted</p>

<h4>HPI:</h4>
<p>This is a subjective portion should always be written in paragraph format. It must include:</p>
<p>• The patient's age and gender.</p>
<p>• The time elapsed since any injury (e.g., "7 days after the patient fell and broke her wrist").</p>
<p>• Any prehospital care received, how the arrived at the hospital (eg. Ambulance or if they were driven.)</p>
<p>• Any care received in the hospital before I arrived.</p>
<p>• The patients medical history, surgical history and allergies should be included in this section.</p>
<p>• Any pain or sensory complaints the patient has should be included here as well.</p>
<p>• The specific laterality of the injury should always be mentioned</p>
<p>• The specific body part should be mentioned when known and possible for example wrist, or thumb or metacarpal. The more specific the better. The laterality should always be mentioned.</p>
<p>• If there are studies/reports uploaded such as, labs, imaging, nerve studies please include these here.</p>

<h4>Objective:</h4>
<p>A standard exam that would be expected given the information provided. For heart and lungs I often don't oscultate. So describe in terms of things that could be seen without listening. For example Heart: Regular rate and rhythm (that can be checked by palpating the radial artery), Lungs: Regular respiratory rate and pattern no respiratory distress. All other things do as normal.</p>

<h4>Assessment:</h4>
<p>• Provide a comprehensive summary of the patient's medical condition in sentence format.</p>
<p>• Follow this with a numbered list of diagnoses, each with the correct ICD-10 codes.</p>

<h4>Plan:</h4>
<p>For anything that is not applicable put not applicable</p>
<p>Structure the plan as a numbered list and sub lists.</p>
<p>Divide the plan into services provided during today's visit.</p>
<p>• <strong>Prescriptions Provided:</strong> Therapy, splint, antibiotics, imaging or other.</p>
<p>• <strong>Dressing or Splint care:</strong> [To be filled]</p>
<p>• <strong>Activity:</strong> Showering weight limits</p>
<p>• <strong>Work or school status:</strong> [To be filled]</p>
<p>• <strong>Follow up:</strong> [To be filled]</p>`;
  };

  const getEROperativeTemplate = (selectedPatient?: Patient, formData?: ERCorrespondingFormData) => {
    const patientName = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '';
    const patientDOB = selectedPatient && selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '';
    const currentDate = new Date().toLocaleDateString();
    const cf = formData || erCorrespondingFormData;

    return `<h2>ER Operative Report</h2>

<p><strong>I expect that the following will be carried over directly from the intake form or EMR:</strong></p>
<p>• <strong>Patient Name:</strong> ${patientName || '[To be filled from patient selection]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${patientDOB || '[To be filled from patient data]'}</p>
<p>• <strong>Location:</strong> should be pulled from the appointment settings</p>
<p>• <strong>Date of Service:</strong> should be pulled from the appointment settings</p>

<h3>Corresponding Form</h3>
<p>• <strong>MRN:</strong> ${cf.mrn || '[To be filled]'}</p>
<p>• <strong>Surgeon:</strong> ${cf.surgeon || '[To be filled]'}</p>
<p>• <strong>Implants:</strong> ${cf.implants || '[To be filled]'}</p>
<p>• <strong>Wound Class:</strong> ${cf.woundClass || '(Contaminated, Dirty) this should be a dropdown'}</p>
<p>• <strong>Preoperative Diagnosis:</strong> ${cf.preoperativeDiagnosis || '[To be filled]'}</p>
<p>• <strong>Postoperative Diagnosis:</strong> ${cf.postoperativeDiagnosis || 'If left blank should be the same as above'}</p>
<p>• <strong>Procedure List:</strong> ${cf.procedureList || '[To be filled]'}</p>
<p>• <strong>Specific notes about the surgery:</strong> ${cf.specificNotes || '[To be filled]'}</p>

<h3>Operative Report Prompt Instructions</h3>
<p><strong>Role:</strong></p>
<p>You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience includes insurance auditors, judges, and juries who require overly detailed, the documentation must be interpreted as precise and intentional. In cases with intraoperatively complications or adverse events they should be discussed in such a way that it was unavoidable, or inevitable due to the initial injury or the anatomy, or the patients actions. Add any missing details as needed.</p>

<h4>Formatting Requirements:</h4>
<p>Every operative report must follow this standardized template:</p>

<h4>Operative Dictation:</h4>
<p>• <strong>Patient Name:</strong> ${patientName || '[To be filled]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${patientDOB || '[To be filled]'}</p>
<p>• <strong>Location:</strong> (Which hospital)</p>
<p>• <strong>Place of Service:</strong> Emergency Room</p>
<p>• <strong>MRN:</strong> [To be filled]</p>
<p>• <strong>Date of Service:</strong> [should be pulled from the appointment settings]</p>
<p>• <strong>Surgeon:</strong> Oren Michaeli, DO</p>
<p>• <strong>Assistant Surgeon (if applicable):</strong> If not specified then there was none.</p>
<p>• <strong>Anesthesia Type:</strong> Local (unless sedation is used from reduction of dislocations)</p>
<p>• <strong>Estimated Blood Loss:</strong> Less than 10 ml (unless otherwise stated)</p>
<p>• <strong>Implants:</strong> (List any applicable: Nerve grafts, Nerve wraps, K-wires, integra)</p>
<p>• <strong>Wound Class:</strong> (Contaminated, Dirty)</p>

<h4>Preoperative Diagnosis:</h4>
<p>Provide numbered list.</p>

<h4>Postoperative Diagnosis:</h4>
<p>Provide numbered list, including exact diagnosis, followed by the ICD-10 codes, and then official ICD-10 descriptions in parentheses.</p>

<h4>Procedures Performed:</h4>
<p>Provide numbered list, specifying the detailed procedure description, followed by the associated CPT codes, and then the official CPT code descriptions.</p>

<h4>Indication for Assistant (if applicable):</h4>
<p>Usually omit this section unless an assistant was specified.</p>
<p>Usually if there is one it's a resident and the indication was that it is a teaching facility.</p>

<h4>Indication for Surgery:</h4>
<p>Each procedure must be individually justified with a direct link to the diagnosis.</p>
<p>Describe negative repercussions of not performing the procedure and potential benefits or time sensitivity if applicable.</p>

<h4>Procedure Details:</h4>
<p>Each numbered procedure must described separately, in independent paragraphs.</p>
<p>Avoid repetitive phrasing; each step must appear uniquely critical in order to justify high billing fees. If it is discussed briefly it gives the impression it is insignificant and insurance companies and arbitrators wont allow for high billing.</p>
<p>Begin with patient positioning, irrigation then sterile prep and partially draped. Prep is usually betadine unless express otherwise.</p>
<p>Use vivid, precise anatomical language; imagine detailing the procedure to someone visualizing it step-by-step without prior visibility. The direction structures are retracted should be discussed as well as the instruments used to dissect and retract (Use terms like ulnar/ly, radial/ly, distally and proximally). Someone reading this operative report should be able to reproduce this operation as if it were a manual.</p>
<p>In every operative case involving an open wound, describe thorough irrigation of the surgical site.</p>

<h4>Specific Procedure Descriptions depending on the procedure list provided. These details must be included although it is ok to paraphrase or expand on it. Always repeat multiple times the specific laterality and body part example left small finger or right wrist.</h4>

<p><strong>1. Sterile Preparation</strong></p>
    <p>Contaminated or Dirty cases (if applicable):</p>
    <p>The extremity was prepared using a betadine-based solution in accordance with contaminated or infected wound protocols unless otherwise stated.</p>

<p><strong>2. A1 Pully release</strong></p>
    <p>When discussing this step always say that the A1 pully was sharply cut under direct visualization ensuring the protection of neighboring neurovascular bundles. Always mention that the flexor tendon was not injured during the release.</p>

<p><strong>3. Flexor Tendon washout</strong></p>
    <p>This have a bruner incision with the incision over the distal phalanx and the palm this will be accompanied by an A1 release (see above for how to describe that). After that happens describe making a knick in the tendon sheath revealing cloudy fluid unless otherwise specified and the advancement of an 18 gauge Angiocatheter from proximal to distal into the sheath and irrigated with 200cc of saline with the effluent being clear. These will always be loosely closed to allow for drainage.</p>

<p><strong>4. Digital Block</strong></p>
    <p>Always 3ml of 1% lidocaine without epinephrine to the volar base of the finger to anesthetize the volar ulnar and radial digital nerve and 2ml to the dorsal base of the finger to anesthetize the dorsal digital sensory nerves.</p>

<p><strong>5. Nailbed Repair</strong></p>
    <p>Start with devitalized nailbed is sharply excised with a tenotomy scissor. The nailbed ends are then approximated using a 5-0 chromic suture at 2mm intervals with a horizontal mattress suture. The aluminum from the suture packaging is cut to the shape of a nail plate and placed under the eponychium and paronychium to allow for healing and splint of the wound.</p>

<p><strong>6. Nail Plate Removal</strong></p>
    <p>This is always done with a freer elevator advanced below the nailplate to elevate it off the nailbed and above the nail plate to separate from the eponychium.</p>

<p><strong>7. Light wound debridement</strong></p>
    <p>Describe using a surgical scissor to remove 1-2 grams of devitalized and contaminated skin and fatty tissue needed to decrease infection risk and allow for proper healing.</p>

<p><strong>8. Tendon debridement</strong></p>
    <p>Describe the poor condition of the tendon edges and the need to debride to healthy tissue to decrease infection and facilitate repair.</p>

<p><strong>9. Bone debridement or open fracture debridement</strong></p>
    <p>If the distal end is amputated from the fracture state that a rongour was used and 1-2mm of bone was removed. If it is an open fracture due to a finger tip and it is accompanied by a nailbed repair say it was debrided with the sharp end of a scissor but don't specify the exact amount just say it was needed to remove contaminants and allow a thorough washout.</p>

<p><strong>10. Rotational flap of the nail bed</strong></p>
    <p>Must mention elevating of the nail bed off the nail plate and mobilizing the nail bed mention needing to make a back cut to facilitate the mobility and advancing it over the defect to cover the distal phalanx periosteum. Then describe suturing it to the adjacent nail bed tissue with a 5-0 chromic suture.</p>

<p><strong>11. Finger arthrotomy</strong></p>
    <p>A longitudinal incision made over the dorsum of the (MCP of PIP or DIP or IP) joint. Care taken to avoid injury to the extensor mechanism. The joint capsule is incised, if infected say and immediately, cloudy fluid was expressed. Cultures were taken for aerobic, anaerobic, and fungal organisms. These will be left to heal by secondary intention Unless otherwise stated earlier in the prompt.</p>

<p><strong>12. Full Thickness skin graft</strong></p>
    <p>This will always be accompanied by the procedure "Advancement flap and primary closure of right medial forearm defect" which should be listed separately. This is how that should be described. 7cc of lidocaine with epinephrine is injected for its hemostatic and anesthetic affect and given 10 min to work. A full-thickness skin graft was harvested using a #15 scalpel blade, from the medial forearm. All adipose tissue sharply debrided. This graft was sutured onto the finger (specify which finger) defect using 4-0 chromic sutures.</p>
    <p>Due to significant tension on the medial forearm defect which was approximately 3cm X 3cm (approximately 28cm squared), dissections were performed along medial and lateral subcutaneous planes to elevate vascularized skin flaps. Following adequate mobilization of these flaps, a deep dermal approximation was carried out using 3-0 Vicryl sutures. Skin closure was then completed with a 5-0 subcuticular suture, reinforced with Steri-Strips.</p>

<p><strong>13. Extensor Tendon Repair</strong></p>
    <p>For the repair of the extensor digitorum communis tendon, I employed a 4-0 PDS suture. The repair technique consisted of two central figure-of-eight stitches complemented by two peripheral horizontal mattress sutures, ensuring a robust and durable repair. The suture bites were taken 1cm back from the torn ends of the tendon, creating a secure, eight-strand repair configuration.</p>

<p><strong>14. Primary Nerve Repair (Coaptation) if applicable</strong></p>
    <p>Neurolysis performed until healthy vaso-nervosum and fascicles exposed.</p>
    <p>Sharp debridement with straight microscissors until healthy, bleeding, and bulging fascicles visible. May also be likened to a bugs eyes.</p>
    <p>Coaptation performed with two interrupted 9-0 nylon sutures, leaving a visible 0.1 mm light gap. May also be described as a grandmas kiss.</p>
    <p>A tension free repair should always be.</p>
    <p>Always say that the limb or digit was fully ranged through its motion to test that the suture line will not break. Do not however mention this if the joint was fused or kwired to immobilize.</p>

<p><strong>15. Synthetic Nerve Membrane (if applicable)</strong></p>
    <p>If used, describe membrane placement to minimize axonal sprouting and prevent neuroma.</p>
    <p>If applicable, include soaking in stem cell solution with brief citation supporting Schwann cell differentiation.</p>
    <p>Secure with 9-0 nylon sutures, then reinforce with fibrin glue.</p>

<h4>Final Note</h4>
<p>Ensure absolute compliance with each instruction. Maintain maximum clarity, precision, and anatomical detail in your documentation at all times. The procedures listed above have key points that MUST be mentioned. Sometimes I will do surgeries that are not listed above if the procedure list that is provided does not have a corresponding instructions please write the procedure yourself but with that same level of detail and minutia.</p>`;
  };

  const getOROperativeTemplate = (selectedPatient?: Patient, formData?: ORCorrespondingFormData) => {
    const patientName = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '';
    const patientDOB = selectedPatient && selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '';
    const currentDate = new Date().toLocaleDateString();
    const cf = formData || orCorrespondingFormData;

    return `<h2>OR Operative Report</h2>

<p><strong>I expect that the following will be carried over directly from the intake form or EMR:</strong></p>
<p>• <strong>Patient Name:</strong> ${patientName || '[To be filled from patient selection]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${patientDOB || '[To be filled from patient data]'}</p>
<p>• <strong>Location:</strong> should be pulled from the appointment settings</p>
<p>• <strong>Date of Service:</strong> should be pulled from the appointment settings</p>

<h3>Corresponding Form</h3>
<p>• <strong>MRN:</strong> ${cf.mrn || '[To be filled]'}</p>
<p>• <strong>Surgeon:</strong> ${cf.surgeon || '[To be filled]'}</p>
<p>• <strong>Assistant Surgeon:</strong> ${cf.assistantSurgeon || '[To be filled]'}</p>
<p>• <strong>Anesthesia Type:</strong> ${cf.anesthesiaType || '[To be filled]'}</p>
<p>• <strong>Implants:</strong> ${cf.implants || '[To be filled]'}</p>
<p>• <strong>Wound Class:</strong> ${cf.woundClass || '(Clean, Contaminated, Dirty) this should be a dropdown'}</p>
<p>• <strong>Preoperative Diagnosis:</strong> ${cf.preoperativeDiagnosis || '[To be filled]'}</p>
<p>• <strong>Postoperative Diagnosis:</strong> ${cf.postoperativeDiagnosis || 'If left blank should be the same as above'}</p>
<p>• <strong>Procedure List:</strong> ${cf.procedureList || '[To be filled]'}</p>
<p>• <strong>Specific notes about the surgery:</strong> ${cf.specificNotes || '[To be filled]'}</p>

<h3>Operative Report Prompt Instructions</h3>
<p><strong>Role:</strong></p>
<p>You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience includes insurance auditors, judges, and juries who require overly detailed, the documentation must be interpreted as precise and intentional. In cases with intraoperatively complications or adverse events they should be discussed in such a way that it was unavoidable, or inevitable due to the initial injury or the anatomy, or the patients actions. Add any missing details as needed. Everything to follow is a general rule but any special notes above superseded anything below.</p>

<h4>Formatting Requirements:</h4>
<p>Every operative report must follow this standardized template:</p>

<h4>Operative Dictation:</h4>
<p>• <strong>Patient Name:</strong> ${patientName || '[To be filled]'}</p>
<p>• <strong>Patient Date of Birth:</strong> ${patientDOB || '[To be filled]'}</p>
<p>• <strong>Location:</strong> (Which hospital)</p>
<p>• <strong>Place of Service:</strong> (Emergency - Inpatient, Emergency - Outpatient, Elective - Inpatient, Elective - Outpatient)</p>
<p>• <strong>MRN:</strong> [To be filled]</p>
<p>• <strong>Date of Service:</strong> [should be pulled from the appointment settings]</p>
<p>• <strong>Surgeon:</strong> Oren Michaeli, DO</p>
<p>• <strong>Assistant Surgeon (if applicable):</strong> [To be filled]</p>
<p>• <strong>Anesthesia Type:</strong> [To be filled]</p>
<p>• <strong>Estimated Blood Loss:</strong> Less than 10 ml (unless otherwise stated)</p>
<p>• <strong>Implants:</strong> (List any applicable: plates, screws, anchors, suture tape, tightropes, nerve grafts, nerve wraps, K-wires, intramedullary nails, bone allografts)</p>
<p>• <strong>Wound Class:</strong> (Clean, Contaminated, Dirty)</p>

<h4>Preoperative Diagnosis:</h4>
<p>Provide numbered list.</p>

<h4>Postoperative Diagnosis:</h4>
<p>Provide numbered list, including exact diagnosis, followed by the ICD-10 codes, and then official ICD-10 descriptions in parentheses.</p>

<h4>Procedures Performed:</h4>
<p>Provide numbered list, specifying the detailed procedure description, followed by the associated CPT codes, and then the official CPT code descriptions.</p>

<h4>Indication for Assistant (if applicable):</h4>
<p>Clearly justify necessity of the assistant. If the information has been provided to you for the specific assistant please include the specialty, the board certification, years in practice and any other unique qualifiers. Also highlight why this procedure requires more than one experienced surgeon.</p>

<h4>Indication for Surgery:</h4>
<p>Each procedure must be individually justified with a direct link to the diagnosis.</p>
<p>Describe negative repercussions of not performing the procedure and potential benefits or time sensitivity if applicable.</p>

<h4>Procedure Details:</h4>
<p>Each numbered procedure must be described separately, in independent paragraphs.</p>
<p>Avoid repetitive phrasing; each step must appear uniquely critical in order to justify high billing fees. If it is discussed briefly it gives the impression it is insignificant and insurance companies and arbitrators wont allow for high billing.</p>
<p>Begin with patient positioning, sterile preparation, placement of a protective barrier, tourniquet (if used), and performing a preoperative timeout. including confirmation of antibiotics, DVT prophylaxis, and laterality prior to tourniquet inflation or skin incision.</p>
<p>For Procedures in the emergency room only state that the extremity was irrigated then prepped and partially draped.</p>
<p>Conclude with verification of counts, confirmation of perfusion of the extremity or digit, and the patient's complication-free emergence from anesthesia (if general anesthesia was used).</p>
<p>Use vivid, precise anatomical language; imagine detailing the procedure to someone visualizing it step-by-step without prior visibility. The direction structures are retracted should be discussed as well as the instruments used to dissect and retract (Use terms like ulnar/ly, radial/ly, distally and proximally). Someone reading this operative report should be able to reproduce this operation as if it were a manual.</p>
<p>In every operative case involving an open wound, describe thorough irrigation of the surgical site.</p>

<h4>Specific Procedure Descriptions depending on the procedure list provided. These details must be included although it is ok to paraphrase or expand on it.</h4>

<p><strong>1. Sterile Preparation</strong></p>
<p><strong>Clean cases (if applicable):</strong></p>
<p>Initially, the arm was meticulously scrubbed using a surgical-grade sponge, followed by drying with a sterile towel to ensure the absence of residual moisture. This procedure was diligently repeated. Subsequently, the [specify laterality and extremity] received a double application of a chlorhexidine preparation stick. A sterile surgical drape was applied, followed by a final chlorhexidine application within the sterile field.</p>
<p><strong>Contaminated or Dirty cases (if applicable):</strong></p>
<p>The extremity was prepared using a betadine-based solution in accordance with contaminated or infected wound protocols.</p>

<p><strong>2. Volar Plating of Distal Radius (If applicable)</strong></p>
<p>Prior to incision inspect the fracture under fluoroscopic guidance and attempt preliminary reduction.</p>
<p>A modified Henry approach was used. The FCR was palpated and a 10 cm incision made using a 15 blade. The FCR sheath was incised with a 15 blade, and a push-cut technique used proximally and distally with tenotomy scissors. A Ragnell retractor retracted the FCR ulnarly. The base and floor of the tendon sheath were opened with a tenotomy. The FPL was freed with finger-sweep dissection. The pronator quadratus was then cut with a bipolar and a combination of blunt dissection with a raytech and a key elevator was used to expose the fracture.</p>
<p>A freer elevator was used to open the fracture; hematoma was evacuated.</p>
<p>DRUJ stability was assessed with the elbow at 90° in both pronation and supination if there was an associated ulnar styloid fracture.</p>
<p>The volar plate was fixed distally first with screws to leverage and reduce the distal fragments.</p>
<p>Proximal screws were placed to complete longitudinal stabilization.</p>
<p>Fluoroscopy confirmed proper screw placement, no intra-articular penetration, and satisfactory construct alignment.</p>
<p>If specified that it was an arthroscopically assisted distal radius volar plating please describe as follows.</p>
<p>If anatomic alignment remained suboptimal (e.g., >2mm displacement), arthroscopic intervention may be employed to enhance precision. The arthroscope was introduced dorsally, adjacent to Lister's tubercle, through the inter-compartmental space without disrupting tendon sheaths. Extensive irrigation was performed to improve joint visibility.</p>
<p>A 6R portal was created with a small incision radial to the ECU, dissecting to the capsule. A probe introduced through this portal allowed adjustment of the fragments to a 0mm step-off.</p>
<p>After achieving alignment, the plate was first fixed distally, leveraging the distal fragment against the volar plate for anatomic tilt. Proximal screws were subsequently placed to secure longitudinal stability.</p>
<p>Screw placement and construct integrity were verified both arthroscopically and fluoroscopically, ensuring no intra-articular penetration and confirming optimal stabilization and wrist functionality.</p>

<p><strong>3. Ulnar Styloid Fixation (if applicable)</strong></p>
<p>2 cm incision made between ECU and FCU. The ulnar sensory nerve was identified and protected.</p>
<p>TFCC instability was addressed using a specialized hook plate to secure soft tissues to the ulnar styloid.</p>
<p>Screws were placed proximally to avoid intra-articular impingement and ensure DRUJ support. In some instances I will place a screw diagonally through the styloid into the neck/ shaft. Only include this detail if it is mentioned above.</p>

<p><strong>4. Intramedullary Nailing of Metacarpal (if applicable)</strong></p>
<p>A 1.4 mm K-wire was inserted at the dorsal third of the metacarpal head and advanced into the medullary canal.</p>
<p>Fracture reduced manually; fluoroscopic alignment confirmed.</p>
<p>A 0.3 mm skin incision allowed passage of a cannulated drill/reamer system.</p>
<p>After canal preparation, Skeletal Dynamics intramedullary nail was inserted over a guidewire and buried beneath the articular cartilage.</p>
<p>Must include the size of the screw</p>
<p>Must specify the digit number 1st-5th, with 1st being the thumb and 5th being the small finger. Also must mention the laterality.</p>
<p>If multiple fingers are involved each should be discussed separately.</p>

<p><strong>5. Blood Vessel Anastomosis (if applicable)</strong></p>
<p>Hematoma and adhesions were removed. The arterial ends were mobilized.</p>
<p>Adventitia was sharply removed with straight micro-scissors.</p>
<p>Vessel ends debrided until healthy tissue was visible.</p>
<p>Ends bathed in a heparin, lidocaine, and papaverine solution.</p>
<p>Microscopic vessel dilators expanded the lumen incrementally.</p>
<p>Vessel approximated using clamps and anastomosed with 8-0 nylon sutures under magnification.</p>
<p>Perfusion confirmed after clamp release.</p>

<p><strong>6. Primary Nerve Repair (Coaptation) if applicable</strong></p>
<p>Neurolysis performed until healthy vaso nervosum and fascicles exposed.</p>
<p>Sharp debridement with straight microscissors until healthy, bleeding, and bulging fascicles visible. May also be likened to a bugs eyes.</p>
<p>Coaptation performed with two interrupted 9-0 nylon sutures, leaving a visible 0.1 mm light gap. May also be described as a grandmas kiss.</p>
<p>A tension free repair should always be.</p>
<p>Fibrin glue applied to reinforce the repair using a drop, drop method.</p>
<p>Always say that the limb or digit was fully ranged through its motion to test that the suture line will not break. Do not however mention this if the joint was fused or kwired to immobilize.</p>

<p><strong>7. Nerve Graft (if applicable)</strong></p>
<p>Document diameter and length of graft.</p>
<p>Thaw nerve allograft, trim with microscissors, and coapt both ends with 9-0 nylon interrupted sutures.</p>
<p>Apply fibrin glue proximally and distally.</p>

<p><strong>8. Synthetic Nerve Membrane (if applicable)</strong></p>
<p>If used, describe membrane placement to minimize axonal sprouting and prevent neuroma.</p>
<p>If applicable, include soaking in stem cell solution with brief citation supporting Schwann cell differentiation.</p>
<p>Secure with 9-0 nylon sutures, then reinforce with fibrin glue.</p>

<p><strong>9. Intraoperative Nerve Stimulation (AKA ReGen, if applicable)</strong></p>
<p>Electrode placed proximal to nerve repair at last known healthy nerve.</p>
<p>Settings: 100 pulses/sec for 10 minutes at 2 mA.</p>
<p>Document device used and total stimulation time.</p>

<p><strong>10. Nano Fat Stem Cell Grafting with Tulip if applicable</strong></p>
<p>100 cc of tumescent fluid (saline, lidocaine, epinephrine) infiltrated into lower abdomen.</p>
<p>Suction cannula is always advanced through the umbilicus.</p>
<p>Fat harvested using Tulip cannula under manual suction pressure.</p>
<p>Gravity separation performed; supernatant and infranatant discarded.</p>
<p>Fat filtered through sequential Tulip filters to create nanofat.</p>
<p>~10 cc reserved for injection.</p>

<p><strong>11. Bone Grafting with allograft if applicable</strong></p>
<p>Fracture hematoma is cleared, then the void is packed with bone allograft. This could be added anywhere on the body that makes sense either after plating or in the middle of the plating. The packing must be tight.</p>

<h4>Final Note</h4>
<p>Ensure absolute compliance with each instruction. Maintain maximum clarity, precision, and anatomical detail in your documentation at all times.</p>

<p><strong>Place of Service:</strong> (Emergency - Inpatient, Emergency - Outpatient, Elective - Inpatient, Elective - Outpatient) this should be a drop down.</p>`;
  };

  const processContentToHTML = (text: string): string => {
    if (!text) return text;
    let html = text
      .split('\n\n')
      .map(paragraph => {
        let p = paragraph.trim();
        if (p.startsWith('- ')) {
          p = p.replace(/^- /gm, '<li>');
          return `<ul><li>${p.slice(2)}</li></ul>`;
        }
        return `<p>${p.replace(/\n/g, '<br />')}</p>`;
      })
      .join('');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return html;

  };

  // Update the existing handleHeaderImageChange function
  const handleHeaderImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHeaderFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setNote(prev => ({ ...prev, headerImage: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Update the existing handleFooterImageChange function
  const handleFooterImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFooterFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setNote(prev => ({ ...prev, footerImage: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const patientsResponse = await axios.get('/api/patients?limit=1000', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (patientsResponse.data && Array.isArray(patientsResponse.data.patients)) {
          setPatients(patientsResponse.data.patients);
        } else {
          setPatients([]);
        }
        if (isEditMode && id) {
          const noteResponse = await axios.get(`/api/notes/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const noteData = noteResponse.data;

          // Handle patient - could be populated object or just ID
          const patientId = noteData.patient?._id || noteData.patient || '';

          // Handle visit - could be populated object or just ID
          const visitId = noteData.visit?._id || noteData.visit || null;

          setNote({
            _id: noteData._id,
            title: noteData.title || '',
            content: processContentToHTML(noteData.content || ''),
            noteType: noteData.noteType || '',
            colorCode: noteData.colorCode || '#FFFFFF',
            patient: patientId,
            visit: visitId,
            diagnosisCodes: noteData.diagnosisCodes || [],
            treatmentCodes: noteData.treatmentCodes || [],
            attachments: noteData.attachments || [],
            isAiGenerated: noteData.isAiGenerated || false,
            headerImage: noteData.headerImage || '',
            footerImage: noteData.footerImage || '',
          });

          // Fetch visits for the patient
          if (patientId) {
            try {
              const visitsResponse = await axios.get(`/api/visits/patient/${patientId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              setVisits(visitsResponse.data || []);
            } catch (visitError) {
              console.error('Error fetching visits:', visitError);
              setVisits([]);
            }
          }
        }
      } catch (error: any) {
        console.error('Error fetching data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEditMode, token]);

  const handlePatientChange = async (patientId: string) => {
    const selectedPatient = patients.find(p => p._id === patientId);

    setNote(prev => {
      const updatedNote = { ...prev, patient: patientId, visit: null };

      // If note type is Consultation and patient is selected, update the template with patient data
      if (prev.noteType === 'Consultation' && selectedPatient) {
        const updatedTemplate = getConsultTemplate(selectedPatient, correspondingFormData);
        updatedNote.content = updatedTemplate;
      }
      // If note type is ER Operative Report and patient is selected, update the template with patient data
      else if (prev.noteType === 'New ER Operative Report' && selectedPatient) {
        const updatedTemplate = getEROperativeTemplate(selectedPatient, erCorrespondingFormData);
        updatedNote.content = updatedTemplate;
      }
      // If note type is OR Operative Report and patient is selected, update the template with patient data
      else if (prev.noteType === 'New OR Operative Report' && selectedPatient) {
        const updatedTemplate = getOROperativeTemplate(selectedPatient, orCorrespondingFormData);
        updatedNote.content = updatedTemplate;
      }

      return updatedNote;
    });

    if (patientId) {
      try {
        const visitsResponse = await axios.get(`/api/visits/patient/${patientId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setVisits(visitsResponse.data);
      } catch (error: any) {
        console.error('Error fetching patient visits:', error);
        toast.error('Failed to load patient visits');
      }
    } else {
      setVisits([]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Validate color code format if it's the colorCode field
    if (name === 'colorCode') {
      // Allow hex color format (#RRGGBB or #RGB)
      const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (value === '' || hexColorRegex.test(value)) {
        setNote(prev => ({ ...prev, [name]: value || '#FFFFFF' }));
      }
      return;
    }

    const selectedPatient = patients.find(p => p._id === note.patient);
    if (name === 'noteType' && value === 'Progress' && !note.content.trim()) {
      const soapTemplate = getSOAPTemplate({
        ...soapFormData,
        patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '',
        patientDOB: selectedPatient ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '',
      });
      setNote(prev => ({ ...prev, [name]: value, content: soapTemplate }));
    } else if (name === 'noteType' && value === 'Progress' && note.content.trim()) {
      if (window.confirm('Would you like to load the SOAP template? This will replace your current content.')) {
        const soapTemplate = getSOAPTemplate({
          ...soapFormData,
          patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '',
          patientDOB: selectedPatient ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '',
        });
        setNote(prev => ({ ...prev, [name]: value, content: soapTemplate }));
      } else {
        setNote(prev => ({ ...prev, [name]: value }));
      }
    } else if (name === 'noteType' && value === 'Consultation' && !note.content.trim()) {
      const consultTemplate = getConsultTemplate(selectedPatient, correspondingFormData);
      setNote(prev => ({ ...prev, [name]: value, content: consultTemplate }));
    } else if (name === 'noteType' && value === 'Consultation' && note.content.trim()) {
      if (window.confirm('Would you like to load the Consult template? This will replace your current content.')) {
        const consultTemplate = getConsultTemplate(selectedPatient, correspondingFormData);
        setNote(prev => ({ ...prev, [name]: value, content: consultTemplate }));
      } else {
        setNote(prev => ({ ...prev, [name]: value }));
      }
    } else if (name === 'noteType' && value === 'New ER Operative Report' && !note.content.trim()) {
      const erOperativeTemplate = getEROperativeTemplate(selectedPatient, erCorrespondingFormData);
      setNote(prev => ({ ...prev, [name]: value, content: erOperativeTemplate }));
    } else if (name === 'noteType' && value === 'New ER Operative Report' && note.content.trim()) {
      if (window.confirm('Would you like to load the ER Operative Report template? This will replace your current content.')) {
        const erOperativeTemplate = getEROperativeTemplate(selectedPatient, erCorrespondingFormData);
        setNote(prev => ({ ...prev, [name]: value, content: erOperativeTemplate }));
      } else {
        setNote(prev => ({ ...prev, [name]: value }));
      }
    } else if (name === 'noteType' && value === 'New OR Operative Report' && !note.content.trim()) {
      const orOperativeTemplate = getOROperativeTemplate(selectedPatient, orCorrespondingFormData);
      setNote(prev => ({ ...prev, [name]: value, content: orOperativeTemplate }));
    } else if (name === 'noteType' && value === 'New OR Operative Report' && note.content.trim()) {
      if (window.confirm('Would you like to load the OR Operative Report template? This will replace your current content.')) {
        const orOperativeTemplate = getOROperativeTemplate(selectedPatient, orCorrespondingFormData);
        setNote(prev => ({ ...prev, [name]: value, content: orOperativeTemplate }));
      } else {
        setNote(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setNote(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleContentChange = (content: string) => {
    setNote(prev => ({ ...prev, content }));
  };

  const handleColorChange = (color: any) => {
    setNote(prev => ({ ...prev, colorCode: color.hex || '#FFFFFF' }));
  };

  const handleSOAPFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSoapFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSOAPFormSubmit = () => {
    const selectedPatient = patients.find(p => p._id === note.patient);
    const updatedTemplate = getSOAPTemplate({
      ...soapFormData,
      patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : soapFormData.patientName,
      patientDOB: selectedPatient ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : soapFormData.patientDOB,
    });
    setNote(prev => ({ ...prev, content: updatedTemplate }));
    setShowSOAPForm(false);
  };

  const handleCorrespondingFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCorrespondingFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCorrespondingFormSubmit = () => {
    const selectedPatient = patients.find(p => p._id === note.patient);
    const updatedTemplate = getConsultTemplate(selectedPatient, correspondingFormData);
    setNote(prev => ({ ...prev, content: updatedTemplate }));
    setShowCorrespondingForm(false);
  };

  const handleERCorrespondingFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setERCorrespondingFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleERCorrespondingFormSubmit = () => {
    const selectedPatient = patients.find(p => p._id === note.patient);
    const updatedTemplate = getEROperativeTemplate(selectedPatient, erCorrespondingFormData);
    setNote(prev => ({ ...prev, content: updatedTemplate }));
    setShowERCorrespondingForm(false);
  };

  const handleORCorrespondingFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setORCorrespondingFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleORCorrespondingFormSubmit = () => {
    const selectedPatient = patients.find(p => p._id === note.patient);
    const updatedTemplate = getOROperativeTemplate(selectedPatient, orCorrespondingFormData);
    setNote(prev => ({ ...prev, content: updatedTemplate }));
    setShowORCorrespondingForm(false);
  };



  // Existing search, file handling, and save functions (unchanged)
  const searchDiagnosisCodes = async () => {
    if (!diagnosisSearch.trim()) return;
    setSearchingDiagnosis(true);
    try {
      setTimeout(() => {
        const mockResults = [
          { code: 'M54.5', description: 'Low back pain' },
          { code: 'M54.2', description: 'Cervicalgia (neck pain)' },
          { code: 'M25.511', description: 'Pain in right shoulder' },
          { code: 'M25.512', description: 'Pain in left shoulder' },
          { code: 'M79.604', description: 'Pain in right leg' },
          { code: 'M79.605', description: 'Pain in left leg' },
        ].filter(
          item =>
            item.code.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
            item.description.toLowerCase().includes(diagnosisSearch.toLowerCase()),
        );
        setDiagnosisResults(mockResults);
        setSearchingDiagnosis(false);
      }, 500);
    } catch (error: any) {
      console.error('Error searching diagnosis codes:', error);
      setSearchingDiagnosis(false);
    }
  };

  const searchTreatmentCodes = async () => {
    if (!treatmentSearch.trim()) return;
    setSearchingTreatment(true);
    try {
      setTimeout(() => {
        const mockResults = [
          { code: '97110', description: 'Therapeutic exercises' },
          { code: '97112', description: 'Neuromuscular reeducation' },
          { code: '97140', description: 'Manual therapy techniques' },
          { code: '97530', description: 'Therapeutic activities' },
          { code: '98940', description: 'Chiropractic manipulation (1-2 regions)' },
          { code: '98941', description: 'Chiropractic manipulation (3-4 regions)' },
        ].filter(
          item =>
            item.code.toLowerCase().includes(treatmentSearch.toLowerCase()) ||
            item.description.toLowerCase().includes(treatmentSearch.toLowerCase()),
        );
        setTreatmentResults(mockResults);
        setSearchingTreatment(false);
      }, 500);
    } catch (error: any) {
      console.error('Error searching treatment codes:', error);
      setSearchingTreatment(false);
    }
  };

  const addDiagnosisCode = (code: DiagnosisCode) => {
    if (!note.diagnosisCodes.some(c => c.code === code.code)) {
      setNote(prev => ({
        ...prev,
        diagnosisCodes: [...prev.diagnosisCodes, code],
      }));
    }
    setDiagnosisSearch('');
    setDiagnosisResults([]);
  };

  const addTreatmentCode = (code: TreatmentCode) => {
    if (!note.treatmentCodes.some(c => c.code === code.code)) {
      setNote(prev => ({
        ...prev,
        treatmentCodes: [...prev.treatmentCodes, code],
      }));
    }
    setTreatmentSearch('');
    setTreatmentResults([]);
  };

  const removeDiagnosisCode = (code: string) => {
    setNote(prev => ({
      ...prev,
      diagnosisCodes: prev.diagnosisCodes.filter(c => c.code !== code),
    }));
  };

  const removeTreatmentCode = (code: string) => {
    setNote(prev => ({
      ...prev,
      treatmentCodes: prev.treatmentCodes.filter(c => c.code !== code),
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFilesToUpload(prev => [...prev, ...newFiles]);
    }
  };

  const removeSelectedFile = (index: number) => {
    setFilesToUpload(prev => prev.filter((_, i) => i !== index));
  };

  const markAttachmentForRemoval = (attachmentId: string) => {
    setFilesToRemove(prev => [...prev, attachmentId]);
    setNote(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a._id !== attachmentId),
    }));
  };

  // Generate note content using AI
  // IMPORTANT: This function ONLY generates content and updates the form. It does NOT save the note.
  // The note will only be saved when the user explicitly clicks "Save Note" button.
  const generateNote = async () => {
    if (!note.patient || !note.noteType) {
      toast.error('Please select a patient and note type before generating');
      return;
    }

    if (!token) {
      toast.error('Authentication error. Please log in again.');
      return;
    }

    setGeneratingNote(true);
    try {
      console.log('Starting note generation...', { patientId: note.patient, noteType: note.noteType, visitId: note.visit });

      const response = await axios.post(
        '/api/notes/generate',
        {
          patientId: note.patient,
          visitId: note.visit || null,
          noteType: note.noteType,
          promptData: promptData || '',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 120000 // 2 minute timeout for AI generation
        },
      );

      console.log('Generate response received:', response.data);

      // Handle both response structures: {success: true, data: {...}} or {success: true, note: {...}}
      // Check 'note' first since that's what the server is currently returning
      let responseData = response.data?.note || response.data?.data;

      // If responseData is a note object with nested structure, extract the needed fields
      if (responseData) {
        // Handle case where note object might have patient as an object
        if (responseData.patient && typeof responseData.patient === 'object') {
          responseData = {
            ...responseData,
            patientId: responseData.patient._id || responseData.patientId
          };
        }
        // Handle case where visit might be an object
        if (responseData.visit && typeof responseData.visit === 'object') {
          responseData = {
            ...responseData,
            visitId: responseData.visit._id || responseData.visitId
          };
        }
      }

      // Check if we have valid response data - be more lenient with the check
      if (response.data && response.data.success && responseData) {
        toast.success('Note generated successfully. Please review and save.');

        // Extract data ensuring we handle all possible structures
        // Handle patient ID - could be patientId, patient._id, or patient as string
        let extractedPatientId = responseData.patientId;
        if (!extractedPatientId && responseData.patient) {
          if (typeof responseData.patient === 'object' && responseData.patient._id) {
            extractedPatientId = responseData.patient._id;
          } else if (typeof responseData.patient === 'string') {
            extractedPatientId = responseData.patient;
          }
        }

        // Handle visit ID - could be visitId, visit._id, or visit as string
        let extractedVisitId = responseData.visitId || null;
        if (!extractedVisitId && responseData.visit) {
          if (typeof responseData.visit === 'object' && responseData.visit._id) {
            extractedVisitId = responseData.visit._id;
          } else if (typeof responseData.visit === 'string') {
            extractedVisitId = responseData.visit;
          }
        }

        const generatedData = {
          title: responseData.title || '',
          content: responseData.content || '',
          noteType: responseData.noteType || '',
          patientId: extractedPatientId,
          visitId: extractedVisitId
        };

        console.log('Processing generated data:', {
          title: generatedData.title,
          hasContent: !!generatedData.content,
          noteType: generatedData.noteType,
          patientId: generatedData.patientId
        });

        if (note.noteType === 'Consultation') {
          try {
            setConsultationNoteData(null);
          } catch (error) {
            console.error('Error parsing consultation note data:', error);
          }
        }

        // Update form state with generated content - DO NOT save to database
        // Note will only be saved when user explicitly clicks "Save Note" button
        const processedContent = processContentToHTML(generatedData.content || '');

        setNote(prev => ({
          ...prev,
          // CRITICAL: Do NOT set or update _id - the note is NOT saved yet, this is just generated content
          // Only update form fields with the generated content
          title: generatedData.title || prev.title,
          content: processedContent,
          noteType: generatedData.noteType || prev.noteType,
          colorCode: prev.colorCode || '#FFFFFF',
          patient: generatedData.patientId || prev.patient,
          visit: generatedData.visitId || prev.visit || null,
          // Keep existing arrays - do not overwrite with empty arrays from generate response
          diagnosisCodes: prev.diagnosisCodes || [],
          treatmentCodes: prev.treatmentCodes || [],
          attachments: prev.attachments || [],
          isAiGenerated: true,
        }));

        setPromptData('');
        // DO NOT navigate away or trigger any save operations
      } else {
        const errorMsg = response.data?.message || 'Invalid response structure from server';
        console.error('Invalid response structure:', {
          hasResponse: !!response.data,
          success: response.data?.success,
          hasData: !!response.data?.data,
          hasNote: !!response.data?.note,
          fullResponse: response.data
        });
        toast.error('Failed to generate note: ' + errorMsg);
      }
    } catch (error: any) {
      console.error('Error generating note:', error);

      let errorMessage = 'Failed to generate note';
      if (error.response) {
        errorMessage = error.response.data?.message || error.response.data?.error || `Server error: ${error.response.status}`;
        console.error('Server error response:', error.response.data);
      } else if (error.request) {
        errorMessage = 'No response from server. Please check your connection.';
        console.error('No response received:', error.request);
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. AI generation can take a while. Please try again.';
      }

      toast.error('Failed to generate note: ' + errorMessage);
    } finally {
      setGeneratingNote(false);
    }
  };

  // const downloadPDF = () => {

  //   const doc = new jsPDF();

  //   let yOffset = 10;

  //   // Add header image if exists
  //   if (note.headerImage) {
  //     doc.addImage(note.headerImage, 'PNG', 10, yOffset, 190, 30); // Centered, adjust size as needed
  //     yOffset += 40;
  //   }

  //   // Add note content
  //   doc.html(note.content, {
  //     callback: function (pdfDoc) {
  //       // Add footer image if exists
  //       if (note.footerImage) {
  //         const pageHeight = pdfDoc.internal.pageSize.height;
  //         pdfDoc.addImage(note.footerImage, 'PNG', 10, pageHeight - 40, 190, 30); // Centered at bottom
  //       }
  //       pdfDoc.save(`${note.title || 'Note'}.pdf`);
  //     },
  //     x: 10,
  //     y: yOffset,
  //     width: 190,
  //     windowWidth: 800,
  //   });
  // };

  // Replace the existing downloadPDF function with this async version


  const downloadPDF = async () => {
    try {
      // Get DrId from auth context, localStorage, or API call (adjust as needed)

      // Upload images to template API if new files are selected
      if (!useExistingTemplate && (headerFile || footerFile)) {
        const uploadFormData = new FormData();

        if (headerFile) {
          uploadFormData.append('headerImage', headerFile);
        }
        if (footerFile) {
          uploadFormData.append('footerImage', footerFile);
        }

        const uploadResponse = await axios.post('/api/templates/upload', uploadFormData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        });

        setHeaderFile(null);
        setFooterFile(null);
        toast.success('Header and footer images stored in template successfully');
      } else if (useExistingTemplate) {
        // No upload needed; existing images are already set in note state for PDF
        // Check if images are actually set
        if (!note.headerImage && !note.footerImage) {
          toast.error('Template images not loaded. Please select a template again.');
          return;
        }
      } else {
        // Check if images are already in note state (from previous uploads)
        if (!note.headerImage && !note.footerImage) {
          toast.warning('No header/footer images selected');
          return;  // Early return if neither
        }
      }

      // Proceed with existing PDF generation (unchanged)
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '595px'; // A4 width in pt (approx 210mm)
      tempDiv.style.padding = '0 20px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '10pt';
      tempDiv.style.lineHeight = '1.4';
      tempDiv.style.color = '#000';
      tempDiv.innerHTML = note.content;
      document.body.appendChild(tempDiv);

      const doc = new jsPDF('p', 'pt', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const marginSide = 20;
      const headerHeight = 60;
      const footerHeight = 60;
      const contentWidth = pageWidth - 2 * marginSide;
      const usableHeight = pageHeight - headerHeight - footerHeight;

      html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })
        .then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = contentWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;

          let heightLeft = imgHeight;
          let position = 0;
          let page = 1;

          while (heightLeft > 0) {
            if (page > 1) doc.addPage();

            // Add Header
            if (note.headerImage) {
              doc.addImage(note.headerImage, 'PNG', 0, 0, pageWidth, headerHeight);
            }

            // Calculate Y crop (for multi-page splitting)
            const sourceY = position * (canvas.height / imgHeight);
            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');
            const pageCanvasHeight = Math.min(
              (usableHeight * canvas.height) / imgHeight,
              canvas.height - sourceY
            );
            pageCanvas.width = canvas.width;
            pageCanvas.height = pageCanvasHeight;
            pageCtx?.drawImage(
              canvas,
              0,
              sourceY,
              canvas.width,
              pageCanvasHeight,
              0,
              0,
              canvas.width,
              pageCanvasHeight
            );

            const pageImgData = pageCanvas.toDataURL('image/png');
            const pageImgHeight = (pageCanvasHeight * imgWidth) / canvas.width;

            // Add content image for this page (below header, above footer)
            doc.addImage(pageImgData, 'PNG', marginSide, headerHeight, imgWidth, pageImgHeight);

            // Add Footer
            if (note.footerImage) {
              doc.addImage(note.footerImage, 'PNG', 0, pageHeight - footerHeight, pageWidth, footerHeight);
            }

            heightLeft -= usableHeight;
            position += usableHeight;
            page++;
          }

          document.body.removeChild(tempDiv);
          doc.save(`${note.title || 'Note'}.pdf`);
        })
        .catch((error) => {
          console.error('Error generating PDF:', error);
          toast.error('Failed to generate PDF');
        });
    } catch (error: any) {
      console.error('Error uploading images or generating PDF:', error);
      toast.error(`Failed: ${error.response?.data?.message || error.message}`);
    }
  };
  // Update the existing useEffect for fetching data: Add template fetch after patients/visits load
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // ... existing patients and note fetch code ...


        console.log('Fetching existing template for DrId:', token);
        if (token) {
          try {
            const templateResponse = await axios.get(`/api/templates/get-Templates`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (templateResponse.data && Array.isArray(templateResponse.data.data)) {
              setExistingTemplates(templateResponse.data.data);
              // Optional: Auto-select first if none selected
              if (templateResponse.data.data.length > 0 && !selectedTemplateId) {
                setSelectedTemplateId(templateResponse.data.data[0]._id);
              }
            }
          } catch (templateError: any) {
            console.error('Error fetching existing template:', templateError);
            toast.error('Failed to load existing template');
          }
        }
      } catch (error: any) {
        // ... existing error handling ...
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEditMode, token]);  // No change to dependencies


  // Save note to database
  // This is the ONLY function that should save notes to the database
  // It is called when user explicitly clicks "Save Note" button
  const saveNote = async () => {
    // Prevent double-save - if already saving, don't proceed
    if (saving) {
      console.log('Save already in progress, ignoring duplicate call');
      return;
    }

    if (!note.title || !note.content || !note.patient || !note.noteType) {
      toast.error('Please fill in all required fields including Note Type');
      return;
    }

    // Prevent saving if note is being generated
    if (generatingNote) {
      toast.error('Please wait for note generation to complete');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('title', note.title);
      formData.append('content', note.content);
      formData.append('noteType', note.noteType);
      formData.append('colorCode', note.colorCode || '#FFFFFF');
      formData.append('patientId', note.patient.toString());
      if (note.visit) {
        formData.append('visitId', note.visit.toString());
      }
      if (note.diagnosisCodes.length > 0) {
        formData.append('diagnosisCodes', JSON.stringify(note.diagnosisCodes));
      }
      if (note.treatmentCodes.length > 0) {
        formData.append('treatmentCodes', JSON.stringify(note.treatmentCodes));
      }
      filesToUpload.forEach(file => {
        formData.append('attachments', file);
      });
      if (filesToRemove.length > 0) {
        formData.append('removeAttachments', JSON.stringify(filesToRemove));
      }
      formData.append('isAiGenerated', note.isAiGenerated.toString());
      formData.append('headerImage', note.headerImage || '');
      formData.append('footerImage', note.footerImage || '');
      if (!token) {
        console.error('Authentication token is missing');
        toast.error('Authentication error. Please log in again.');
        return;
      }
      if (isEditMode && id) {
        await axios.put(`/api/notes/${id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        });
        toast.success('Note updated successfully');
      } else {
        await axios.post('/api/notes', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
        });
        toast.success('Note created successfully');
      }
      // Immediately navigate away to prevent duplicate saves
      // Clear the form state before navigating to ensure no accidental re-saves
      setNote({
        title: '',
        content: '',
        noteType: '',
        colorCode: '#FFFFFF',
        patient: '',
        visit: null,
        diagnosisCodes: [],
        treatmentCodes: [],
        attachments: [],
        isAiGenerated: false,
        headerImage: '',
        footerImage: '',
      });
      navigate('/notes');
    } catch (error: any) {
      console.error('Error saving note:', error);
      toast.error(`Failed to save note: ${error.response?.data.message || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Add this new handler function near other handlers (e.g., after handleFooterImageChange)
  // Called when user clicks "Use Existing Template"
  // Replace entire function:
  const getImageUrl = (path: string): string => {
    if (!path) return '';
    // Normalize path separators
    let normalizedPath = path.replace(/\\/g, '/');
    // Remove leading slash if present, then add it back to ensure consistent format
    normalizedPath = normalizedPath.replace(/^\/+/, '');
    // Use the API base URL for images since frontend and backend are on different ports
    const apiBaseUrl = API_URL;
    // Ensure it starts with / for absolute path
    return `${apiBaseUrl}/${normalizedPath}`;
  };

  // Memoize selected template to prevent re-renders
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return existingTemplates.find(t => t._id === selectedTemplateId) || null;
  }, [existingTemplates, selectedTemplateId]);

  // Memoize the selected template's image paths to use as stable dependencies
  const selectedTemplateImagePaths = useMemo(() => {
    if (!selectedTemplateId) return { header: '', footer: '' };
    const template = existingTemplates.find(t => t._id === selectedTemplateId);
    return {
      header: template?.headerImage || '',
      footer: template?.footerImage || ''
    };
  }, [selectedTemplateId, existingTemplates]);

  // Update preview URLs when template selection or image paths change
  useEffect(() => {
    if (!selectedTemplateId) {
      setHeaderPreviewUrl('');
      setFooterPreviewUrl('');
      return;
    }

    const newHeaderUrl = selectedTemplateImagePaths.header ? getImageUrl(selectedTemplateImagePaths.header) : '';
    const newFooterUrl = selectedTemplateImagePaths.footer ? getImageUrl(selectedTemplateImagePaths.footer) : '';

    setHeaderPreviewUrl(newHeaderUrl);
    setFooterPreviewUrl(newFooterUrl);
  }, [selectedTemplateId, selectedTemplateImagePaths.header, selectedTemplateImagePaths.footer]);
  const handleUseExisting = async () => {
    const template = existingTemplates.find(t => t._id === selectedTemplateId);
    if (template && template.headerImage && template.footerImage) {
      // Fetch images as base64 for PDF (since paths are server-side)
      try {
        const headerBase64 = await fetchImageAsBase64(getImageUrl(template.headerImage));
        const footerBase64 = await fetchImageAsBase64(getImageUrl(template.footerImage));
        setNote(prev => ({ ...prev, headerImage: headerBase64, footerImage: footerBase64 }));
        setUseExistingTemplate(true);
        setHeaderFile(null);
        setFooterFile(null);
        toast.success('Switched to selected template');
      } catch (error) {
        toast.error('Failed to load template images');
      }
    } else {
      toast.warning('No valid template selected');
    }
  };

  // Add this new helper function (near getImageUrl):
  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Optional: Add a toggle to switch back to custom uploads
  const handleUseCustom = () => {
    setNote(prev => ({ ...prev, headerImage: '', footerImage: '' }));
    setUseExistingTemplate(false);
    toast.info('Switched to custom uploads');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <button onClick={() => navigate('/notes')} className="mr-4 p-2 rounded-full hover:bg-gray-200">
            <FaArrowLeft />
          </button>
          <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Note' : 'Create New Note'}</h1>
        </div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={generateNote}
            disabled={!note.patient || !note.noteType || generatingNote}
            className={`flex items-center px-4 py-2 rounded-md ${generatingNote || !note.patient || !note.noteType
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-purple-500 text-white hover:bg-purple-600'
              }`}
          >
            {generatingNote ? <FaSpinner className="animate-spin mr-2" /> : <FaRobot className="mr-2" />}
            Generate with AI
          </button>

          <button
            onClick={downloadPDF}
            disabled={!note.content.trim() || (!useExistingTemplate && !headerFile && !footerFile && !note.headerImage && !note.footerImage)}
            className={`${!note.content.trim() || (!useExistingTemplate && !headerFile && !footerFile && !note.headerImage && !note.footerImage) ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-500 text-white hover:bg-green-600'} flex items-center px-4 py-2 rounded-md`}
          >
            <FaDownload className="mr-2" />
            Download PDF
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              saveNote();
            }}
            disabled={saving || generatingNote}
            className={`flex items-center px-4 py-2 bg-blue-500 text-white rounded-md ${saving || generatingNote ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-600'
              }`}
          >
            {saving ? <FaSpinner className="animate-spin mr-2" /> : <FaSave className="mr-2" />}
            Save Note
          </button>
        </div>
      </div>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              name="title"
              value={note.title}
              onChange={handleChange}
              className="w-full p-2 border rounded-md"
              placeholder="Note Title"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note Type *</label>
            <select
              name="noteType"
              value={note.noteType}
              onChange={handleChange}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="">Select Note Type</option>
              <option value="Progress">Progress Note</option>
              <option value="Consultation">Consultation Note</option>
              <option value="New ER Operative Report">New ER Operative Report</option>
              <option value="New OR Operative Report">New OR Operative Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient *</label>
            <select
              name="patient"
              value={typeof note.patient === 'string' ? note.patient : note.patient?._id || ''}
              onChange={e => handlePatientChange(e.target.value)}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="">Select Patient</option>
              {patients && patients.length > 0 ? (
                patients.map(patient => (
                  <option key={patient._id} value={patient._id}>
                    {patient.firstName} {patient.lastName} ({new Date(patient.dateOfBirth).toLocaleDateString()})
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No patients available
                </option>
              )}
            </select>
            {!loading && patients && patients.length === 0 && (
              <p className="text-red-500 text-sm mt-1">No patients found. Please check your connection or permissions.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Related Visit</label>
            <select
              name="visit"
              value={note.visit ? note.visit.toString() : ''}
              onChange={handleChange}
              className="w-full p-2 border rounded-md"
            >
              <option value="">None</option>
              {visits &&
                visits.map(visit => (
                  <option key={visit._id} value={visit._id}>
                    {visit.visitType.charAt(0).toUpperCase() + visit.visitType.slice(1)} Visit -{' '}
                    {new Date(visit.date).toLocaleDateString()}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color Code</label>
            <div className="flex items-center relative">
              <div
                className="w-10 h-10 border-2 border-gray-300 rounded-md mr-2 cursor-pointer hover:border-blue-500 transition-colors"
                style={{ backgroundColor: note.colorCode || '#FFFFFF' }}
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="Click to open color picker"
              />
              <input
                type="text"
                name="colorCode"
                value={note.colorCode || '#FFFFFF'}
                onChange={handleChange}
                className="w-32 p-2 border rounded-md"
                placeholder="#FFFFFF"
              />
              {showColorPicker && (
                <div className="absolute z-50" style={{ top: '100%', left: 0, marginTop: '8px' }}>
                  <div
                    className="fixed inset-0"
                    onClick={() => setShowColorPicker(false)}
                    style={{ zIndex: 40 }}
                  />
                  <div style={{ position: 'relative', zIndex: 50 }}>
                    <ChromePicker
                      color={note.colorCode || '#FFFFFF'}
                      onChange={handleColorChange}
                      onChangeComplete={(color) => {
                        setNote(prev => ({ ...prev, colorCode: color.hex || '#FFFFFF' }));
                      }}
                      disableAlpha={false}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700">Note Content *</label>
            <div className="flex space-x-2">
              {note.noteType === 'Progress' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const selectedPatient = patients.find(p => p._id === note.patient);
                      setNote(prev => ({
                        ...prev,
                        content: getSOAPTemplate({
                          ...soapFormData,
                          patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : '',
                          patientDOB: selectedPatient ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : '',
                        }),
                      }));
                    }}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Load SOAP Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSOAPForm(true)}
                    className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    <FaEdit className="inline mr-1" /> Corresponding Form
                  </button>
                </>
              )}
              {note.noteType === 'Consultation' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const selectedPatient = patients.find(p => p._id === note.patient);
                      setNote(prev => ({ ...prev, content: getConsultTemplate(selectedPatient, correspondingFormData) }));
                    }}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Load Consult Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCorrespondingForm(true)}
                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                  >
                    Edit Corresponding Form
                  </button>
                </>
              )}
              {note.noteType === 'New ER Operative Report' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const selectedPatient = patients.find(p => p._id === note.patient);
                      setNote(prev => ({ ...prev, content: getEROperativeTemplate(selectedPatient, erCorrespondingFormData) }));
                    }}
                    className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Load ER Operative Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowERCorrespondingForm(true)}
                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                  >
                    Edit Corresponding Form
                  </button>
                </>
              )}
              {note.noteType === 'New OR Operative Report' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const selectedPatient = patients.find(p => p._id === note.patient);
                      setNote(prev => ({ ...prev, content: getOROperativeTemplate(selectedPatient, orCorrespondingFormData) }));
                    }}
                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                  >
                    Load OR Operative Template
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowORCorrespondingForm(true)}
                    className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
                  >
                    Edit Corresponding Form
                  </button>
                </>
              )}
            </div>
          </div>
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={note.content || ''}
            onChange={handleContentChange}
            modules={quillModules}
            className="h-64 mb-12"
          />
        </div>
        {showCorrespondingForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit Corresponding Form</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRN</label>
                  <input
                    type="text"
                    name="mrn"
                    value={correspondingFormData.mrn}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="MRN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assessment</label>
                  <textarea
                    name="assessment"
                    value={correspondingFormData.assessment}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Assessment"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                  <textarea
                    name="plan"
                    value={correspondingFormData.plan}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Plan"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medications</label>
                  <select
                    name="medications"
                    value={correspondingFormData.medications.startsWith('other') ? 'other' : correspondingFormData.medications}
                    onChange={(e) => {
                      const value = e.target.value === 'other' ? 'other_____' : e.target.value;
                      setCorrespondingFormData(prev => ({ ...prev, medications: value }));
                    }}
                    className="w-full p-2 border rounded-md mb-2"
                  >
                    <option value="None">None</option>
                    <option value="Ordered Antibiotics">Ordered Antibiotics</option>
                    <option value="Discontinue antibiotics">Discontinue antibiotics</option>
                    <option value="other">Other</option>
                  </select>
                  {correspondingFormData.medications.startsWith('other') && (
                    <input
                      type="text"
                      value={correspondingFormData.medications.replace('other', '').replace('_____', '')}
                      onChange={(e) => {
                        const value = e.target.value ? `other${e.target.value}` : 'other_____';
                        setCorrespondingFormData(prev => ({ ...prev, medications: value }));
                      }}
                      className="w-full p-2 border rounded-md"
                      placeholder="Enter medication details"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Therapy</label>
                  <select
                    name="therapy"
                    value={correspondingFormData.therapy}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="None">None</option>
                    <option value="Ordered">Ordered</option>
                    <option value="Continue">Continue</option>
                    <option value="Discontinue">Discontinue</option>
                    <option value="Offered and Declined">Offered and Declined</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Outside Imaging or Nerve Study</label>
                  <select
                    name="outsideImaging"
                    value={correspondingFormData.outsideImaging.startsWith('Prescription Provided') ? 'Prescription Provided' : correspondingFormData.outsideImaging}
                    onChange={(e) => {
                      const value = e.target.value === 'Prescription Provided' ? 'Prescription Provided for ______' : e.target.value;
                      setCorrespondingFormData(prev => ({ ...prev, outsideImaging: value }));
                    }}
                    className="w-full p-2 border rounded-md mb-2"
                  >
                    <option value="None">None</option>
                    <option value="Prescription Provided">Prescription Provided</option>
                  </select>
                  {correspondingFormData.outsideImaging.startsWith('Prescription Provided') && (
                    <input
                      type="text"
                      value={correspondingFormData.outsideImaging.replace('Prescription Provided for ', '').replace('______', '')}
                      onChange={(e) => {
                        const value = e.target.value ? `Prescription Provided for ${e.target.value}` : 'Prescription Provided for ______';
                        setCorrespondingFormData(prev => ({ ...prev, outsideImaging: value }));
                      }}
                      className="w-full p-2 border rounded-md"
                      placeholder="Enter imaging or study type"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Splint</label>
                  <select
                    name="splint"
                    value={correspondingFormData.splint}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="None">None</option>
                    <option value="Options should be provided">Options should be provided</option>
                    <option value="ordered">Ordered</option>
                    <option value="discontinued">Discontinued</option>
                    <option value="continued">Continued</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Splint Type</label>
                  <input
                    type="text"
                    name="splintType"
                    value={correspondingFormData.splintType}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Splint Type"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Injections</label>
                  <select
                    name="injections"
                    value={correspondingFormData.injections}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="None (Default)">None (Default)</option>
                    <option value="Fluoroscopy guided">Fluoroscopy guided</option>
                    <option value="not fluoroscopy guided">Not fluoroscopy guided</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Injection Location</label>
                  <input
                    type="text"
                    name="injectionLocation"
                    value={correspondingFormData.injectionLocation}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Injection Location"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Injection Medication</label>
                  <select
                    name="injectionMedication"
                    value={correspondingFormData.injectionMedication}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="Kenalog">Kenalog</option>
                    <option value="Kenalog, Kenalog">Kenalog, Kenalog</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work/School Status</label>
                  <select
                    name="workSchoolStatus"
                    value={correspondingFormData.workSchoolStatus}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="No Restrictions">No Restrictions</option>
                    <option value="One handed duty">One handed duty</option>
                    <option value="5Lbs restriction">5Lbs restriction</option>
                    <option value="10lbs restriction">10lbs restriction</option>
                    <option value="15lbs Restriction">15lbs Restriction</option>
                    <option value="20lbs restriction">20lbs restriction</option>
                    <option value="no gym class">No gym class</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specific Comments</label>
                  <textarea
                    name="specificComments"
                    value={correspondingFormData.specificComments}
                    onChange={handleCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Specific Comments"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4 space-x-2">
                <button
                  onClick={() => setShowCorrespondingForm(false)}
                  className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCorrespondingFormSubmit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Update Note
                </button>
              </div>
            </div>
          </div>
        )}
        {showERCorrespondingForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit Corresponding Form</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRN</label>
                  <input
                    type="text"
                    name="mrn"
                    value={erCorrespondingFormData.mrn}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="MRN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Surgeon</label>
                  <input
                    type="text"
                    name="surgeon"
                    value={erCorrespondingFormData.surgeon}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Surgeon"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Implants</label>
                  <textarea
                    name="implants"
                    value={erCorrespondingFormData.implants}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Implants"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wound Class</label>
                  <select
                    name="woundClass"
                    value={erCorrespondingFormData.woundClass}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="Contaminated">Contaminated</option>
                    <option value="Dirty">Dirty</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preoperative Diagnosis</label>
                  <textarea
                    name="preoperativeDiagnosis"
                    value={erCorrespondingFormData.preoperativeDiagnosis}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Preoperative Diagnosis"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postoperative Diagnosis</label>
                  <textarea
                    name="postoperativeDiagnosis"
                    value={erCorrespondingFormData.postoperativeDiagnosis}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Postoperative Diagnosis (leave blank to use same as preoperative)"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Procedure List</label>
                  <textarea
                    name="procedureList"
                    value={erCorrespondingFormData.procedureList}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Procedure List"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specific notes about the surgery</label>
                  <textarea
                    name="specificNotes"
                    value={erCorrespondingFormData.specificNotes}
                    onChange={handleERCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Specific notes about the surgery"
                    rows={4}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4 space-x-2">
                <button
                  onClick={() => setShowERCorrespondingForm(false)}
                  className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleERCorrespondingFormSubmit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Update Note
                </button>
              </div>
            </div>
          </div>
        )}
        {showORCorrespondingForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit Corresponding Form</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRN</label>
                  <input
                    type="text"
                    name="mrn"
                    value={orCorrespondingFormData.mrn}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="MRN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Surgeon</label>
                  <input
                    type="text"
                    name="surgeon"
                    value={orCorrespondingFormData.surgeon}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Surgeon"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assistant Surgeon</label>
                  <input
                    type="text"
                    name="assistantSurgeon"
                    value={orCorrespondingFormData.assistantSurgeon}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Assistant Surgeon"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Anesthesia Type</label>
                  <input
                    type="text"
                    name="anesthesiaType"
                    value={orCorrespondingFormData.anesthesiaType}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Anesthesia Type"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Implants</label>
                  <textarea
                    name="implants"
                    value={orCorrespondingFormData.implants}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Implants"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wound Class</label>
                  <select
                    name="woundClass"
                    value={orCorrespondingFormData.woundClass}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="Clean">Clean</option>
                    <option value="Contaminated">Contaminated</option>
                    <option value="Dirty">Dirty</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preoperative Diagnosis</label>
                  <textarea
                    name="preoperativeDiagnosis"
                    value={orCorrespondingFormData.preoperativeDiagnosis}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Preoperative Diagnosis"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postoperative Diagnosis</label>
                  <textarea
                    name="postoperativeDiagnosis"
                    value={orCorrespondingFormData.postoperativeDiagnosis}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Postoperative Diagnosis (leave blank to use same as preoperative)"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Procedure List</label>
                  <textarea
                    name="procedureList"
                    value={orCorrespondingFormData.procedureList}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Procedure List"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specific notes about the surgery</label>
                  <textarea
                    name="specificNotes"
                    value={orCorrespondingFormData.specificNotes}
                    onChange={handleORCorrespondingFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Specific notes about the surgery"
                    rows={4}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4 space-x-2">
                <button
                  onClick={() => setShowORCorrespondingForm(false)}
                  className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleORCorrespondingFormSubmit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Update Note
                </button>
              </div>
            </div>
          </div>
        )}
        {showSOAPForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50 ">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit SOAP Note</h2>
              <div className="space-y-4">
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1 ">Patient Name</label>
                  <input
                    type="text"
                    name="patientName"
                    value={soapFormData.patientName}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Patient Name"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient Date of Birth</label>
                  <input
                    type="text"
                    name="patientDOB"
                    value={soapFormData.patientDOB}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Patient DOB"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    name="location"
                    value={soapFormData.location}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Location"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Service</label>
                  <input
                    type="text"
                    name="dateOfService"
                    value={soapFormData.dateOfService}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Date of Service"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">MRN</label>
                  <input
                    type="text"
                    name="mrn"
                    value={soapFormData.mrn}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="MRN"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subjective Key Points</label>
                  <textarea
                    name="subjectiveKeyPoints"
                    value={soapFormData.subjectiveKeyPoints}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Key points about the subjective"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Physical Exam Findings</label>
                  <textarea
                    name="physicalExamFindings"
                    value={soapFormData.physicalExamFindings}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Key physical exam findings"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan Key Points</label>
                  <textarea
                    name="planKeyPoints"
                    value={soapFormData.planKeyPoints}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md"
                    placeholder="Plan"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subjective</label>
                  <textarea
                    name="subjective"
                    value={soapFormData.subjective}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md h-24"
                    placeholder="Subjective details"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Objective</label>
                  <textarea
                    name="objective"
                    value={soapFormData.objective}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md h-24"
                    placeholder="Objective details"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">X-Rays</label>
                  <textarea
                    name="xRays"
                    value={soapFormData.xRays}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md h-24"
                    placeholder="X-Ray findings"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assessment</label>
                  <textarea
                    name="assessment"
                    value={soapFormData.assessment}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md h-24"
                    placeholder="Assessment details"
                  />
                </div>
                <div className='hidden'>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                  <textarea
                    name="plan"
                    value={soapFormData.plan}
                    onChange={handleSOAPFormChange}
                    className="w-full p-2 border rounded-md h-24"
                    placeholder="Plan details"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4 space-x-2">
                <button
                  onClick={() => setShowSOAPForm(false)}
                  className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSOAPFormSubmit}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Update Note
                </button>
              </div>
            </div>
          </div>
        )}
        {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Diagnosis Codes</label>
            <div className="flex">
              <input
                type="text"
                value={diagnosisSearch}
                onChange={e => setDiagnosisSearch(e.target.value)}
                placeholder="Search diagnosis codes..."
                className="w-full p-2 border rounded-l-md"
              />
              <button
                onClick={searchDiagnosisCodes}
                disabled={searchingDiagnosis || !diagnosisSearch.trim()}
                className={`px-4 py-2 rounded-r-md ${searchingDiagnosis || !diagnosisSearch.trim()
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
              >
                {searchingDiagnosis ? <FaSpinner className="animate-spin" /> : 'Search'}
              </button>
            </div>
            {diagnosisResults.length > 0 && (
              <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
                {diagnosisResults.map(code => (
                  <div
                    key={code.code}
                    className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                    onClick={() => addDiagnosisCode(code)}
                  >
                    <div>
                      <span className="font-medium">{code.code}</span> - {code.description}
                    </div>
                    <button className="text-blue-500 hover:text-blue-700">Add</button>
                  </div>
                ))}
              </div>
            )}
            {note.diagnosisCodes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Diagnosis Codes:</h4>
                <div className="space-y-2">
                  {note.diagnosisCodes.map(code => (
                    <div key={code.code} className="flex justify-between items-center p-2 bg-blue-50 rounded-md">
                      <div>
                        <span className="font-medium">{code.code}</span> - {code.description}
                      </div>
                      <button
                        onClick={() => removeDiagnosisCode(code.code)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Treatment Codes</label>
            <div className="flex">
              <input
                type="text"
                value={treatmentSearch}
                onChange={e => setTreatmentSearch(e.target.value)}
                placeholder="Search treatment codes..."
                className="w-full p-2 border rounded-l-md"
              />
              <button
                onClick={searchTreatmentCodes}
                disabled={searchingTreatment || !treatmentSearch.trim()}
                className={`px-4 py-2 rounded-r-md ${searchingTreatment || !treatmentSearch.trim()
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
              >
                {searchingTreatment ? <FaSpinner className="animate-spin" /> : 'Search'}
              </button>
            </div>
            {treatmentResults.length > 0 && (
              <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
                {treatmentResults.map(code => (
                  <div
                    key={code.code}
                    className="p-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                    onClick={() => addTreatmentCode(code)}
                  >
                    <div>
                      <span className="font-medium">{code.code}</span> - {code.description}
                    </div>
                    <button className="text-blue-500 hover:text-blue-700">Add</button>
                  </div>
                ))}
              </div>
            )}
            {note.treatmentCodes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Treatment Codes:</h4>
                <div className="space-y-2">
                  {note.treatmentCodes.map(code => (
                    <div key={code.code} className="flex justify-between items-center p-2 bg-green-50 rounded-md">
                      <div>
                        <span className="font-medium">{code.code}</span> - {code.description}
                      </div>
                      <button
                        onClick={() => removeTreatmentCode(code.code)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Attachments</label>
          <div className="flex items-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
              accept="image/jpeg,image/png,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Select Files
            </button>
            <span className="ml-2 text-sm text-gray-500">
              Supported formats: Images, PDFs, and Office documents (max 10MB each)
            </span>
          </div>
          {filesToUpload.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Files to Upload:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filesToUpload.map((file, index) => (
                  <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <div className="truncate">
                      <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
                    </div>
                    <button onClick={() => removeSelectedFile(index)} className="text-red-500 hover:text-red-700">
                      <FaTrash />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {note.attachments.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Existing Attachments:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {note.attachments.map(attachment => (
                  <div key={attachment._id} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                    <div className="truncate">
                      <span className="font-medium">{attachment.originalname}</span> (
                      {(attachment.size / 1024).toFixed(1)} KB)
                    </div>
                    <div className="flex space-x-2">
                      <a
                        href={`/${attachment.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700"
                      >
                        View
                      </a>
                      <button
                        onClick={() => markAttachmentForRemoval(attachment._id!)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div> */}
        {existingTemplates.length > 0 && (
          <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              <FaFileImage className="mr-2 text-blue-500" />
              Select Existing Template ({existingTemplates.length} available)
            </h3>

            {/* Dropdown for selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Choose Template:</label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                <option value="">-- Select a Template --</option>
                {existingTemplates.map((template) => (
                  <option key={template._id} value={template._id}>
                    Template {template._id.slice(-6)} - Header: {template.headerImage.split('\\').pop()?.split('-').pop() || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            {/* Preview of Selected */}
            {selectedTemplateId && selectedTemplate && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600 mb-2">Header Preview</p>
                    <div className="relative bg-white p-2 rounded-lg shadow-md border">
                      {headerPreviewUrl ? (
                        <img
                          key={`header-${selectedTemplateId}`}
                          src={headerPreviewUrl}
                          alt="Header Preview"
                          className="w-full h-24 object-contain rounded border"
                          onError={(e) => {
                            console.error('Header image load error:', headerPreviewUrl);
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center text-gray-400">No header image</div>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-600 mb-2">Footer Preview</p>
                    <div className="relative bg-white p-2 rounded-lg shadow-md border">
                      {footerPreviewUrl ? (
                        <img
                          key={`footer-${selectedTemplateId}`}
                          src={footerPreviewUrl}
                          alt="Footer Preview"
                          className="w-full h-24 object-contain rounded border"
                          onError={(e) => {
                            console.error('Footer image load error:', footerPreviewUrl);
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center text-gray-400">No footer image</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleUseExisting}
                disabled={!selectedTemplateId || useExistingTemplate}
                className={`px-6 py-2 rounded-md font-medium transition ${!selectedTemplateId || useExistingTemplate
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
              >
                {useExistingTemplate ? 'Using Selected' : 'Use Selected Template'}
              </button>
              {useExistingTemplate && (
                <button
                  onClick={handleUseCustom}
                  className="px-6 py-2 bg-gray-500 text-white rounded-md font-medium hover:bg-gray-600 transition"
                >
                  Switch to Custom
                </button>
              )}
            </div>

            {useExistingTemplate && selectedTemplateId && (
              <p className="mt-3 text-sm text-green-600 text-center italic">
                ✓ Template {selectedTemplateId.slice(-6)} selected for PDF
              </p>
            )}
          </div>
        )}
        <div className="flex flex-row items-center gap-6 mb-6">
          {/* Header Image Upload */}
          <div className="flex items-center gap-3 border rounded-lg p-3 w-full md:w-1/2 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 w-28">Header Image:</label>
            <div className="flex items-center gap-3 flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleHeaderImageChange}
                className="hidden"
                id="headerUpload"
              />
              {!note.headerImage ? (
                <label
                  htmlFor="headerUpload"
                  className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Upload
                </label>
              ) : (
                <div className="flex items-center gap-3">
                  <img
                    src={note.headerImage}
                    alt="Header Preview"
                    className="w-20 h-20 object-cover rounded shadow"
                  />
                  <button
                    onClick={() =>
                      setNote((prev) => ({ ...prev, headerImage: '' }))
                    }
                    className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer Image Upload */}
          <div className="flex items-center gap-3 border rounded-lg p-3 w-full md:w-1/2 bg-gray-50">
            <label className="block text-sm font-medium text-gray-700 w-28">Footer Image:</label>
            <div className="flex items-center gap-3 flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleFooterImageChange}
                className="hidden"
                id="footerUpload"
              />
              {!note.footerImage ? (
                <label
                  htmlFor="footerUpload"
                  className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Upload
                </label>
              ) : (
                <div className="flex items-center gap-3">
                  <img
                    src={note.footerImage}
                    alt="Footer Preview"
                    className="w-20 h-20 object-cover rounded shadow"
                  />
                  <button
                    onClick={() =>
                      setNote((prev) => ({ ...prev, footerImage: '' }))
                    }
                    className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>


        {/* {!isEditMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Information for AI Generation
            </label>
            <textarea
              value={promptData}
              onChange={e => setPromptData(e.target.value)}
              placeholder="Add any additional information you'd like to include in the AI-generated note..."
              className="w-full p-2 border rounded-md h-24"
            />
            <p className="text-sm text-gray-500 mt-1">
              This information will be used when generating a note with AI. It will not be saved unless you generate a
              note.
            </p>
          </div>
        )} */}
      </div>
    </div>
  );
};

export default NoteForm;