import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import {
  getAuthUrl,
  handleAuthCallback,
  insertEventForAppointment,
  updateEventForAppointment,
  deleteEventById,
} from '../services/googleCalendarService.js';
import { CLIENT_URL } from '../config/constants.js';

const router = express.Router();

/** OAuth callback (PUBLIC) */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');

    await handleAuthCallback(code, state);
    return res.redirect(`${CLIENT_URL}/settings?calendarConnected=true`);
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect(`${CLIENT_URL}/settings?calendarConnected=false`);
  }
});

// Everything below requires auth
router.use(authenticateToken);

/** Get OAuth URL */
router.get('/auth', async (req, res) => {
  try {
    const authUrl = getAuthUrl(req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/** Status – “connected” if we have either refresh or access token */
router.get('/status', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const connected = !!(user?.googleCalendar?.refreshToken || user?.googleCalendar?.accessToken);
    res.json({ connected });
  } catch (e) {
    console.error('Error checking status:', e);
    res.status(500).json({ connected: false, message: 'Server error', error: e.message });
  }
});

/** Manual sync (if you want to hit it) */
router.post('/sync/:appointmentId', async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.appointmentId)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });

    // Only allow doctor who owns it, or admin
    if (req.user.role === 'doctor' && String(appt.doctor._id) !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const data = await insertEventForAppointment(appt);
    appt.googleCalendarEventId = data.id;
    await appt.save();
    res.json({ message: 'Synced to Google Calendar', event: data });
  } catch (error) {
    console.error('Error syncing appointment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/sync/:appointmentId', async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.appointmentId)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (!appt.googleCalendarEventId) return res.status(400).json({ message: 'Not synced yet' });

    if (req.user.role === 'doctor' && String(appt.doctor._id) !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const data = await updateEventForAppointment(appt, appt.googleCalendarEventId);
    res.json({ message: 'Google Calendar event updated', event: data });
  } catch (error) {
    console.error('Error updating GC event:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/sync/:appointmentId', async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.appointmentId);
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (!appt.googleCalendarEventId) return res.status(400).json({ message: 'Not synced yet' });

    if (req.user.role === 'doctor' && String(appt.doctor) !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await deleteEventById(appt.doctor, appt.googleCalendarEventId);
    appt.googleCalendarEventId = undefined;
    await appt.save();
    res.json({ message: 'Google Calendar event deleted' });
  } catch (error) {
    console.error('Error deleting GC event:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/** Sync all appointments for the logged-in user */
router.post('/sync-all', async (req, res) => {
  try {
    // Check if user has Google Calendar connected
    const user = await User.findById(req.user.id);
    if (!user?.googleCalendar?.refreshToken && !user?.googleCalendar?.accessToken) {
      return res.status(400).json({ message: 'Google Calendar not connected. Please connect your calendar first.' });
    }

    // Build query based on user role
    let query = {};
    if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }
    // Admin can sync all appointments

    // Get all appointments that don't have a googleCalendarEventId yet
    const appointments = await Appointment.find({
      ...query,
      $or: [
        { googleCalendarEventId: { $exists: false } },
        { googleCalendarEventId: null },
        { googleCalendarEventId: '' }
      ],
      status: { $nin: ['cancelled', 'no-show'] } // Don't sync cancelled or no-show appointments
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');

    if (appointments.length === 0) {
      return res.json({ 
        message: 'All appointments are already synced', 
        synced: 0, 
        total: 0 
      });
    }

    let syncedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Sync each appointment
    for (const appt of appointments) {
      try {
        // Only sync appointments for the logged-in doctor (if doctor role)
        if (req.user.role === 'doctor' && String(appt.doctor._id) !== req.user.id) {
          continue;
        }

        const data = await insertEventForAppointment(appt);
        appt.googleCalendarEventId = data.id;
        await appt.save();
        syncedCount++;
      } catch (error) {
        console.error(`Error syncing appointment ${appt._id}:`, error);
        failedCount++;
        errors.push({
          appointmentId: appt._id,
          error: error.message
        });
      }
    }

    res.json({
      message: `Successfully synced ${syncedCount} appointment(s)${failedCount > 0 ? `. ${failedCount} failed.` : '.'}`,
      synced: syncedCount,
      failed: failedCount,
      total: appointments.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing all appointments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;
