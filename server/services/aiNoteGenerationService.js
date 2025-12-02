import Patient from '../models/Patient.js';
import { Visit } from '../models/Visit.js';
import Note from '../models/Note.js';
import { createEmptyConsultationNote, formatConsultationNote } from '../models/ConsultationNoteStructure.js';
import { saveAIResponseToFile, formatConsultationNote as formatNote } from '../utils/noteFormatter.js';
import { OpenAI } from 'openai';

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

class AINoteGenerationService {
  
  // Call OpenAI API
  async callOpenAIAPI(systemPrompt, userPrompt) {
    try {
      console.log('Calling OpenAI API...');
      console.log('System Prompt Length:', systemPrompt.length);
      console.log('User Prompt Length:', userPrompt.length);
      
      // Validate inputs
      if (!systemPrompt || !userPrompt) {
        throw new Error('System prompt and user prompt are required');
      }
      
      if (systemPrompt.length > 100000 || userPrompt.length > 100000) {
        throw new Error('Prompt too long. Maximum 100,000 characters allowed.');
      }
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const generatedText = completion.choices[0]?.message?.content;
      
      if (!generatedText || generatedText.trim().length === 0) {
        console.error('Empty response from OpenAI API:', completion);
        throw new Error('Empty response from OpenAI API');
      }
      
      console.log('Generated text length:', generatedText.length);
      console.log('Generated text preview:', generatedText.substring(0, 200) + '...');
      
      return generatedText;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      
      if (error.message?.includes('timeout')) {
        throw new Error('Request timeout: OpenAI API took too long to respond');
      }
      
      throw error;
    }
  }
  
  // Get patient data with all relevant information
  async getPatientData(patientId) {
    try {
      console.log('Fetching patient data for ID:', patientId);
      
      const patient = await Patient.findById(patientId);
      if (!patient) {
        console.error('Patient not found for ID:', patientId);
        throw new Error('Patient not found');
      }
      
      console.log('Patient found:', {
        _id: patient._id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth
      });

      // Get all visits for this patient
      const visits = await Visit.find({ patient: patientId })
        .sort({ date: -1 })
        .populate('patient')
        .populate('doctor');
      
      console.log('Found visits:', visits.length);

      // Get all previous notes for this patient
      const previousNotes = await Note.find({ patient: patientId })
        .sort({ createdAt: -1 })
        .populate('doctor')
        .populate('visit');
      
      console.log('Found previous notes:', previousNotes.length);

      return {
        patient,
        visits,
        previousNotes
      };
    } catch (error) {
      console.error('Error fetching patient data:', error);
      throw error;
    }
  }

  // Generate Progress Note
  async generateProgressNote(patientId, visitId, promptData) {
    const { patient, visits, previousNotes } = await this.getPatientData(patientId);
    
    const systemPrompt = `You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience for this SOAP note includes insurance auditors, judges, or juries, where fine details are critical.

Key Instructions:
1. Tone and Detail:
   - All responses must be overly detailed. Every piece of information provided in the prompt is essential; no details should be removed. If any details are missing or unclear, you must add or clarify them.
2. Subjective:
   - The subjective portion should always be written in paragraph format. It must include:
     - The patient's age and gender.
     - The time elapsed since any injury (e.g., "7 days after the patient fell and broke her wrist").
     - The time elapsed since surgery if applicable (e.g., "post-op day 10 after [insert surgery]").
     - A brief recap of their clinical course to date including any issues or complications and specifically a recap of what occurred during the last visit.
     - An update on how the patient is doing during the current visit.
3. Objective: A standard exam that would be expected given the information provided. However do not include vital signs since my office does not take those.
4. X-Rays: For any patient who's diagnosis includes a fracture please put the appropriate x-rays and X ray findings for this patient.
5. Assessment:
   - Provide a comprehensive summary of the patient's medical condition in sentence format. This should include time elapsed since surgery if I operated on the patient.
   - Follow this with a numbered list of diagnoses, each with the correct ICD-10 codes. After the ICD10 code write the official description of the code in parenthesis.
6. Plan: For anything that is not applicable put not applicable
   - Structure the plan as a numbered list and sub lists.
   - Divide the plan into services provided during today's visit.
   - Prescriptions Provided: Therapy, splint, antibiotics, imaging or other.
   - Dressing or Splint care
   - Activity: Showering weight limits
   - Work or school status
   - Follow up:`;

    const currentDate = new Date().toLocaleDateString();
    const patientAge = this.calculateAge(patient.dateOfBirth);
    const patientGender = patient.gender || 'Unknown';

    let prompt = `Generate a SOAP note for the patient's office follow up on ${currentDate}.

I expect that the following will be carried over directly from the intake form or EMR:
• Patient Name: ${patient.firstName} ${patient.lastName}
• Patient Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}
• Location: [To be pulled from appointment settings]
• Date of Service: ${currentDate}
• MRN: [Internal MRN not hospital MRN]

Corresponding Form
• Key points about the subjective: [To be filled]
• Key physical exam findings: [To be filled]
• Plan:
  o Medications: None, Ordered Antibiotics, Discontinue antibiotics, other_____
  o Therapy: None, Ordered, Continue, Discontinue, Offered and Declined
  o Outside Imaging or Nerve Study: None, Prescription Provided for ______
  o Splint: Options should be provided, ordered, discontinued or continued
    - Type________
  o Injections: None (Default), Fluoroscopy guided, not fluoroscopy guided
    - Location
    - Medication: Kenalog, Kenalog
• Work/School Status: Changes
• Specific Comments:

Patient Information:
- Name: ${patient.firstName} ${patient.lastName}
- Age: ${patientAge} years old
- Gender: ${patientGender}
- Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}
- MRN: [Internal MRN]`;

    // Add medical history if available
    if (patient.dynamicData) {
      prompt += `\n\nMedical History from Intake Form:`;
      if (patient.dynamicData.medicalHistory) {
        prompt += `\n- Medical History: ${patient.dynamicData.medicalHistory}`;
      }
      if (patient.dynamicData.allergies) {
        prompt += `\n- Allergies: ${patient.dynamicData.allergies}`;
      }
      if (patient.dynamicData.medications) {
        prompt += `\n- Current Medications: ${patient.dynamicData.medications}`;
      }
      if (patient.dynamicData.surgicalHistory) {
        prompt += `\n- Surgical History: ${patient.dynamicData.surgicalHistory}`;
      }
    }

    // Add previous notes context
    if (previousNotes.length > 0) {
      prompt += `\n\nPrevious Clinical Course:`;
      previousNotes.slice(0, 3).forEach((note, index) => {
        const noteDate = new Date(note.createdAt).toLocaleDateString();
        prompt += `\n\nNote from ${noteDate} (${note.noteType}):`;
        prompt += `\n${note.content.substring(0, 500)}...`;
      });
    }

    // Add visit information if available
    if (visitId) {
      const visit = visits.find(v => v._id.toString() === visitId);
      if (visit) {
        prompt += `\n\nCurrent Visit Information:`;
        prompt += `\n- Visit Type: ${visit.visitType}`;
        prompt += `\n- Date: ${new Date(visit.date).toLocaleDateString()}`;
        if (visit.chiefComplaint) {
          prompt += `\n- Chief Complaint: ${visit.chiefComplaint}`;
        }
        if (visit.notes) {
          prompt += `\n- Visit Notes: ${visit.notes}`;
        }
      }
    }

    // Add additional prompt data
    if (promptData) {
      prompt += `\n\nAdditional Information: ${promptData}`;
    }

    return { systemPrompt, prompt };
  }

  // Generate Consultation Note
  async generateConsultationNote(patientId, visitId, promptData) {
    const { patient, visits, previousNotes } = await this.getPatientData(patientId);
    
    const systemPrompt = `You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience for this consult note includes insurance auditors, judges, or juries, where fine details are critical.

Key Instructions:
1. Tone and Detail:
   - All responses must be overly detailed. Every piece of information provided in the prompt is essential; no details should be removed. If any details are missing or unclear, you must add or clarify them. Please pull detail from the intake forms, visit forms, and any uploaded images or PDFs. For Any images or PDF of reports please analyze the text and focus on the interpretation or results section if present.
2. Formatting Requirements:
   - Do NOT use markdown code blocks (no \`\`\`html or \`\`\`)
   - Do NOT use bullet points (<ul> or <li> tags) - use plain text with <p> tags instead
   - Use single line spacing between items (one <br/> or one empty line between <p> tags)
   - Use proper HTML structure with semantic tags
   - All headings (h2, h3, h4) must be bold and properly spaced
   - Use <p> tags for each line item, with <strong> tags for labels
   - Add proper spacing between sections using <p> tags with margin
   - Use <br/> for line breaks within paragraphs when needed
   - Use <strong> tags for emphasis on important terms and labels
   - Maintain consistent spacing: one line between major sections
   - Structure content with clear hierarchy: main headings (h2), subheadings (h3), and sub-subheadings (h4)
   - Use proper paragraph spacing for readability`;

    const currentDate = new Date().toLocaleDateString();
    const patientAge = this.calculateAge(patient.dateOfBirth);
    const patientGender = patient.gender || 'Unknown';

    let prompt = `Generate a consultation note for the patient's consultation on ${currentDate}.

I expect that the following will be carried over directly from the intake form or EMR:
• Patient Name: ${patient.firstName} ${patient.lastName}
• Patient Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}
• Location: should be pulled from the appointment settings
• Date of Service: should be pulled from the appointment settings

Corresponding Form
• MRN: [To be filled]
• Assessment: [To be filled]
• Plan: [To be filled]
• Medications: None, Ordered Antibiotics, Discontinue antibiotics, other_____
• Therapy: None, Ordered, Continue, Discontinue, Offered and Declined
• Outside Imaging or Nerve Study: None, Prescription Provided for ______
• Splint: Options should be provided, ordered, discontinued or continued
  - Type________
• Injections: None (Default), Fluoroscopy guided, not fluoroscopy guided
  - Location
  - Medication: Kenalog, Kenalog
• Work/School Status: No Restrictions, One handed duty, 5Lbs restriction, 10lbs restriction, 15lbs Restriction, 20lbs restriction, no gym class
• Specific Comments: [To be filled]

Patient Information:
- Name: ${patient.firstName} ${patient.lastName}
- Age: ${patientAge} years old
- Gender: ${patientGender}
- Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}`;

    // Add medical history if available
    if (patient.dynamicData) {
      prompt += `\n\nMedical History from Intake Form:`;
      if (patient.dynamicData.medicalHistory) {
        prompt += `\n- Medical History: ${patient.dynamicData.medicalHistory}`;
      }
      if (patient.dynamicData.allergies) {
        prompt += `\n- Allergies: ${patient.dynamicData.allergies}`;
      }
      if (patient.dynamicData.medications) {
        prompt += `\n- Current Medications: ${patient.dynamicData.medications}`;
      }
      if (patient.dynamicData.surgicalHistory) {
        prompt += `\n- Surgical History: ${patient.dynamicData.surgicalHistory}`;
      }
    }

    // Add previous notes context
    if (previousNotes.length > 0) {
      prompt += `\n\nPrevious Clinical Course:`;
      previousNotes.slice(0, 3).forEach((note, index) => {
        const noteDate = new Date(note.createdAt).toLocaleDateString();
        prompt += `\n\nNote from ${noteDate} (${note.noteType}):`;
        prompt += `\n${note.content.substring(0, 500)}...`;
      });
    }

    // Add visit information if available
    if (visitId) {
      const visit = visits.find(v => v._id.toString() === visitId);
      if (visit) {
        prompt += `\n\nCurrent Visit Information:`;
        prompt += `\n- Visit Type: ${visit.visitType}`;
        prompt += `\n- Date: ${new Date(visit.date).toLocaleDateString()}`;
        if (visit.chiefComplaint) {
          prompt += `\n- Chief Complaint: ${visit.chiefComplaint}`;
        }
        if (visit.notes) {
          prompt += `\n- Visit Notes: ${visit.notes}`;
        }
      }
    }

    // Add additional prompt data
    if (promptData) {
      prompt += `\n\nAdditional Information: ${promptData}`;
    }

    const patientDOB = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'Not provided';
    
    prompt += `\n\nCRITICAL: You MUST generate the consultation note using the EXACT HTML structure shown below. Replace all bracketed placeholders [like this] with actual clinical content.

IMPORTANT FORMATTING RULES:
- Do NOT use markdown code blocks (no \`\`\`html or \`\`\`)
- Do NOT use bullet points (<ul> or <li> tags) - use plain text with <p> tags instead
- Use single line spacing between items (one <br/> or one empty line between <p> tags)
- Use <p> tags for each line item, with <strong> for labels

EXACT TEMPLATE STRUCTURE TO FOLLOW:

<h2>Consultation Note</h2>

<p><strong>I expect that the following will be carried over directly from the intake form or EMR:</strong></p>
<p><strong>Patient Name:</strong> ${patient.firstName} ${patient.lastName}</p>
<p><strong>Patient Date of Birth:</strong> ${patientDOB}</p>
<p><strong>Location:</strong> should be pulled from the appointment settings</p>
<p><strong>Date of Service:</strong> should be pulled from the appointment settings</p>

<h3>Corresponding Form</h3>
<p><strong>MRN:</strong> [Replace with appropriate MRN or leave as placeholder]</p>
<p><strong>Assessment:</strong> [Replace with comprehensive assessment based on patient's condition]</p>
<p><strong>Plan:</strong> [Replace with appropriate plan based on patient's condition]</p>
<p><strong>Medications:</strong> [Replace with appropriate option: None, Ordered Antibiotics, Discontinue antibiotics, or other specific medication]</p>
<p><strong>Therapy:</strong> [Replace with appropriate option: None, Ordered, Continue, Discontinue, Offered and Declined]</p>
<p><strong>Outside Imaging or Nerve Study:</strong> [Replace with appropriate option: None, or Prescription Provided for specific study]</p>
<p><strong>Splint:</strong> [Replace with appropriate option: Options should be provided, ordered, discontinued or continued]</p>
<p><strong>Type:</strong> [Replace with specific type if applicable, otherwise leave blank]</p>
<p><strong>Injections:</strong> [Replace with appropriate option: None (Default), Fluoroscopy guided, or not fluoroscopy guided]</p>
<p><strong>Location:</strong> [Replace with specific location if applicable, otherwise leave blank]</p>
<p><strong>Medication:</strong> Kenalog, Kenalog</p>
<p><strong>Work/School Status:</strong> [Replace with appropriate option: No Restrictions, One handed duty, 5Lbs restriction, 10lbs restriction, 15lbs Restriction, 20lbs restriction, no gym class]</p>
<p><strong>Specific Comments:</strong> [Replace with specific clinical comments based on patient's condition]</p>

<h4>Chief Complaint:</h4>
<p>[Replace with short description of why the consult is conducted based on patient information]</p>

<h4>HPI:</h4>
<p>[Replace with detailed paragraph including patient's age and gender, time elapsed since any injury, prehospital care received, care received in the hospital, medical history, surgical history and allergies, pain or sensory complaints, specific laterality of the injury, specific body part involved, and any studies/reports uploaded such as labs, imaging, nerve studies]</p>

<h4>Objective:</h4>
<p>[Replace with standard exam expected given the information provided. For heart and lungs, describe in terms of things that could be seen without listening. For example: Heart: Regular rate and rhythm (that can be checked by palpating the radial artery), Lungs: Regular respiratory rate and pattern, no respiratory distress. All other things do as normal]</p>

<h4>Assessment:</h4>
<p>[Replace with comprehensive summary of patient's medical condition in sentence format. Follow this with a numbered list of diagnoses, each with the correct ICD-10 codes]</p>

<h4>Plan:</h4>
<p>For anything that is not applicable put not applicable</p>
<p>Structure the plan as a numbered list and sub lists.</p>
<p>Divide the plan into services provided during today's visit.</p>
<p><strong>Prescriptions Provided:</strong> [Replace with: Therapy, splint, antibiotics, imaging or other specific prescriptions]</p>
<p><strong>Dressing or Splint care:</strong> [Replace with appropriate care instructions]</p>
<p><strong>Activity:</strong> [Replace with: Showering weight limits and activity restrictions]</p>
<p><strong>Work or school status:</strong> [Replace with appropriate status]</p>
<p><strong>Follow up:</strong> [Replace with appropriate follow-up instructions]</p>

CRITICAL INSTRUCTIONS:
- Generate actual clinical content, not template instructions
- Fill in all bracketed sections with real patient data and clinical information
- Do NOT use markdown code blocks - return pure HTML only (no \`\`\`html)
- Do NOT use bullet points - use <p> tags for each line item instead of <ul><li>
- Use single line spacing between items (one <br/> between <p> tags or one empty line)
- Use proper HTML structure: <h2> for main headings, <h3> for section headings, <h4> for subsections
- Make all headings bold using <strong> tags or ensure h2, h3, h4 render as bold
- Format items with <p> tags, using <strong> for labels (e.g., <p><strong>Patient Name:</strong> John Doe</p>)
- Add proper spacing: use <p> tags with content, add one blank line between major sections
- Use <br/> for line breaks within paragraphs when appropriate
- Ensure consistent formatting throughout the document
- Return the note in clean, well-structured HTML format following the structure above`;

    return { systemPrompt, prompt };
  }

  // Generate ER Operative Report
  async generateEROperativeReport(patientId, visitId, promptData) {
    const { patient, visits, previousNotes } = await this.getPatientData(patientId);
    
    const systemPrompt = `You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience includes insurance auditors, judges, and juries who require overly detailed, the documentation must be interpreted as precise and intentional. In cases with intraoperatively complications or adverse events they should be discussed in such a way that it was unavoidable, or inevitable due to the initial injury or the anatomy, or the patients actions. Add any missing details as needed.

Formatting Requirements:
- Every operative report must follow this standardized template
- Do NOT use markdown code blocks (no \`\`\`html or \`\`\`)
- Do NOT use bullet points (<ul> or <li> tags) - use plain text with <p> tags instead
- Use single line spacing between items (one <br/> or one empty line between <p> tags)
- Use proper HTML structure with semantic tags
- All headings (h2, h3, h4) must be bold and properly spaced
- Use <p> tags for each line item, with <strong> tags for labels
- Add proper spacing between sections using <p> tags with margin
- Use <br/> for line breaks within paragraphs when needed
- Use <strong> tags for emphasis on important terms and labels
- Maintain consistent spacing: one line between major sections
- Structure content with clear hierarchy: main headings (h2), subheadings (h3), and sub-subheadings (h4)
- Use proper paragraph spacing for readability
- Fill in all sections with actual clinical content based on the patient information provided`;

    const currentDate = new Date().toLocaleDateString();
    const patientAge = this.calculateAge(patient.dateOfBirth);
    const patientGender = patient.gender || 'Unknown';

    let prompt = `Generate an ER Operative Report for the following patient:

I expect that the following will be carried over directly from the intake form or EMR:
• Patient Name: ${patient.firstName} ${patient.lastName}
• Patient Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}
• Location: should be pulled from the appointment settings
• Date of Service: should be pulled from the appointment settings

Corresponding Form
• MRN: [To be filled]
• Surgeon: [To be filled]
• Implants: [To be filled]
• Wound Class: (Contaminated, Dirty) this should be a dropdown
• Preoperative Diagnosis: [To be filled]
• Postoperative Diagnosis: If left blank should be the same as above
• Procedure List: [To be filled]
• Specific notes about the surgery: [To be filled]

Patient Information:
- Name: ${patient.firstName} ${patient.lastName}
- Age: ${patientAge} years old
- Gender: ${patientGender}
- Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}`;

    // Add medical history if available
    if (patient.dynamicData) {
      prompt += `\n\nMedical History from Intake Form:`;
      if (patient.dynamicData.medicalHistory) {
        prompt += `\n- Medical History: ${patient.dynamicData.medicalHistory}`;
      }
      if (patient.dynamicData.allergies) {
        prompt += `\n- Allergies: ${patient.dynamicData.allergies}`;
      }
      if (patient.dynamicData.medications) {
        prompt += `\n- Current Medications: ${patient.dynamicData.medications}`;
      }
      if (patient.dynamicData.surgicalHistory) {
        prompt += `\n- Surgical History: ${patient.dynamicData.surgicalHistory}`;
      }
    }

    // Add previous notes context
    if (previousNotes.length > 0) {
      prompt += `\n\nPrevious Clinical Course:`;
      previousNotes.slice(0, 3).forEach((note, index) => {
        const noteDate = new Date(note.createdAt).toLocaleDateString();
        prompt += `\n\nNote from ${noteDate} (${note.noteType}):`;
        prompt += `\n${note.content.substring(0, 500)}...`;
      });
    }

    // Add visit information if available
    if (visitId) {
      const visit = visits.find(v => v._id.toString() === visitId);
      if (visit) {
        prompt += `\n\nCurrent Visit Information:`;
        prompt += `\n- Visit Type: ${visit.visitType}`;
        prompt += `\n- Date: ${new Date(visit.date).toLocaleDateString()}`;
        if (visit.chiefComplaint) {
          prompt += `\n- Chief Complaint: ${visit.chiefComplaint}`;
        }
        if (visit.notes) {
          prompt += `\n- Visit Notes: ${visit.notes}`;
        }
      }
    }

    // Add additional prompt data
    if (promptData) {
      prompt += `\n\nAdditional Information: ${promptData}`;
    }

    prompt += `\n\nCRITICAL: You MUST generate ONLY the Operative Dictation section of the ER Operative Report. Do NOT include the "Corresponding Form" section or any template instructions. Generate ONLY the actual operative report content using the EXACT HTML structure shown below. Replace all bracketed placeholders [like this] with actual clinical content. 

IMPORTANT FORMATTING RULES:
- Do NOT use markdown code blocks (no \`\`\`html or \`\`\`)
- Do NOT use bullet points (<ul> or <li> tags) - use plain text with <p> tags instead
- Use single line spacing between items (one <br/> or one empty line between <p> tags)
- Use <p> tags for each line item, with <strong> for labels

EXACT TEMPLATE STRUCTURE TO FOLLOW (ONLY GENERATE THIS PART):

<h2>ER Operative Report</h2>

<h3>Operative Dictation:</h3>
<p><strong>Patient Name:</strong> ${patient.firstName} ${patient.lastName}</p>
<p><strong>Patient Date of Birth:</strong> ${patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'Not provided'}</p>
<p><strong>Location:</strong> [Replace with hospital name]</p>
<p><strong>Place of Service:</strong> Emergency Room</p>
<p><strong>MRN:</strong> [Replace with appropriate MRN]</p>
<p><strong>Date of Service:</strong> ${currentDate}</p>
<p><strong>Surgeon:</strong> Oren Michaeli, DO</p>
<p><strong>Assistant Surgeon (if applicable):</strong> If not specified then there was none.</p>
<p><strong>Anesthesia Type:</strong> Local (unless sedation is used from reduction of dislocations)</p>
<p><strong>Estimated Blood Loss:</strong> Less than 10 ml (unless otherwise stated)</p>
<p><strong>Implants:</strong> [Replace with list of any applicable: Nerve grafts, Nerve wraps, K-wires, integra, or None if not applicable]</p>
<p><strong>Wound Class:</strong> (Contaminated, Dirty)</p>

<h4>Preoperative Diagnosis:</h4>
<p>[Replace with numbered list of diagnoses with ICD-10 codes]</p>

<h4>Postoperative Diagnosis:</h4>
<p>[Replace with numbered list, including exact diagnosis, followed by the ICD-10 codes, and then official ICD-10 descriptions in parentheses]</p>

<h4>Procedures Performed:</h4>
<p>[Replace with numbered list, specifying the detailed procedure description, followed by the associated CPT codes, and then the official CPT code descriptions]</p>

<h4>Indication for Assistant (if applicable):</h4>
<p>Usually omit this section unless an assistant was specified.</p>
<p>Usually if there is one it's a resident and the indication was that it is a teaching facility.</p>

<h4>Indication for Surgery:</h4>
<p>[Replace with justification for each procedure individually with a direct link to the diagnosis. Describe negative repercussions of not performing the procedure and potential benefits or time sensitivity if applicable]</p>

<h4>Procedure Details:</h4>
<p>[Replace with detailed description of each numbered procedure separately, in independent paragraphs. Begin with patient positioning, irrigation then sterile prep and partially draped. Prep is usually betadine unless express otherwise. Use vivid, precise anatomical language; imagine detailing the procedure to someone visualizing it step-by-step without prior visibility. The direction structures are retracted should be discussed as well as the instruments used to dissect and retract (Use terms like ulnar/ly, radial/ly, distally and proximally). Someone reading this operative report should be able to reproduce this operation as if it were a manual. In every operative case involving an open wound, describe thorough irrigation of the surgical site.]</p>

<p>When describing procedures in the Procedure Details section, follow these specific guidelines based on the procedure list provided. Always repeat multiple times the specific laterality and body part (example: left small finger or right wrist).</p>

<p>For contaminated or dirty cases, describe that the extremity was prepared using a betadine-based solution in accordance with contaminated or infected wound protocols unless otherwise stated.</p>


CRITICAL INSTRUCTIONS:
- You MUST maintain the EXACT HTML structure shown above
- Replace ALL [bracketed placeholders] with actual clinical content based on the patient information provided
- Do NOT include the brackets [ ] in your final output - only include the actual content
- Do NOT use markdown code blocks - return pure HTML only (no \`\`\`html)
- Do NOT use bullet points - use <p> tags for each line item instead of <ul><li>
- Use single line spacing between items (one <br/> between <p> tags or one empty line)
- Keep all HTML tags exactly as shown (<h2>, <h3>, <h4>, <p>, <strong>)
- Maintain proper spacing: one line between sections
- Generate real clinical content, not template instructions
- Use actual patient data where specified (name, DOB are already filled in)
- For sections marked [Replace with...] or [Generate...], provide specific clinical information
- Return ONLY the HTML content following the exact structure above, with all placeholders replaced with real clinical data`;

    return { systemPrompt, prompt };
  }

  // Generate OR Operative Report
  async generateOROperativeReport(patientId, visitId, promptData) {
    const { patient, visits, previousNotes } = await this.getPatientData(patientId);
    
    const systemPrompt = `You are an expert surgeon specializing in hand surgery, peripheral nerve surgery, and microsurgery. Your target audience includes insurance auditors, judges, and juries who require overly detailed, the documentation must be interpreted as precise and intentional. In cases with intraoperatively complications or adverse events they should be discussed in such a way that it was unavoidable, or inevitable due to the initial injury or the anatomy, or the patients actions. Add any missing details as needed. Everything to follow is a general rule but any special notes above superseded anything below.

Formatting Requirements:
- Every operative report must follow this standardized template
- Use proper HTML structure with semantic tags
- All headings (h2, h3, h4) must be bold and properly spaced
- Use <ul> and <ol> for lists with proper indentation
- Use <li> tags for list items with <strong> tags for labels
- Add proper spacing between sections using <p> tags with margin
- Use <br/> for line breaks within paragraphs when needed
- Ensure all bullet points are properly formatted with consistent indentation
- Use <strong> tags for emphasis on important terms and labels
- Maintain consistent spacing: add blank lines between major sections
- Structure content with clear hierarchy: main headings (h2), subheadings (h3), and sub-subheadings (h4)
- Use proper paragraph spacing for readability
- Fill in all sections with actual clinical content based on the patient information provided`;

    const currentDate = new Date().toLocaleDateString();
    const patientAge = this.calculateAge(patient.dateOfBirth);
    const patientGender = patient.gender || 'Unknown';

    let prompt = `Generate a New OR Operative Report for the following patient:

I expect that the following will be carried over directly from the intake form or EMR:
• Patient Name: ${patient.firstName} ${patient.lastName}
• Patient Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}
• Location: should be pulled from the appointment settings
• Date of Service: should be pulled from the appointment settings

Corresponding Form
• MRN: [To be filled]
• Surgeon: [To be filled]
• Assistant Surgeon: [To be filled]
• Anesthesia Type: [To be filled]
• Implants: [To be filled]
• Wound Class: (Clean, Contaminated, Dirty) this should be a dropdown
• Preoperative Diagnosis: [To be filled]
• Postoperative Diagnosis: If left blank should be the same as above
• Procedure List: [To be filled]
• Specific notes about the surgery: [To be filled]

Patient Information:
- Name: ${patient.firstName} ${patient.lastName}
- Age: ${patientAge} years old
- Gender: ${patientGender}
- Date of Birth: ${new Date(patient.dateOfBirth).toLocaleDateString()}`;

    // Add medical history if available
    if (patient.dynamicData) {
      prompt += `\n\nMedical History from Intake Form:`;
      if (patient.dynamicData.medicalHistory) {
        prompt += `\n- Medical History: ${patient.dynamicData.medicalHistory}`;
      }
      if (patient.dynamicData.allergies) {
        prompt += `\n- Allergies: ${patient.dynamicData.allergies}`;
      }
      if (patient.dynamicData.medications) {
        prompt += `\n- Current Medications: ${patient.dynamicData.medications}`;
      }
      if (patient.dynamicData.surgicalHistory) {
        prompt += `\n- Surgical History: ${patient.dynamicData.surgicalHistory}`;
      }
    }

    // Add previous notes context
    if (previousNotes.length > 0) {
      prompt += `\n\nPrevious Clinical Course:`;
      previousNotes.slice(0, 3).forEach((note, index) => {
        const noteDate = new Date(note.createdAt).toLocaleDateString();
        prompt += `\n\nNote from ${noteDate} (${note.noteType}):`;
        prompt += `\n${note.content.substring(0, 500)}...`;
      });
    }

    // Add visit information if available
    if (visitId) {
      const visit = visits.find(v => v._id.toString() === visitId);
      if (visit) {
        prompt += `\n\nCurrent Visit Information:`;
        prompt += `\n- Visit Type: ${visit.visitType}`;
        prompt += `\n- Date: ${new Date(visit.date).toLocaleDateString()}`;
        if (visit.chiefComplaint) {
          prompt += `\n- Chief Complaint: ${visit.chiefComplaint}`;
        }
        if (visit.notes) {
          prompt += `\n- Visit Notes: ${visit.notes}`;
        }
      }
    }

    // Add additional prompt data
    if (promptData) {
      prompt += `\n\nAdditional Information: ${promptData}`;
    }

    prompt += `\n\nCRITICAL: You MUST generate the OR Operative Report using the EXACT HTML structure shown below. Replace all bracketed placeholders [like this] with actual clinical content.

IMPORTANT FORMATTING RULES:
- Do NOT use markdown code blocks (no \`\`\`html or \`\`\`)
- Do NOT use bullet points (<ul> or <li> tags) - use plain text with <p> tags instead
- Use single line spacing between items (one <br/> or one empty line between <p> tags)
- Use <p> tags for each line item, with <strong> for labels

EXACT TEMPLATE STRUCTURE TO FOLLOW:

<h2>OR Operative Report</h2>

<p><strong>I expect that the following will be carried over directly from the intake form or EMR:</strong></p>
<p><strong>Patient Name:</strong> ${patient.firstName} ${patient.lastName}</p>
<p><strong>Patient Date of Birth:</strong> ${patientDOB}</p>
<p><strong>Location:</strong> should be pulled from the appointment settings</p>
<p><strong>Date of Service:</strong> should be pulled from the appointment settings</p>

<h3>Corresponding Form</h3>
<p><strong>MRN:</strong> [Replace with appropriate MRN or leave as placeholder]</p>
<p><strong>Surgeon:</strong> Oren Michaeli, DO</p>
<p><strong>Assistant Surgeon:</strong> [Replace with assistant name if applicable, otherwise leave blank]</p>
<p><strong>Anesthesia Type:</strong> [Replace with appropriate anesthesia type]</p>
<p><strong>Implants:</strong> [Replace with list of any applicable: plates, screws, anchors, suture tape, tightropes, nerve grafts, nerve wraps, K-wires, intramedullary nails, bone allografts, or None if not applicable]</p>
<p><strong>Wound Class:</strong> (Clean, Contaminated, Dirty) this should be a dropdown</p>
<p><strong>Preoperative Diagnosis:</strong> [Replace with numbered list of diagnoses with ICD-10 codes]</p>
<p><strong>Postoperative Diagnosis:</strong> [Replace with numbered list, including exact diagnosis, followed by ICD-10 codes, and then official ICD-10 descriptions in parentheses. If left blank should be the same as preoperative diagnosis]</p>
<p><strong>Procedure List:</strong> [Replace with numbered list based on procedures performed]</p>
<p><strong>Specific notes about the surgery:</strong> [Replace with specific notes based on the procedure]</p>

<h3>Operative Dictation:</h3>
<p><strong>Patient Name:</strong> ${patient.firstName} ${patient.lastName}</p>
<p><strong>Patient Date of Birth:</strong> ${patientDOB}</p>
<p><strong>Location:</strong> [Replace with hospital name]</p>
<p><strong>Place of Service:</strong> (Emergency - Inpatient, Emergency - Outpatient, Elective - Inpatient, Elective - Outpatient)</p>
<p><strong>MRN:</strong> [Replace with appropriate MRN]</p>
<p><strong>Date of Service:</strong> ${currentDate}</p>
<p><strong>Surgeon:</strong> Oren Michaeli, DO</p>
<p><strong>Assistant Surgeon (if applicable):</strong> [Replace with assistant name if applicable, otherwise leave blank]</p>
<p><strong>Anesthesia Type:</strong> [Replace with appropriate anesthesia type]</p>
<p><strong>Estimated Blood Loss:</strong> Less than 10 ml (unless otherwise stated)</p>
<p><strong>Implants:</strong> [Replace with list of any applicable: plates, screws, anchors, suture tape, tightropes, nerve grafts, nerve wraps, K-wires, intramedullary nails, bone allografts, or None if not applicable]</p>
<p><strong>Wound Class:</strong> (Clean, Contaminated, Dirty)</p>

<h4>Preoperative Diagnosis:</h4>
<p>[Replace with numbered list of diagnoses with ICD-10 codes]</p>

<h4>Postoperative Diagnosis:</h4>
<p>[Replace with numbered list, including exact diagnosis, followed by the ICD-10 codes, and then official ICD-10 descriptions in parentheses]</p>

<h4>Procedures Performed:</h4>
<p>[Replace with numbered list, specifying the detailed procedure description, followed by the associated CPT codes, and then the official CPT code descriptions]</p>

<h4>Indication for Assistant (if applicable):</h4>
<p>[Replace with justification for the assistant if applicable. If the information has been provided, include the specialty, the board certification, years in practice and any other unique qualifiers. Also highlight why this procedure requires more than one experienced surgeon. Otherwise omit this section]</p>

<h4>Indication for Surgery:</h4>
<p>[Replace with justification for each procedure individually with a direct link to the diagnosis. Describe negative repercussions of not performing the procedure and potential benefits or time sensitivity if applicable]</p>

<h4>Procedure Details:</h4>
<p>[Replace with detailed description of each numbered procedure separately, in independent paragraphs. Begin with patient positioning, sterile preparation, placement of a protective barrier, tourniquet (if used), and performing a preoperative timeout. including confirmation of antibiotics, DVT prophylaxis, and laterality prior to tourniquet inflation or skin incision. Conclude with verification of counts, confirmation of perfusion of the extremity or digit, and the patient's complication-free emergence from anesthesia (if general anesthesia was used). Use vivid, precise anatomical language; imagine detailing the procedure to someone visualizing it step-by-step without prior visibility. The direction structures are retracted should be discussed as well as the instruments used to dissect and retract (Use terms like ulnar/ly, radial/ly, distally and proximally). Someone reading this operative report should be able to reproduce this operation as if it were a manual. In every operative case involving an open wound, describe thorough irrigation of the surgical site.]</p>

<p><strong>Specific Procedure Instructions:</strong></p>
<p>When describing procedures, follow these specific guidelines based on the procedure list provided.</p>

<p><strong>1. Sterile Preparation:</strong> For clean cases, describe: Initially, the arm was meticulously scrubbed using a surgical-grade sponge, followed by drying with a sterile towel to ensure the absence of residual moisture. This procedure was diligently repeated. Subsequently, the [specify laterality and extremity] received a double application of a chlorhexidine preparation stick. A sterile surgical drape was applied, followed by a final chlorhexidine application within the sterile field. For contaminated or dirty cases, describe: The extremity was prepared using a betadine-based solution in accordance with contaminated or infected wound protocols.</p>

<p><strong>2. Volar Plating of Distal Radius (If applicable):</strong> Prior to incision inspect the fracture under fluoroscopic guidance and attempt preliminary reduction. A modified Henry approach was used. The FCR was palpated and a 10 cm incision made using a 15 blade. The FCR sheath was incised with a 15 blade, and a push-cut technique used proximally and distally with tenotomy scissors. A Ragnell retractor retracted the FCR ulnarly. The base and floor of the tendon sheath were opened with a tenotomy. The FPL was freed with finger-sweep dissection. The pronator quadratus was then cut with a bipolar and a combination of blunt dissection with a raytech and a key elevator was used to expose the fracture. A freer elevator was used to open the fracture; hematoma was evacuated. DRUJ stability was assessed with the elbow at 90° in both pronation and supination if there was an associated ulnar styloid fracture. The volar plate was fixed distally first with screws to leverage and reduce the distal fragments. Proximal screws were placed to complete longitudinal stabilization. Fluoroscopy confirmed proper screw placement, no intra-articular penetration, and satisfactory construct alignment. If specified that it was an arthroscopically assisted distal radius volar plating, describe: If anatomic alignment remained suboptimal (e.g., >2mm displacement), arthroscopic intervention may be employed to enhance precision. The arthroscope was introduced dorsally, adjacent to Lister's tubercle, through the inter-compartmental space without disrupting tendon sheaths. Extensive irrigation was performed to improve joint visibility. A 6R portal was created with a small incision radial to the ECU, dissecting to the capsule. A probe introduced through this portal allowed adjustment of the fragments to a 0mm step-off. After achieving alignment, the plate was first fixed distally, leveraging the distal fragment against the volar plate for anatomic tilt. Proximal screws were subsequently placed to secure longitudinal stability. Screw placement and construct integrity were verified both arthroscopically and fluoroscopically, ensuring no intra-articular penetration and confirming optimal stabilization and wrist functionality.</p>

<p><strong>3. Ulnar Styloid Fixation (if applicable):</strong> 2 cm incision made between ECU and FCU. The ulnar sensory nerve was identified and protected. TFCC instability was addressed using a specialized hook plate to secure soft tissues to the ulnar styloid. Screws were placed proximally to avoid intra-articular impingement and ensure DRUJ support. In some instances I will place a screw diagonally through the styloid into the neck/ shaft. Only include this detail if it is mentioned above.</p>

<p><strong>4. Intramedullary Nailing of Metacarpal (if applicable):</strong> A 1.4 mm K-wire was inserted at the dorsal third of the metacarpal head and advanced into the medullary canal. Fracture reduced manually; fluoroscopic alignment confirmed. A 0.3 mm skin incision allowed passage of a cannulated drill/reamer system. After canal preparation, Skeletal Dynamics intramedullary nail was inserted over a guidewire and buried beneath the articular cartilage. Must include the size of the screw. Must specify the digit number 1st-5th, with 1st being the thumb and 5th being the small finger. Also must mention the laterality. If multiple fingers are involved each should be discussed separately.</p>

<p><strong>5. Blood Vessel Anastomosis (if applicable):</strong> Hematoma and adhesions were removed. The arterial ends were mobilized. Adventitia was sharply removed with straight micro-scissors. Vessel ends debrided until healthy tissue was visible. Ends bathed in a heparin, lidocaine, and papaverine solution. Microscopic vessel dilators expanded the lumen incrementally. Vessel approximated using clamps and anastomosed with 8-0 nylon sutures under magnification. Perfusion confirmed after clamp release.</p>

<p><strong>6. Primary Nerve Repair (Coaptation) if applicable:</strong> Neurolysis performed until healthy vaso nervosum and fascicles exposed. Sharp debridement with straight microscissors until healthy, bleeding, and bulging fascicles visible. May also be likened to a bugs eyes. Coaptation performed with two interrupted 9-0 nylon sutures, leaving a visible 0.1 mm light gap. May also be described as a grandmas kiss. A tension free repair should always be. Fibrin glue applied to reinforce the repair using a drop, drop method. Always say that the limb or digit was fully ranged through its motion to test that the suture line will not break. Do not however mention this if the joint was fused or kwired to immobilize.</p>

<p><strong>7. Nerve Graft (if applicable):</strong> Document diameter and length of graft. Thaw nerve allograft, trim with microscissors, and coapt both ends with 9-0 nylon interrupted sutures. Apply fibrin glue proximally and distally.</p>

<p><strong>8. Synthetic Nerve Membrane (if applicable):</strong> If used, describe membrane placement to minimize axonal sprouting and prevent neuroma. If applicable, include soaking in stem cell solution with brief citation supporting Schwann cell differentiation. Secure with 9-0 nylon sutures, then reinforce with fibrin glue.</p>

<p><strong>9. Intraoperative Nerve Stimulation (AKA ReGen, if applicable):</strong> Electrode placed proximal to nerve repair at last known healthy nerve. Settings: 100 pulses/sec for 10 minutes at 2 mA. Document device used and total stimulation time.</p>

<p><strong>10. Nano Fat Stem Cell Grafting with Tulip if applicable:</strong> 100 cc of tumescent fluid (saline, lidocaine, epinephrine) infiltrated into lower abdomen. Suction cannula is always advanced through the umbilicus. Fat harvested using Tulip cannula under manual suction pressure. Gravity separation performed; supernatant and infranatant discarded. Fat filtered through sequential Tulip filters to create nanofat. ~10 cc reserved for injection.</p>

<p><strong>11. Bone Grafting with allograft if applicable:</strong> Fracture hematoma is cleared, then the void is packed with bone allograft. This could be added anywhere on the body that makes sense either after plating or in the middle of the plating. The packing must be tight.</p>

<p><strong>Final Note:</strong> Ensure absolute compliance with each instruction. Maintain maximum clarity, precision, and anatomical detail in your documentation at all times.</p>

<p><strong>Place of Service:</strong> (Emergency - Inpatient, Emergency - Outpatient, Elective - Inpatient, Elective - Outpatient) this should be a drop down.</p>

CRITICAL INSTRUCTIONS:
- You MUST maintain the EXACT HTML structure shown above
- Replace ALL [bracketed placeholders] with actual clinical content based on the patient information provided
- Do NOT include the brackets [ ] in your final output - only include the actual content
- Do NOT use markdown code blocks - return pure HTML only (no \`\`\`html or \`\`\`)
- Do NOT use bullet points - use <p> tags for each line item instead of <ul><li>
- Use single line spacing between items (one <br/> between <p> tags or one empty line)
- Keep all HTML tags exactly as shown (<h2>, <h3>, <h4>, <p>, <strong>)
- Maintain proper spacing: one line between sections
- Generate real clinical content, not template instructions
- Use actual patient data where specified (name, DOB are already filled in)
- For sections marked [Replace with...] or [Generate...], provide specific clinical information
- Return ONLY the HTML content following the exact structure above, with all placeholders replaced with real clinical data`;

    return { systemPrompt, prompt };
  }

  // Generate note using AI
  async generateNote(patientId, visitId, noteType, promptData) {
    try {
      console.log('Starting note generation...');
      console.log('Patient ID:', patientId);
      console.log('Visit ID:', visitId);
      console.log('Note Type:', noteType);
      console.log('Prompt Data:', promptData);
      
      let systemPrompt, prompt;

      switch (noteType) {
        case 'Progress':
          console.log('Generating Progress note...');
          ({ systemPrompt, prompt } = await this.generateProgressNote(patientId, visitId, promptData));
          break;
        case 'Consultation':
          console.log('Generating Consultation note...');
          ({ systemPrompt, prompt } = await this.generateConsultationNote(patientId, visitId, promptData));
          break;
        case 'New ER Operative Report':
          console.log('Generating ER Operative Report...');
          ({ systemPrompt, prompt } = await this.generateEROperativeReport(patientId, visitId, promptData));
          break;
        case 'New OR Operative Report':
          console.log('Generating OR Operative Report...');
          ({ systemPrompt, prompt } = await this.generateOROperativeReport(patientId, visitId, promptData));
          break;
        default:
          throw new Error(`Unsupported note type: ${noteType}`);
      }

      console.log('System prompt length:', systemPrompt.length);
      console.log('User prompt length:', prompt.length);
      console.log('Calling OpenAI API...');

      // Call the OpenAI API
      let generatedText = await this.callOpenAIAPI(systemPrompt, prompt);
      
      console.log('Note generated successfully, length:', generatedText.length);
      
      // Clean up any markdown code blocks that might have been added
      generatedText = generatedText.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      
      // All note types now return plain text/HTML following their template structure
      return generatedText;
    } catch (error) {
      console.error('Error generating note:', error);
      throw error;
    }
  }

  // Helper function to calculate age
  calculateAge(dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }
}

export default new AINoteGenerationService();
