import dotenv from 'dotenv';
dotenv.config();

/**
 * Enterprise Hospital Profile Configuration
 * Allows 1-minute re-branding for large hospitals (e.g. SUM Hospital, Apollo, AIIMS)
 * by updating .env parameters without altering any workflow engine code.
 */
export const HOSPITAL_PROFILE = {
  name: process.env.HOSPITAL_NAME || 'DemoCare Multispeciality Hospital',
  shortName: process.env.HOSPITAL_SHORT_NAME || 'DemoCare',
  city: process.env.HOSPITAL_CITY || 'Mumbai',
  phone: process.env.HOSPITAL_PHONE || '+91 22 5550 1234',
  emergencyPhone: process.env.EMERGENCY_PHONE || '112 / 108',
  domain: process.env.HOSPITAL_DOMAIN || 'https://democare.hospital',
  address: process.env.HOSPITAL_ADDRESS || 'Central Healthcare Corridor, Worli, Mumbai',
  abdmFacilityId: process.env.ABDM_FACILITY_ID || 'IN-MH-MUM-00941'
};
