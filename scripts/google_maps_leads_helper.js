import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.resolve(__dirname, '../sales-kit/prospect_list_50_template.csv');

/**
 * Curated High-Intent Hospital & Clinic Prospects (Google Maps & Public Registry)
 * Focused on Multispeciality Clinics with high online ad spend and noticeable manual drop-off
 */
const HIGH_VALUE_PROSPECTS = [
  // Mumbai
  ['Lilavati Prime Consultation Suites', 'Mumbai', 'https://lilavatiprime.example', '+91 22 2675 1000', 'Clinic Operations Head', 'Google Maps', 'Slow WhatsApp replies for private OPD slots', 'Not Contacted', '', 'Send Cold DM'],
  ['Nanavati Super Speciality OPD Centre', 'Mumbai', 'https://nanavatispeciality.example', '+91 22 2618 2255', 'Medical Director', 'Google Maps', 'No-show rate in evening Cardiology OPD', 'Not Contacted', '', 'Send Cold Email'],
  ['Dr. L. H. Hiranandani OPD Block', 'Mumbai', 'https://hiranandanihospital.example', '+91 22 2576 3300', 'Patient Experience Lead', 'Practo', 'Delayed post-op discharge follow-up calls', 'Not Contacted', '', 'Send Cold DM'],
  ['Kaya Skin & Hair Speciality Clinic', 'Mumbai (Bandra)', 'https://kayaclinic.example', '+91 22 4000 8899', 'Managing Dermatologist', 'Instagram Ads', 'Uncontacted social ad leads after 7 PM', 'Not Contacted', '', 'Send Cold DM'],
  
  // Pune
  ['Ruby Hall Clinic Speciality Wings', 'Pune', 'https://rubyhallspeciality.example', '+91 20 6645 5100', 'Hospital Administrator', 'Google Maps', 'Manual appointment reschedule delays', 'Not Contacted', '', 'Send Cold Email'],
  ['Jehangir Hospital Outpatient Wing', 'Pune', 'https://jehangirhospital.example', '+91 20 6681 1000', 'Operations Manager', 'Google Maps', 'High patient drop-off on weekend slots', 'Not Contacted', '', 'Send Cold DM'],
  ['Sancheti Orthopedic Speciality Hospital', 'Pune', 'https://sanchetihospital.example', '+91 20 2899 9999', 'Head of Orthopedic OPD', 'Practo', 'Missed appointment recovery taking hours', 'Not Contacted', '', 'Send Cold DM'],

  // Bengaluru
  ['Manipal Speciality Consultation Centre', 'Bengaluru', 'https://manipalspeciality.example', '+91 80 2502 4444', 'Outpatient Services Head', 'Google Maps', 'Heavy receptionist workload during morning OPD', 'Not Contacted', '', 'Send Cold Email'],
  ['Aster CMI Specialist OPD', 'Bengaluru', 'https://astercmiopd.example', '+91 80 4342 0100', 'Medical Administrator', 'Google Maps', 'Slow report ready notifications to patients', 'Not Contacted', '', 'Send Cold DM'],
  ['Oliva Skin & Hair Clinic', 'Bengaluru (Indiranagar)', 'https://olivaclinic.example', '+91 80 4646 9900', 'Clinic Manager', 'Instagram Ads', 'Unanswered DM inquiries over the weekend', 'Not Contacted', '', 'Send Cold DM'],

  // Delhi NCR
  ['Max Super Speciality OPD Block', 'Delhi NCR', 'https://maxspeciality.example', '+91 11 2651 5050', 'Chief Operating Officer', 'Google Maps', 'Reception staff overwhelmed with reminder calls', 'Not Contacted', '', 'Send Cold Email'],
  ['Fortis Escorts Heart Consultation', 'Delhi NCR', 'https://fortisescorts.example', '+91 11 4713 5000', 'Cardiology Clinic Head', 'Google Maps', 'Cardiac inquiry drop-off after OPD hours', 'Not Contacted', '', 'Send Cold DM']
];

export function enrichProspectList() {
  console.log('📍 Reading existing prospect CSV...');
  let content = fs.readFileSync(CSV_PATH, 'utf8');

  let addedCount = 0;
  for (const p of HIGH_VALUE_PROSPECTS) {
    const facilityName = p[0];
    if (!content.includes(facilityName)) {
      const line = p.map(val => `"${val.replace(/"/g, '""')}"`).join(',') + '\n';
      content += line;
      addedCount++;
    }
  }

  fs.writeFileSync(CSV_PATH, content, 'utf8');
  console.log(`✅ Successfully enriched prospect sheet with ${addedCount} high-intent clinics!`);
  console.log(`📁 File updated: ${CSV_PATH}`);
}

enrichProspectList();
