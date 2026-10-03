/**
 * ============================================================================
 * MODULE: Multi-Tenant Hospital Profile Configuration (src/config/hospital_profile.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Centralized hospital metadata configuration. Enables rapid re-branding across
 *   client facilities (e.g. SUM Hospital, Apollo, AIIMS) via environment variables
 *   without requiring changes to the workflow automation engine.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section D (DemoCare Hospital Specifications)
 *   - Blueprint V3: Section AR (ABDM Facility Identifiers & Governance)
 *
 * PACKAGES & DEPENDENCIES:
 *   - dotenv                               : Loads custom facility variables from .env
 *
 * KEY EXPORTS:
 *   - HOSPITAL_PROFILE                     : Facility name, phone, city, address, ABDM ID
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Used in message drafting, receipts, patient intake, and executive briefings.
 * ============================================================================
 */

import dotenv from 'dotenv';
dotenv.config();

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
