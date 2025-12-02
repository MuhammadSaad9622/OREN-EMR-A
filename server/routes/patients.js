import express from 'express';
import Patient from '../models/Patient.js';
import { Visit, InitialVisit, FollowupVisit, DischargeVisit } from '../models/Visit.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import Counter from '../models/Counter.js';
import FormToken from '../models/FormToken.js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { FRONTEND_URL } from '../config/constants.js';

// Set SendGrid API key if available
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid API key configured');
} else {
  console.warn('SendGrid API key not found in environment variables');
}

const router = express.Router();

// Debug endpoint to check database
router.get('/debug', authenticateToken, async (req, res) => {
  try {
    const totalPatients = await Patient.countDocuments({});
    const samplePatient = await Patient.findOne({});

    res.json({
      totalPatients,
      samplePatient: samplePatient ? {
        _id: samplePatient._id,
        hasDynamicData: !!samplePatient.dynamicData,
        dynamicDataKeys: samplePatient.dynamicData ? Object.keys(samplePatient.dynamicData) : [],
        hasFirstName: !!samplePatient.firstName,
        hasLastName: !!samplePatient.lastName,
        firstName: samplePatient.firstName,
        lastName: samplePatient.lastName,
        dynamicDataFirstName: samplePatient.dynamicData?.firstName,
        dynamicDataLastName: samplePatient.dynamicData?.lastName
      } : null
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
});

// Email configuration debug endpoint
router.get('/email-config-debug', authenticateToken, async (req, res) => {
  try {
    const emailFrom = process.env.EMAIL_FROM;
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;
    const sendgridKey = process.env.SENDGRID_API_KEY;
    
    res.json({
      EMAIL_FROM: {
        exists: !!emailFrom,
        type: typeof emailFrom,
        length: emailFrom ? emailFrom.length : 0,
        firstChars: emailFrom ? emailFrom.substring(0, 5) + '...' : 'NOT SET',
        isEmpty: !emailFrom || emailFrom.trim().length === 0
      },
      EMAIL_USER: {
        exists: !!emailUser,
        type: typeof emailUser,
        length: emailUser ? emailUser.length : 0,
        firstChars: emailUser ? emailUser.substring(0, 5) + '...' : 'NOT SET',
        isEmpty: !emailUser || emailUser.trim().length === 0
      },
      EMAIL_PASSWORD: {
        exists: !!emailPassword,
        type: typeof emailPassword,
        length: emailPassword ? emailPassword.length : 0,
        isEmpty: !emailPassword || emailPassword.trim().length === 0,
        // Don't show password, but show if it looks like an app password (16 chars with spaces or 16 chars without)
        looksLikeAppPassword: emailPassword ? (emailPassword.replace(/\s/g, '').length === 16) : false
      },
      SENDGRID_API_KEY: {
        exists: !!sendgridKey,
        length: sendgridKey ? sendgridKey.length : 0,
        firstChars: sendgridKey ? sendgridKey.substring(0, 5) + '...' : 'NOT SET'
      },
      senderEmail: emailFrom || emailUser || 'NOT SET',
      recommendation: !emailUser || !emailPassword ? 
        'Set EMAIL_USER and EMAIL_PASSWORD (use Gmail App Password, not regular password)' :
        'Configuration looks good. If emails fail, check that EMAIL_PASSWORD is a Gmail App Password.'
    });
  } catch (error) {
    console.error('Email config debug error:', error);
    res.status(500).json({ message: 'Debug error', error: error.message });
  }
});

// Get all patients (with pagination)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    // Try both old and new data structures for search
    const searchQuery = search
      ? {
        $or: [
          { 'dynamicData.firstName': { $regex: search, $options: 'i' } },
          { 'dynamicData.lastName': { $regex: search, $options: 'i' } },
          { 'dynamicData.email': { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
      : {};

    if (req.user.role === 'doctor') {
      searchQuery.assignedDoctor = req.user.id;
    }

    const patients = await Patient.find(searchQuery)
      .populate('assignedDoctor', 'firstName lastName ')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ updatedAt: -1 });

    const count = await Patient.countDocuments(searchQuery);

    // Map patients to include virtual fields explicitly and handle both data structures
    const patientsWithVirtuals = patients.map(patient => {
      const patientObj = patient.toObject({ virtuals: true });

      // Get names from both possible locations
      let firstName = '';
      let lastName = '';
      let email = '';
      let dateOfBirth = '';

      // Try dynamicData first (new structure)
      if (patientObj.dynamicData) {
        // Check for both formats: "firstName" and "First Name"
        firstName = patientObj.dynamicData.firstName || patientObj.dynamicData['First Name'] || '';
        lastName = patientObj.dynamicData.lastName || patientObj.dynamicData['Last Name'] || '';
        email = patientObj.dynamicData.email || patientObj.dynamicData['Email'] || '';
        dateOfBirth = patientObj.dynamicData.dateOfBirth || patientObj.dynamicData['Date of Birth'] || '';

        // Debug logging
        console.log('Server extracting names for patient:', patientObj._id);
        console.log('dynamicData keys:', Object.keys(patientObj.dynamicData));
        console.log('firstName from dynamicData:', firstName);
        console.log('lastName from dynamicData:', lastName);
      }

      // Fallback to direct properties (old structure)
      if (!firstName) firstName = patientObj.firstName || '';
      if (!lastName) lastName = patientObj.lastName || '';
      if (!email) email = patientObj.email || '';

      return {
        ...patientObj,
        firstName,
        lastName,
        email,
        dateOfBirth
      };
    });

    // Debug logging
    console.log('Patients found:', count);
    if (patientsWithVirtuals.length > 0) {
      console.log('First patient structure:', JSON.stringify(patientsWithVirtuals[0], null, 2));
      console.log('First patient names:', {
        firstName: patientsWithVirtuals[0].firstName,
        lastName: patientsWithVirtuals[0].lastName,
        dynamicDataFirstName: patientsWithVirtuals[0].dynamicData?.firstName,
        dynamicDataLastName: patientsWithVirtuals[0].dynamicData?.lastName,
        dynamicDataFirstSpace: patientsWithVirtuals[0].dynamicData?.['First Name'],
        dynamicDataLastSpace: patientsWithVirtuals[0].dynamicData?.['Last Name']
      });
    }

    res.json({
      patients: patientsWithVirtuals,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalPatients: count
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get patient by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id)
      .populate('assignedDoctor', 'firstName lastName')
      .populate({
        path: 'formResponses',
        populate: {
          path: 'formTemplate',
          select: 'title'
        }
      });

    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(patient);
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new patient
router.post('/', authenticateToken, async (req, res) => {
  try {
    const patientData = req.body;
    console.log('Creating patient with data:', JSON.stringify(patientData, null, 2));

    // 🧠 Assign doctor if role is 'doctor'
    // if (req.user.role === 'doctor') {
    //   patientData.assignedDoctor = req.user.id;
    // }
    if (req.user.role === 'doctor' && !patientData.assignedDoctor) {
      // only assign if frontend didn't provide one
      patientData.assignedDoctor = req.user.id;
    }

    // ✅ If attorney info is present, generate and assign caseNumber
    if (patientData.attorney) {
      const counter = await Counter.findOneAndUpdate(
        { name: 'caseNumber' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );

      const formattedCaseNumber = `P-${String(counter.value).padStart(3, '0')}`;
      patientData.attorney.caseNumber = formattedCaseNumber;
    }

    // Create a new dynamicData object to store all patient information
    // Handle both formats: direct dynamicData (from form submissions) or individual fields (backward compatibility)
    let dynamicData = {};
    
    // If dynamicData is provided directly, use it (from form submissions)
    if (patientData.dynamicData && typeof patientData.dynamicData === 'object') {
      dynamicData = { ...patientData.dynamicData };
      console.log('Using provided dynamicData:', Object.keys(dynamicData));
    } else {
      // Otherwise, build dynamicData from individual fields (backward compatibility)
      if (patientData.firstName) dynamicData.firstName = patientData.firstName;
      if (patientData.lastName) dynamicData.lastName = patientData.lastName;
      if (patientData.dateOfBirth) dynamicData.dateOfBirth = patientData.dateOfBirth;
      if (patientData.gender) dynamicData.gender = patientData.gender;
      if (patientData.email) dynamicData.email = patientData.email;
      if (patientData.phone) dynamicData.phone = patientData.phone;
      if (patientData.address) dynamicData.address = patientData.address;
      if (patientData.medicalHistory) dynamicData.medicalHistory = patientData.medicalHistory;
      if (patientData.subjective) dynamicData.subjective = patientData.subjective;
      if (patientData.attorney) dynamicData.attorney = patientData.attorney;
      console.log('Built dynamicData from individual fields:', Object.keys(dynamicData));
    }

    // Store any additional form responses
    if (patientData.additionalFormData) {
      Object.entries(patientData.additionalFormData).forEach(([key, value]) => {
        dynamicData[key] = value;
      });
    }

    // Store form data if available (keep this separate from patient fields)
    const formEntries = [];
    if (patientData.formData && Array.isArray(patientData.formData)) {
      formEntries.push(...patientData.formData);
    } else if (patientData.formData) {
      formEntries.push({
        formType: 'intake',
        formId: 'initial-intake',
        data: patientData.formData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // 🎯 Create patient with dynamicData structure - matching the model schema
    const patient = new Patient({
      dynamicData: dynamicData,
      assignedDoctor: patientData.assignedDoctor,
      status: patientData.status || 'active',
      formData: formEntries.length > 0 ? formEntries : []
    });

    await patient.save();

    res.status(201).json({
      message: 'Patient created successfully',
      patient
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
//Update patient

// router.put('/:id', authenticateToken, async (req, res) => {
//   try {
//     const patient = await Patient.findById(req.params.id);
//     if (!patient) return res.status(404).json({ message: 'Patient not found' });

//     if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
//       return res.status(403).json({ message: 'Access denied' });
//     }

//     // Create update object
//     const updateData = { ...req.body };

//     // Extract any form data to store in dynamicData
//     const dynamicDataUpdates = {};

//     // Store any form data that was previously in medicalHistory or subjective
//     if (req.body.medicalHistory) {
//       if (req.body.medicalHistory.allergies) dynamicDataUpdates['dynamicData.allergies'] = req.body.medicalHistory.allergies;
//       if (req.body.medicalHistory.medications) dynamicDataUpdates['dynamicData.medications'] = req.body.medicalHistory.medications;
//       if (req.body.medicalHistory.conditions) dynamicDataUpdates['dynamicData.conditions'] = req.body.medicalHistory.conditions;
//       if (req.body.medicalHistory.surgeries) dynamicDataUpdates['dynamicData.surgeries'] = req.body.medicalHistory.surgeries;
//       if (req.body.medicalHistory.familyHistory) dynamicDataUpdates['dynamicData.familyHistory'] = req.body.medicalHistory.familyHistory;

//       // Remove medicalHistory from the update object
//       delete updateData.medicalHistory;
//     }

//     if (req.body.subjective) {
//       if (req.body.subjective.bodyPart) dynamicDataUpdates['dynamicData.bodyParts'] = req.body.subjective.bodyPart;
//       if (req.body.subjective.severity) dynamicDataUpdates['dynamicData.severity'] = req.body.subjective.severity;
//       if (req.body.subjective.quality) dynamicDataUpdates['dynamicData.quality'] = req.body.subjective.quality;
//       if (req.body.subjective.symptoms) dynamicDataUpdates['dynamicData.symptoms'] = req.body.subjective.symptoms;

//       // Remove subjective from the update object
//       delete updateData.subjective;
//     }

//     // Store form data if available
//     if (req.body.formData) {
//       const formEntry = {
//         formType: 'intake',
//         formId: 'update-intake',
//         data: req.body.formData,
//         createdAt: new Date(),
//         updatedAt: new Date()
//       };

//       // Add to formData array
//       updateData.$push = { formData: formEntry };

//       // Remove formData from the update object
//       delete updateData.formData;
//     }

//     // Merge dynamicDataUpdates into the update object
//     const updatedPatient = await Patient.findByIdAndUpdate(
//       req.params.id,
//       {
//         ...updateData,
//         ...dynamicDataUpdates
//       },
//       { new: true, runValidators: true }
//     );

//     res.json({
//       message: 'Patient updated successfully',
//       patient: updatedPatient
//     });
//   } catch (error) {
//     console.error('Update patient error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });

//new Update APi
// router.put('/:id', authenticateToken, async (req, res) => {
//   try {
//     const patient = await Patient.findById(req.params.id);
//     if (!patient) return res.status(404).json({ message: 'Patient not found' });

//     if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
//       return res.status(403).json({ message: 'Access denied' });
//     }

//     // Create update object maintaining the original structure
//     const updateData = {
//       updatedAt: new Date()
//     };

//     // Update basic fields if provided
//     if (req.body.firstName !== undefined) updateData.firstName = req.body.firstName;
//     if (req.body.lastName !== undefined) updateData.lastName = req.body.lastName;
//     if (req.body.dateOfBirth !== undefined) updateData.dateOfBirth = req.body.dateOfBirth;
//     if (req.body.gender !== undefined) updateData.gender = req.body.gender;
//     if (req.body.email !== undefined) updateData.email = req.body.email;
//     if (req.body.phone !== undefined) updateData.phone = req.body.phone;
//     if (req.body.status !== undefined) updateData.status = req.body.status;
//     if (req.body.assignedDoctor !== undefined) updateData.assignedDoctor = req.body.assignedDoctor;

//     // Update nested objects properly
//     if (req.body.address) {
//       updateData.address = {
//         ...patient.address?.toObject?.() || {},
//         ...req.body.address
//       };
//     }

//     if (req.body.medicalHistory) {
//       updateData.medicalHistory = {
//         ...patient.medicalHistory?.toObject?.() || {},
//         ...req.body.medicalHistory
//       };
//     }

//     if (req.body.subjective) {
//       updateData.subjective = {
//         ...patient.subjective?.toObject?.() || {},
//         ...req.body.subjective
//       };
//     }

//     if (req.body.attorney) {
//       updateData.attorney = {
//         ...patient.attorney?.toObject?.() || {},
//         ...req.body.attorney
//       };
//     }

//     // Handle additional dynamic data (only for non-schema fields)
//     if (req.body.additionalFormData) {
//       const currentDynamicData = patient.dynamicData || new Map();
//       Object.entries(req.body.additionalFormData).forEach(([key, value]) => {
//         currentDynamicData.set(key, value);
//       });
//       updateData.dynamicData = currentDynamicData;
//     }

//     // Handle form data updates
//     let formDataUpdate = {};
//     if (req.body.formData) {
//       const formEntry = {
//         formType: 'intake',
//         formId: 'update-intake',
//         data: req.body.formData,
//         createdAt: new Date(),
//         updatedAt: new Date()
//       };

//       // Add to formData array
//       formDataUpdate.$push = { formData: formEntry };
//     }

//     // Perform the update
//     const updatedPatient = await Patient.findByIdAndUpdate(
//       req.params.id,
//       {
//         ...updateData,
//         ...formDataUpdate
//       },
//       { new: true, runValidators: true }
//     );

//     res.json({
//       message: 'Patient updated successfully',
//       patient: updatedPatient
//     });
//   } catch (error) {
//     console.error('Update patient error:', error);
//     res.status(500).json({ message: 'Server error', error: error.message });
//   }
// });
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const patientId = req.params.id;
    const patientData = req.body;
    console.log(`Updating patient ${patientId} with data:`, patientData);

    // Find existing patient
    const existingPatient = await Patient.findById(patientId);
    if (!existingPatient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // 🧠 Assign doctor if role is 'doctor' and not already assigned
    if (req.user.role === 'doctor' && !patientData.assignedDoctor) {
      patientData.assignedDoctor = req.user.id;
    }

    // ✅ If attorney info is present and no caseNumber exists, generate and assign caseNumber
    if (patientData.attorney && !existingPatient.attorney?.caseNumber) {
      const counter = await Counter.findOneAndUpdate(
        { name: 'caseNumber' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );

      const formattedCaseNumber = `P-${String(counter.value).padStart(3, '0')}`;
      patientData.attorney.caseNumber = formattedCaseNumber;
    }

    // Create a new dynamicData object to store all patient information
    const dynamicData = {};

    // Store all main patient fields in dynamicData
    if (patientData.firstName) dynamicData.firstName = patientData.firstName;
    if (patientData.lastName) dynamicData.lastName = patientData.lastName;
    if (patientData.dateOfBirth) dynamicData.dateOfBirth = patientData.dateOfBirth;
    if (patientData.gender) dynamicData.gender = patientData.gender;
    if (patientData.email) dynamicData.email = patientData.email;
    if (patientData.phone) dynamicData.phone = patientData.phone;
    if (patientData.address) dynamicData.address = patientData.address;
    if (patientData.medicalHistory) dynamicData.medicalHistory = patientData.medicalHistory;
    if (patientData.subjective) dynamicData.subjective = patientData.subjective;
    if (patientData.attorney) dynamicData.attorney = patientData.attorney;

    // Store any additional form responses
    if (patientData.additionalFormData) {
      Object.entries(patientData.additionalFormData).forEach(([key, value]) => {
        dynamicData[key] = value;
      });
    }

    // Store form data if available (keep this separate from patient fields)
    const formEntries = [];
    if (patientData.formData && Array.isArray(patientData.formData)) {
      formEntries.push(...patientData.formData);
    } else if (patientData.formData) {
      formEntries.push({
        formType: 'intake',
        formId: 'initial-intake',
        data: patientData.formData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // 🎯 Update patient with dynamicData structure - matching the model schema
    const updatedPatient = await Patient.findByIdAndUpdate(
      patientId,
      {
        $set: {
          dynamicData: dynamicData,
          assignedDoctor: patientData.assignedDoctor,
          status: patientData.status || 'active',
          formData: formEntries.length > 0 ? formEntries : []
        }
      },
      { new: true }
    );

    if (!updatedPatient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    res.status(200).json({
      message: 'Patient updated successfully',
      patient: updatedPatient,
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Get patient visits
router.get('/:id/visits', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const visits = await Visit.find({ patient: req.params.id })
      .sort({ date: -1 })
      .populate('doctor', 'firstName lastName');

    res.json(visits);
  } catch (error) {
    console.error('Get patient visits error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create initial visit
router.post('/:id/visits/initial', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const visit = new InitialVisit({
      ...req.body,
      patient: req.params.id,
      doctor: req.user.id
    });
    await visit.save();

    res.status(201).json({ message: 'Initial visit created successfully', visit });
  } catch (error) {
    console.error('Create initial visit error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create follow-up visit
router.post('/:id/visits/followup', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const previousVisit = await Visit.findById(req.body.previousVisit);
    if (!previousVisit) return res.status(404).json({ message: 'Previous visit not found' });

    const visit = new FollowupVisit({
      ...req.body,
      patient: req.params.id,
      doctor: req.user.id
    });
    await visit.save();

    res.status(201).json({ message: 'Follow-up visit created successfully', visit });
  } catch (error) {
    console.error('Create follow-up visit error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create discharge visit
router.post('/:id/visits/discharge', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const visit = new DischargeVisit({
      ...req.body,
      patient: req.params.id,
      doctor: req.user.id
    });
    await visit.save();

    patient.status = 'discharged';
    await patient.save();

    res.status(201).json({ message: 'Discharge visit created successfully', visit });
  } catch (error) {
    console.error('Create discharge visit error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get specific visit
router.get('/visits/:visitId', authenticateToken, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');

    if (!visit) return res.status(404).json({ message: 'Visit not found' });

    if (req.user.role === 'doctor' && visit.doctor._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(visit);
  } catch (error) {
    console.error('Get visit error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete patient
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (req.user.role === 'doctor' && patient.assignedDoctor.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await Patient.findByIdAndDelete(req.params.id);
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send patient form link to client
router.post('/send-to-client', authenticateToken, async (req, res) => {
  try {
    const { email, name, instructions, language = 'english', patientId, formTemplateId } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // CRITICAL: Check email configuration FIRST before doing anything else
    // This allows the system to work with either SendGrid (EMAIL_FROM) or Gmail (EMAIL_USER)
    // Handle empty strings, whitespace, and null/undefined values
    // IMPORTANT: Check that values exist AND are not empty strings
    const rawEmailFrom = process.env.EMAIL_FROM;
    const rawEmailUser = process.env.EMAIL_USER;
    
    // Helper function to check if a value is a valid non-empty email string
    const isValidEmailString = (val) => {
      return val && typeof val === 'string' && val.trim().length > 0;
    };
    
    const emailFrom = isValidEmailString(rawEmailFrom) ? rawEmailFrom.trim() : '';
    const emailUser = isValidEmailString(rawEmailUser) ? rawEmailUser.trim() : '';
    const senderEmail = emailFrom || emailUser;
    
    // IMPORTANT: Check environment variables immediately and log them
    // This helps debug if env vars are not being loaded
    const envCheck = {
      EMAIL_FROM_exists: rawEmailFrom !== undefined && rawEmailFrom !== null,
      EMAIL_FROM_type: typeof rawEmailFrom,
      EMAIL_FROM_length: rawEmailFrom ? rawEmailFrom.length : 0,
      EMAIL_FROM_trimmed: emailFrom ? 'SET' : 'EMPTY',
      EMAIL_USER_exists: rawEmailUser !== undefined && rawEmailUser !== null,
      EMAIL_USER_type: typeof rawEmailUser,
      EMAIL_USER_length: rawEmailUser ? rawEmailUser.length : 0,
      EMAIL_USER_trimmed: emailUser ? 'SET' : 'EMPTY',
      SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'SET' : 'NOT SET',
      EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET',
      senderEmail_determined: senderEmail ? 'YES' : 'NO',
      senderEmail_length: senderEmail ? senderEmail.length : 0
    };
    
    console.log('=== EMAIL CONFIGURATION CHECK ===');
    console.log(JSON.stringify(envCheck, null, 2));
    if (emailUser) {
      console.log('EMAIL_USER value (first 5 chars):', emailUser.substring(0, 5) + '...');
    }
    if (emailFrom) {
      console.log('EMAIL_FROM value (first 5 chars):', emailFrom.substring(0, 5) + '...');
    }
    console.log('Sender email determined:', senderEmail ? `${senderEmail.substring(0, 5)}...` : 'NONE');
    console.log('Raw EMAIL_FROM:', rawEmailFrom ? `"${rawEmailFrom.substring(0, 10)}..."` : rawEmailFrom);
    console.log('Raw EMAIL_USER:', rawEmailUser ? `"${rawEmailUser.substring(0, 10)}..."` : rawEmailUser);
    console.log('================================');
    
    // FAIL FAST: If no sender email is configured, return error immediately
    if (!senderEmail || senderEmail.trim() === '' || senderEmail.length === 0) {
      console.error('=== EMAIL CONFIGURATION ERROR ===');
      console.error('No sender email found. Environment variables:', envCheck);
      console.error('Raw values check:');
      console.error('  process.env.EMAIL_FROM:', typeof process.env.EMAIL_FROM, process.env.EMAIL_FROM ? `"${process.env.EMAIL_FROM.substring(0, 20)}..."` : process.env.EMAIL_FROM);
      console.error('  process.env.EMAIL_USER:', typeof process.env.EMAIL_USER, process.env.EMAIL_USER ? `"${process.env.EMAIL_USER.substring(0, 20)}..."` : process.env.EMAIL_USER);
      console.error('================================');
      
      // Return detailed error with actual values for debugging
      return res.status(500).json({ 
        message: 'Sender email is not configured. Please set EMAIL_FROM or EMAIL_USER in your server environment variables.',
        error: 'EMAIL_CONFIGURATION_MISSING',
        debug: {
          EMAIL_FROM_exists: rawEmailFrom !== undefined && rawEmailFrom !== null,
          EMAIL_FROM_hasValue: !!emailFrom,
          EMAIL_FROM_length: rawEmailFrom ? rawEmailFrom.length : 0,
          EMAIL_USER_exists: rawEmailUser !== undefined && rawEmailUser !== null,
          EMAIL_USER_hasValue: !!emailUser,
          EMAIL_USER_length: rawEmailUser ? rawEmailUser.length : 0,
          SENDGRID_API_KEY_set: !!process.env.SENDGRID_API_KEY,
          EMAIL_PASSWORD_set: !!process.env.EMAIL_PASSWORD,
          note: 'Ensure variables have non-empty values in Render dashboard Environment tab'
        }
      });
    }

    const clientName = name || 'Valued Patient';

    // Generate a unique token for this form link
    const token = crypto.randomBytes(32).toString('hex');

    // Create a form token record in the database
    const formToken = new FormToken({
      token,
      email,
      clientName,
      createdBy: req.user.id,
      language,
      status: 'sent',
      patientId: patientId || null, // If we have a patient ID, associate it
      formTemplateId: formTemplateId || null // If we have a form template ID, associate it
    });

    // Save the form token to the database
    await formToken.save();

    // Base URL from centralized config
    const baseUrl = FRONTEND_URL;
    const formLink = `${baseUrl}/patients/form/${token}?lang=${language}`;

    // Sender email already determined at the top - no need to check again
    console.log('Using sender email:', senderEmail.substring(0, 5) + '...');

    const subject = language === 'spanish' ?
      'Complete su formulario médico - The Wellness Studio' :
      'Complete Your Medical Form - The Wellness Studio';

    const text = language === 'spanish' ?
      `Por favor complete su formulario médico utilizando el siguiente enlace: ${formLink}` :
      `Please complete your medical form using the following link: ${formLink}`;

    // Create HTML content for the email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
        <h2 style="color: #333;">${language === 'spanish' ? 'Complete su formulario médico' : 'Complete Your Medical Form'}</h2>
        <p style="color: #666; line-height: 1.5;">
          ${language === 'spanish' ?
        `Hola ${clientName},<br><br>Por favor haga clic en el enlace a continuación para completar su formulario médico:` :
        `Hello ${clientName},<br><br>Please click the link below to complete your medical form:`}
        </p>
        ${instructions ? `
        <p style="color: #666; line-height: 1.5; background-color: #f9f9f9; padding: 10px; border-left: 4px solid #4a90e2;">
          <strong>${language === 'spanish' ? 'Instrucciones especiales:' : 'Special instructions:'}</strong><br>
          ${instructions}
        </p>
        ` : ''}
        <p style="margin: 25px 0;">
          <a href="${formLink}" style="background-color: #4a90e2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
            ${language === 'spanish' ? 'Completar Formulario' : 'Complete Form'}
          </a>
        </p>
        <p style="color: #999; font-size: 0.9em;">
          ${language === 'spanish' ?
        'Si tiene problemas con el enlace, puede copiar y pegar esta URL en su navegador:' :
        'If you have trouble with the link, you can copy and paste this URL into your browser:'}
          <br>
          <span style="color: #4a90e2;">${formLink}</span>
        </p>
      </div>
    `;

    // Send email using SendGrid if available, otherwise use nodemailer
    try {
      let emailSent = false;
      
      // Try SendGrid first if API key is configured
      // BUT: If SendGrid fails with auth errors, skip it and go straight to Gmail
      const shouldTrySendGrid = process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim();
      
      if (shouldTrySendGrid) {
        try {
          console.log('=== Attempting SendGrid ===');
          console.log('SendGrid from email:', senderEmail);
          console.log('SendGrid to email:', email);
          
          const msg = {
            to: email,
            from: senderEmail, // Must be a verified sender in SendGrid
            subject: subject,
            text: text,
            html: htmlContent,
          };
          
          const response = await sgMail.send(msg);
          console.log('✅ Email sent successfully with SendGrid:', response);
          emailSent = true;
        } catch (sendgridError) {
          const statusCode = sendgridError.response?.statusCode;
          const errorBody = sendgridError.response?.body;
          
          console.error('❌ SendGrid email failed:', {
            message: sendgridError.message,
            code: sendgridError.code,
            statusCode: statusCode,
            errorBody: errorBody
          });
          
          // If SendGrid fails with unauthorized/forbidden, skip it permanently for this request
          if (statusCode === 401 || statusCode === 403 || sendgridError.message?.includes('Unauthorized')) {
            console.error('SendGrid authorization failed. Skipping SendGrid and using Gmail only.');
            console.error('Common causes:');
            console.error('  1. Invalid API key');
            console.error('  2. From email (' + senderEmail + ') not verified in SendGrid dashboard');
            console.error('  3. API key lacks mail.send permission');
            // Don't try SendGrid again - go straight to Gmail
          } else {
            console.log('SendGrid failed with non-auth error, will try Gmail as fallback');
          }
        }
      } else {
        console.log('SendGrid API key not configured, using nodemailer/Gmail directly');
      }
      
      // Use nodemailer if SendGrid is not configured or failed
      if (!emailSent) {
        console.log('=== Attempting Gmail/nodemailer ===');
        
        // For nodemailer/Gmail, we need EMAIL_USER for authentication
        // IMPORTANT: We must use EMAIL_USER (not senderEmail) because Gmail auth requires the actual Gmail account
        // But we use senderEmail (EMAIL_FROM or EMAIL_USER) as the "from" field in the email
        const emailUserForAuth = isValidEmailString(process.env.EMAIL_USER) ? process.env.EMAIL_USER.trim() : '';
        const emailPassword = process.env.EMAIL_PASSWORD && process.env.EMAIL_PASSWORD.trim() ? process.env.EMAIL_PASSWORD.trim() : '';
        
        console.log('Gmail configuration check:');
        console.log('  EMAIL_USER exists:', !!process.env.EMAIL_USER);
        console.log('  EMAIL_USER length:', process.env.EMAIL_USER ? process.env.EMAIL_USER.length : 0);
        console.log('  EMAIL_USER valid:', !!emailUserForAuth);
        console.log('  EMAIL_PASSWORD exists:', !!process.env.EMAIL_PASSWORD);
        console.log('  EMAIL_PASSWORD length:', process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.length : 0);
        console.log('  EMAIL_PASSWORD valid:', !!emailPassword);
        
        if (!emailUserForAuth || !emailPassword) {
          console.error('❌ Nodemailer configuration missing:', {
            EMAIL_USER: emailUserForAuth ? 'SET' : 'NOT SET',
            EMAIL_USER_length: emailUserForAuth ? emailUserForAuth.length : 0,
            EMAIL_PASSWORD: emailPassword ? 'SET' : 'NOT SET',
            EMAIL_PASSWORD_length: emailPassword ? emailPassword.length : 0
          });
          throw new Error('Email service is not configured. Please set EMAIL_USER and EMAIL_PASSWORD (both must be non-empty) in Render dashboard environment variables.');
        }
        
        console.log('Gmail credentials validated. Creating transporter...');
        
        // Create nodemailer transporter with explicit Gmail SMTP settings
        // Using explicit SMTP is more reliable than 'gmail' service
        // Remove spaces from password (Gmail App Passwords sometimes have spaces)
        const cleanPassword = emailPassword.replace(/\s/g, '');
        
        console.log('Creating nodemailer transporter with Gmail SMTP...');
        console.log('SMTP Host: smtp.gmail.com');
        console.log('SMTP Port: 587 (TLS) - will fallback to 465 if needed');
        console.log('Auth user:', emailUserForAuth);
        console.log('Password length:', cleanPassword.length, '(spaces removed)');
        
        // Try port 587 first (TLS), then fallback to 465 (SSL) if it fails
        let transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false, // false for 587, true for 465
          requireTLS: true, // Force TLS
          auth: {
            user: emailUserForAuth,
            pass: cleanPassword, // Use cleaned password (spaces removed)
          },
          tls: {
            // Use modern TLS configuration
            rejectUnauthorized: true, // Verify certificate (more secure)
            minVersion: 'TLSv1.2' // Require TLS 1.2 or higher
          },
          // Additional connection options
          connectionTimeout: 30000, // 30 seconds (increased for better reliability)
          greetingTimeout: 30000,
          socketTimeout: 30000
        });
        
        const mailOptions = {
          from: senderEmail, // Can be EMAIL_FROM or EMAIL_USER
          to: email,
          subject: subject,
          text: text,
          html: htmlContent,
        };
        
        console.log('Attempting to send email with nodemailer/Gmail...');
        console.log('From:', senderEmail);
        console.log('To:', email);
        console.log('Auth user:', emailUserForAuth);
        
        // Verify connection before sending
        try {
          console.log('Verifying SMTP connection...');
          await transporter.verify();
          console.log('✅ SMTP connection verified successfully');
        } catch (verifyError) {
          console.error('❌ SMTP connection verification failed:', verifyError.message);
          console.error('Error code:', verifyError.code);
          // Continue anyway - sometimes verify fails but sendMail works
        }
        
        // Try sending email - if port 587 fails, try port 465 as fallback
        let sendError = null;
        try {
          const info = await transporter.sendMail(mailOptions);
          console.log('✅ Email sent successfully with nodemailer (port 587):', info.messageId);
          emailSent = true;
        } catch (firstError) {
          sendError = firstError;
          console.error('❌ Port 587 failed:', {
            code: firstError.code,
            message: firstError.message,
            command: firstError.command,
            response: firstError.response
          });
          console.warn(`Port 587 failed (${firstError.code}), trying port 465 (SSL) as fallback...`);
          
          // Try port 465 (SSL) as fallback
          try {
            const transporter465 = nodemailer.createTransport({
              host: 'smtp.gmail.com',
              port: 465,
              secure: true,
              auth: {
                user: emailUserForAuth,
                pass: cleanPassword,
              },
              tls: { 
                rejectUnauthorized: true,
                minVersion: 'TLSv1.2'
              },
              connectionTimeout: 30000,
              greetingTimeout: 30000,
              socketTimeout: 30000
            });
            
            // Verify fallback connection
            try {
              await transporter465.verify();
              console.log('✅ SMTP connection verified on port 465');
            } catch (verifyError) {
              console.warn('⚠️ SMTP verification failed on port 465, continuing anyway...');
            }
            
            const info = await transporter465.sendMail(mailOptions);
            console.log('✅ Email sent successfully with nodemailer (port 465):', info.messageId);
            emailSent = true;
          } catch (fallbackError) {
            console.error('❌ Port 465 also failed:', {
              code: fallbackError.code,
              message: fallbackError.message,
              command: fallbackError.command,
              response: fallbackError.response
            });
            // Use the more specific error (auth errors are more helpful)
            sendError = (fallbackError.code === 'EAUTH' || firstError.code !== 'ECONNECTION') ? fallbackError : firstError;
          }
        }
        
        // If email wasn't sent, throw error with helpful message
        if (!emailSent && sendError) {
          let errorMessage = 'Failed to send email via Gmail. ';
          
          if (sendError.code === 'EAUTH' || 
              sendError.message?.includes('Invalid login') || 
              sendError.message?.includes('authentication failed') ||
              sendError.message?.includes('Username and Password not accepted') ||
              sendError.message?.includes('Invalid credentials') ||
              sendError.responseCode === 535) {
            errorMessage += 'Gmail authentication failed. Please verify:\n';
            errorMessage += '1. EMAIL_USER is your full Gmail address (e.g., yourname@gmail.com)\n';
            errorMessage += '2. EMAIL_PASSWORD is a Gmail App Password (NOT your regular password)\n';
            errorMessage += '3. Generate App Password at: https://myaccount.google.com/apppasswords\n';
            errorMessage += '4. Enable 2-Step Verification first if needed\n';
            errorMessage += '5. Update EMAIL_PASSWORD in Render dashboard and restart service';
          } else if (sendError.code === 'ECONNECTION' || sendError.code === 'ETIMEDOUT') {
            errorMessage += 'Connection to Gmail SMTP servers failed. ';
            errorMessage += 'Possible causes:\n';
            errorMessage += '1. Network/firewall blocking SMTP ports (587/465)\n';
            errorMessage += '2. Gmail blocking less secure app access (use App Password)\n';
            errorMessage += '3. Server IP is blocked by Gmail\n';
            errorMessage += '4. Check if "Allow less secure apps" is enabled (deprecated, use App Password instead)\n';
            errorMessage += `\nError details: ${sendError.message || sendError.code}`;
          } else if (sendError.code === 'ESOCKET' || sendError.code === 'ETIMEDOUT') {
            errorMessage += 'Socket/Timeout error. ';
            errorMessage += 'This usually means:\n';
            errorMessage += '1. Network connectivity issues\n';
            errorMessage += '2. Firewall blocking SMTP ports\n';
            errorMessage += '3. Gmail rate limiting\n';
            errorMessage += `\nError details: ${sendError.message || sendError.code}`;
          } else {
            errorMessage += sendError.message || 'Unknown error occurred.';
            if (sendError.code) {
              errorMessage += ` (Error code: ${sendError.code})`;
            }
          }
          
          throw new Error(errorMessage);
        }
      } else {
        console.log('Email already sent via SendGrid, skipping nodemailer');
      }

      res.status(200).json({
        message: 'Form link sent successfully',
        formLink,
        token,
        emailSent: true
      });
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      console.error('Email error details:', {
        message: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response?.data || emailError.response?.body,
        statusCode: emailError.response?.statusCode,
        stack: emailError.stack
      });

      // Determine which service failed and provide helpful error message
      let errorMessage = emailError.message;
      let helpfulHint = '';
      
      if (emailError.response?.statusCode === 401 || emailError.message?.includes('Unauthorized')) {
        if (process.env.SENDGRID_API_KEY) {
          helpfulHint = 'SendGrid authentication failed. Check: 1) API key is valid, 2) From email is verified in SendGrid dashboard, 3) API key has mail.send permission.';
        } else {
          helpfulHint = 'Gmail authentication failed. For Gmail, you must use an App Password (not your regular password). Enable 2FA and generate an app password.';
        }
      } else if (emailError.code === 'EAUTH') {
        helpfulHint = 'Gmail authentication failed. Please verify EMAIL_USER and EMAIL_PASSWORD are correct. Use an App Password for Gmail accounts with 2FA enabled.';
      }

      // Still save the token but inform about email failure
      res.status(500).json({
        message: 'Form token created but email failed to send',
        error: errorMessage,
        errorCode: emailError.code || emailError.response?.statusCode,
        hint: helpfulHint,
        formLink,
        token,
        emailSent: false,
        debug: {
          triedSendGrid: !!process.env.SENDGRID_API_KEY,
          triedNodemailer: !process.env.SENDGRID_API_KEY || emailError.code !== 'EAUTH',
          EMAIL_USER_set: !!process.env.EMAIL_USER,
          EMAIL_PASSWORD_set: !!process.env.EMAIL_PASSWORD,
          SENDGRID_API_KEY_set: !!process.env.SENDGRID_API_KEY
        }
      });
    }
  } catch (error) {
    console.error('Send form link error:', error);
    console.error('Full error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // More detailed error response
    res.status(500).json({ 
      message: 'Failed to send form link', 
      error: error.message,
      errorType: error.name,
      errorCode: error.code,
      debug: {
        EMAIL_USER: !!process.env.EMAIL_USER,
        EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
        EMAIL_FROM: !!process.env.EMAIL_FROM,
        SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY
      }
    });
  }
});

// Get form template by token (public route for form display)
router.get('/form-by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find the form token
    const formToken = await FormToken.findOne({ token }).populate('formTemplateId');
    
    if (!formToken) {
      return res.status(404).json({ message: 'Invalid or expired token' });
    }

    // Check if token is already completed
    if (formToken.status === 'completed') {
      return res.status(400).json({ message: 'This form has already been completed' });
    }

    // If formTemplateId exists, fetch the form template
    if (formToken.formTemplateId) {
      const FormTemplate = (await import('../models/FormTemplate.js')).default;
      const User = (await import('../models/User.js')).default;
      const formTemplate = await FormTemplate.findById(formToken.formTemplateId);
      
      if (!formTemplate) {
        return res.status(404).json({ message: 'Form template not found' });
      }

      // Fetch doctors for demographics questions (public access)
      let doctors = [];
      try {
        doctors = await User.find({ role: 'doctor' }).select('_id firstName lastName');
      } catch (error) {
        console.error('Error fetching doctors:', error);
      }

      return res.json({
        success: true,
        formTemplate: formTemplate,
        doctors: doctors,
        tokenInfo: {
          email: formToken.email,
          clientName: formToken.clientName,
          language: formToken.language,
          status: formToken.status
        }
      });
    }

    // If no form template, return token info only (for backward compatibility)
    return res.json({
      success: true,
      formTemplate: null,
      tokenInfo: {
        email: formToken.email,
        clientName: formToken.clientName,
        language: formToken.language,
        status: formToken.status
      }
    });
  } catch (error) {
    console.error('Error fetching form by token:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Handle public form submission
router.post('/form-submission/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const submissionData = req.body;
    
    // Check if this is a form template response submission
    if (submissionData.formTemplate && submissionData.responses) {
      // Handle form template response submission
      const FormResponse = (await import('../models/FormResponse.js')).default;
      const FormTemplate = (await import('../models/FormTemplate.js')).default;
      
      // Find the form token
      const formToken = await FormToken.findOne({ token });
      if (!formToken) {
        return res.status(400).json({ message: 'Invalid or expired token' });
      }
      
      if (formToken.status === 'completed') {
        return res.status(400).json({ message: 'This form has already been submitted' });
      }
      
      // Extract patient data from demographics response if patientId not provided
      let patientId = submissionData.patientId || null;
      
      console.log('Form submission received:', {
        hasFormTemplate: !!submissionData.formTemplate,
        responsesCount: submissionData.responses?.length || 0,
        hasPatientId: !!submissionData.patientId
      });
      
      if (!patientId) {
        // Find demographics response
        const demographicsResponse = submissionData.responses.find(
          (r) => r.questionType === 'demographics' && r.answer
        );
        
        console.log('Demographics response search:', {
          found: !!demographicsResponse,
          responseKeys: demographicsResponse ? Object.keys(demographicsResponse) : [],
          answerKeys: demographicsResponse?.answer ? Object.keys(demographicsResponse.answer) : []
        });
        
        if (demographicsResponse && demographicsResponse.answer) {
          const demoData = demographicsResponse.answer;
          
          console.log('Demographics response found:', JSON.stringify(demoData, null, 2));
          
          // Extract fields - handle both camelCase and fieldName formats
          // The field names come from the form template, which might be "First Name", "Last Name", etc.
          const firstName = demoData.firstName || demoData['First Name'] || demoData['firstName'] || '';
          const lastName = demoData.lastName || demoData['Last Name'] || demoData['lastName'] || '';
          const assignedDoctor = demoData.assignedDoctor || '';
          
          console.log('Extracted patient fields:', {
            firstName,
            lastName,
            assignedDoctor,
            hasAllRequired: !!(firstName && lastName && assignedDoctor)
          });
          
          // Check if required fields are present
          if (firstName && lastName && assignedDoctor) {
            try {
              // Build address from individual fields if address object doesn't exist
              let address = demoData.address;
              if (!address || typeof address !== 'object') {
                address = {
                  street: demoData.street || demoData['Street Address'] || '',
                  city: demoData.city || demoData['City'] || '',
                  state: demoData.state || demoData['State'] || '',
                  zipCode: demoData.zipCode || demoData['Zip Code'] || '',
                  country: 'USA'
                };
              }
              
              // Create patient from demographics data - use both formats for compatibility
              const patient = new Patient({
                dynamicData: {
                  // Store in both formats for compatibility
                  firstName: firstName,
                  lastName: lastName,
                  'First Name': firstName,
                  'Last Name': lastName,
                  dateOfBirth: demoData.dateOfBirth || demoData['Date of Birth'] || '',
                  'Date of Birth': demoData.dateOfBirth || demoData['Date of Birth'] || '',
                  gender: demoData.gender || demoData['Gender'] || '',
                  'Gender': demoData.gender || demoData['Gender'] || '',
                  email: demoData.email || demoData['Email'] || '',
                  'Email': demoData.email || demoData['Email'] || '',
                  phone: demoData.phone || demoData['Mobile Phone'] || demoData['Phone'] || '',
                  'Mobile Phone': demoData.phone || demoData['Mobile Phone'] || demoData['Phone'] || '',
                  address: address,
                  medicalHistory: demoData.medicalHistory || { allergies: [], medications: [], conditions: [], surgeries: [], familyHistory: [] },
                  subjective: demoData.subjective || {
                    fullName: '', date: '', physical: [], sleep: [], cognitive: [], digestive: [], emotional: [],
                    bodyPart: [], severity: '', quality: [], timing: '', context: '', exacerbatedBy: [], symptoms: [],
                    notes: '', radiatingTo: '', radiatingRight: false, radiatingLeft: false, sciaticaRight: false, sciaticaLeft: false,
                  }
                },
                assignedDoctor: assignedDoctor,
                status: 'active',
                formData: []
              });
              
              await patient.save();
              patientId = patient._id.toString();
              
              console.log('Patient created from form submission:', {
                id: patientId,
                firstName: firstName,
                lastName: lastName,
                email: demoData.email || demoData['Email'] || '',
                assignedDoctor: assignedDoctor
              });
            } catch (error) {
              console.error('Error creating patient from demographics:', error);
              console.error('Error stack:', error.stack);
              return res.status(500).json({ 
                message: 'Error creating patient record', 
                error: error.message 
              });
            }
          } else {
            console.log('Missing required fields for patient creation:', {
              hasFirstName: !!firstName,
              hasLastName: !!lastName,
              hasAssignedDoctor: !!assignedDoctor,
              demoDataKeys: Object.keys(demoData)
            });
          }
        } else {
          console.log('No demographics response found in submission');
        }
      }
      
      // Create form response
      const formResponse = new FormResponse({
        formTemplate: submissionData.formTemplate,
        patient: patientId || null,
        responses: submissionData.responses,
        status: submissionData.status || 'completed',
        completedAt: submissionData.completedAt ? new Date(submissionData.completedAt) : new Date(),
        submittedVia: 'public_token',
        formToken: token
      });
      
      await formResponse.save();
      
      // Link patient to form token and update patient with form response
      if (patientId) {
        formToken.patientId = patientId;
        
        // Update patient to include form response
        const patient = await Patient.findById(patientId);
        if (patient) {
          patient.formResponses = patient.formResponses || [];
          patient.formResponses.push(formResponse._id);
          await patient.save();
        }
      }
      
      // Update token status
      formToken.status = 'completed';
      formToken.completedAt = new Date();
      await formToken.save();
      
      return res.json({
        success: true,
        message: 'Form submitted successfully',
        formResponseId: formResponse._id,
        patientId: patientId || null
      });
    }
    
    // Original patient data submission (backward compatibility)
    const patientData = submissionData;

    // Validate the token
    if (!token) {
      return res.status(400).json({ message: 'Invalid or missing token' });
    }

    // Find the form token in the database
    const formToken = await FormToken.findOne({ token });
    if (!formToken) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Check if the token has already been used
    if (formToken.status === 'completed') {
      return res.status(400).json({ message: 'This form has already been submitted' });
    }

    // Generate a case number if attorney info is present
    if (patientData.attorney && patientData.attorney.name) {
      const counter = await Counter.findOneAndUpdate(
        { name: 'caseNumber' },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );

      const formattedCaseNumber = `P-${String(counter.value).padStart(3, '0')}`;
      patientData.attorney.caseNumber = formattedCaseNumber;
    }

    // Ensure required fields are present
    if (!patientData.firstName || !patientData.lastName || !patientData.email) {
      return res.status(400).json({
        message: 'Missing required fields',
        requiredFields: ['firstName', 'lastName', 'email']
      });
    }

    // Extract any form data to store in dynamicData
    const dynamicData = new Map();

    // Store any form data that was previously in medicalHistory or subjective
    if (patientData.medicalHistory) {
      if (patientData.medicalHistory.allergies) dynamicData.set('allergies', patientData.medicalHistory.allergies);
      if (patientData.medicalHistory.medications) dynamicData.set('medications', patientData.medicalHistory.medications);
      if (patientData.medicalHistory.conditions) dynamicData.set('conditions', patientData.medicalHistory.conditions);
      if (patientData.medicalHistory.surgeries) dynamicData.set('surgeries', patientData.medicalHistory.surgeries);
      if (patientData.medicalHistory.familyHistory) dynamicData.set('familyHistory', patientData.medicalHistory.familyHistory);
    }

    if (patientData.subjective) {
      if (patientData.subjective.bodyPart) dynamicData.set('bodyParts', patientData.subjective.bodyPart);
      if (patientData.subjective.severity) dynamicData.set('severity', patientData.subjective.severity);
      if (patientData.subjective.quality) dynamicData.set('quality', patientData.subjective.quality);
      if (patientData.subjective.symptoms) dynamicData.set('symptoms', patientData.subjective.symptoms);
    }

    // Store form data if available
    const formEntries = [];
    formEntries.push({
      formType: 'intake',
      formId: 'public-form-submission',
      data: new Map(Object.entries(patientData)),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create and save patient with dynamic data structure
    const patient = new Patient({
      ...patientData,
      dynamicData,
      formData: formEntries,
      createdVia: 'public_form',
      formToken: token,
      status: 'pending', // Set initial status to pending for review
      submittedAt: new Date(),
      // Remove these fields as they're now stored in dynamicData
      medicalHistory: undefined,
      subjective: undefined
    });

    await patient.save();

    // Update the form token status to completed
    formToken.status = 'completed';
    formToken.completedAt = new Date();
    formToken.patientId = patient._id;
    await formToken.save();

    // Send notification to admin/staff about new patient submission
    // This would be implemented in a real system
    // For now, we'll just log it
    console.log(`New patient submission received: ${patient.firstName} ${patient.lastName}`);

    // Send confirmation email to the patient
    if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
      try {
        const language = patientData.preferredLanguage || formToken.language || 'english';

        const subject = language === 'spanish' ?
          'Formulario recibido - The Wellness Studio' :
          'Form Received - The Wellness Studio';

        const text = language === 'spanish' ?
          `Gracias por enviar su formulario. Nos pondremos en contacto con usted pronto.` :
          `Thank you for submitting your form. We will be in touch with you soon.`;

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
            <h2 style="color: #333;">${language === 'spanish' ? 'Formulario Recibido' : 'Form Received'}</h2>
            <p style="color: #666; line-height: 1.5;">
              ${language === 'spanish' ?
            `Hola ${patient.firstName},<br><br>Gracias por enviar su formulario. Hemos recibido su información y nos pondremos en contacto con usted pronto.` :
            `Hello ${patient.firstName},<br><br>Thank you for submitting your form. We have received your information and will be in touch with you soon.`}
            </p>
            <p style="color: #666; line-height: 1.5;">
              ${language === 'spanish' ?
            'Si tiene alguna pregunta, no dude en contactarnos.' :
            'If you have any questions, please don\'t hesitate to contact us.'}
            </p>
          </div>
        `;

        const msg = {
          to: patient.email,
          from: process.env.EMAIL_FROM,
          subject: subject,
          text: text,
          html: htmlContent,
        };

        const response = await sgMail.send(msg);
        console.log(`Confirmation email sent to ${patient.email} using SendGrid`);
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Don't fail the request if email sending fails
      }
    }

    res.status(201).json({
      message: 'Patient information submitted successfully',
      patient: {
        id: patient._id,
        name: `${patient.firstName} ${patient.lastName}`
      }
    });
  } catch (error) {
    console.error('Form submission error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
