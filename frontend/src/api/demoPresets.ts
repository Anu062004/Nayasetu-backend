export interface DemoPresetItem {
  id: string;
  label: string;
  sublabel?: string;
  district?: string;
  category?: string;
}

export const DEMO_PERSONAS = [
  { id: '00000000-0000-4000-8000-000000000001', role: 'CITIZEN' as const, label: 'Aarav Mehta (Citizen Seeking Aid)', desc: 'Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000002', role: 'PROVIDER' as const, label: 'Adv. Ananya Sharma (Demo Advocate)', desc: 'Bengaluru Urban (45 Pro Bono Credits)' },
  { id: '00000000-0000-4000-8000-000000000003', role: 'OPERATOR' as const, label: 'Shri Ramesh Patel (Nyaya Mitra)', desc: 'Paralegal Volunteer Helper' },
  { id: '00000000-0000-4000-8000-000000000005', role: 'INSTITUTION' as const, label: 'Karnataka DLSA Authority', desc: 'District Legal Services Authority' },
  { id: '00000000-0000-4000-8000-000000000005', role: 'ADMIN' as const, label: 'System Administrator', desc: 'Platform Owner Identity' },
];

export const DEMO_PROVIDERS: DemoPresetItem[] = [
  { id: '00000000-0000-4000-8000-000000000020', label: 'Adv. Ananya Sharma (Advocate)', sublabel: 'Bengaluru Urban • Senior Advocate (45 Pro Bono Credits)', district: 'Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000021', label: 'Adv. Vikramaditya Sen (Advocate)', sublabel: 'Delhi Central • High Court Panelist (Criminal Defense)', district: 'Delhi Central' },
  { id: '00000000-0000-4000-8000-000000000022', label: 'Adv. Priya Deshmukh (Advocate)', sublabel: 'Mumbai Suburban • Property Dispute Specialist', district: 'Mumbai Suburban' },
  { id: '00000000-0000-4000-8000-000000000023', label: 'Shri Rajeshwar Rao (Mediator)', sublabel: 'Bengaluru Urban • Certified Commercial Mediator', district: 'Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000024', label: 'Smt. Shalini Kulkarni (Mediator)', sublabel: 'Pune • Family & Civil Dispute Mediator', district: 'Pune' },
  { id: '00000000-0000-4000-8000-000000000025', label: 'Justice (Retd.) K. S. Murthy (Arbitrator)', sublabel: 'Bengaluru Urban • Retd. High Court Judge', district: 'Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000027', label: 'Smt. Meenakshi Sundaram (Notary)', sublabel: 'Bengaluru Urban • Govt Certified Notary Public', district: 'Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000029', label: 'Shri Vijay Kumar Patel (Document Writer)', sublabel: 'Bengaluru Urban • Licensed Deed Writer', district: 'Bengaluru Urban' },
];

export const DEMO_MATTERS: DemoPresetItem[] = [
  { id: '00000000-0000-4000-8000-000000000007', label: 'Matter #00007 (Bengaluru Property Dispute)', sublabel: 'Bengaluru Urban • Aarav Mehta & Adv. Ananya Sharma' },
  { id: '00000000-0000-4000-8000-000000000008', label: 'Matter #00008 (Delhi Criminal Bail Defense)', sublabel: 'Delhi Central • Adv. Vikramaditya Sen' },
  { id: '00000000-0000-4000-8000-000000000009', label: 'Matter #00009 (Mumbai Commercial Dispute)', sublabel: 'Mumbai Suburban • Adv. Priya Deshmukh' },
  { id: '00000000-0000-4000-8000-000000000010', label: 'Matter #00010 (Pune Family Support Mediation)', sublabel: 'Pune • Smt. Shalini Kulkarni' },
];

export const DEMO_BOOKINGS: DemoPresetItem[] = [
  { id: '00000000-0000-4000-8000-000000000004', label: 'Booking #00004 (Property Consultation)', sublabel: 'Held Slot • Bengaluru Urban' },
  { id: '00000000-0000-4000-8000-000000000005', label: 'Booking #00005 (Bail Defense Review)', sublabel: 'Held Slot • Delhi Central' },
  { id: '00000000-0000-4000-8000-000000000006', label: 'Booking #00006 (Mediation Session)', sublabel: 'Held Slot • Pune' },
];

export const DEMO_CITIZENS: DemoPresetItem[] = [
  { id: '00000000-0000-4000-8000-000000000001', label: 'Aarav Mehta (Demo Citizen)', sublabel: 'Bengaluru Urban • Section 12 Legal Aid Applicant' },
  { id: '00000000-0000-4000-8000-000000000010', label: 'Priya Verma (Tenant Applicant)', sublabel: 'Delhi Central • Property & Tenancy Rights' },
  { id: '00000000-0000-4000-8000-000000000011', label: 'Suresh Kumar (Labour Rights Beneficiary)', sublabel: 'Mumbai Suburban • Unpaid Wages Claim' },
];

export const DEMO_CONSENTS: DemoPresetItem[] = [
  { id: 'CONSENT-DLSA-2026-001', label: 'CONSENT-DLSA-2026-001', sublabel: 'Karnataka DLSA Statutory Standing Audit Order' },
  { id: 'CONSENT-BCI-2026-002', label: 'CONSENT-BCI-2026-002', sublabel: 'Bar Council of India Professional Conduct Inquiry' },
  { id: 'CONSENT-NALSA-2026-003', label: 'CONSENT-NALSA-2026-003', sublabel: 'National Legal Aid Quality Inspection Order' },
];
