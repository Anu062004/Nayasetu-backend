import React, { useState } from 'react';
import { api, type ActorContextState } from '../api/client';
import { DEMO_PROVIDERS, DEMO_CONSENTS } from '../api/demoPresets';

interface InstitutionalPortalProps {
  actor: ActorContextState;
}

export const InstitutionalPortal: React.FC<InstitutionalPortalProps> = ({ actor }) => {
  // Grievance Form State
  const [grievanceForm, setGrievanceForm] = useState({
    subjectProviderId: '00000000-0000-4000-8000-000000000020',
    category: 'PROFESSIONAL_MISCONDUCT',
    description: 'Statutory grievance filed under Bar Council of India Standards of Professional Conduct.',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  // Institutional Record Inspection State
  const [inspectProviderId, setInspectProviderId] = useState('00000000-0000-4000-8000-000000000020');
  const [inspectConsentRef, setInspectConsentRef] = useState('CONSENT-DLSA-2026-001');
  const [inspectResult, setInspectResult] = useState<any>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSubmissionResult(null);

    if (actor.role !== 'CITIZEN' && actor.role !== 'OPERATOR') {
      setError(`Notice: Grievances must be filed by a Citizen or Nyaya Mitra Operator. Please switch your persona to 'Citizen' or 'Nyaya Mitra' in the top navigation bar to lodge a complaint.`);
      setLoading(false);
      return;
    }

    try {
      const res = await api.submitGrievance({
        subjectProviderId: grievanceForm.subjectProviderId,
        category: grievanceForm.category,
      });

      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setSubmissionResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit grievance');
    } finally {
      setLoading(false);
    }
  };

  const handleInspectRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspectLoading(true);
    setError(null);
    setInspectResult(null);

    try {
      const res = await api.getInstitutionalProviderRecord(inspectProviderId, inspectConsentRef);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setInspectResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to inspect institutional record');
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      
      {/* Title Header */}
      <div className="section-box">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#7C3AED]/10 text-[#7C3AED]">
                <span className="material-symbols-outlined text-[15px]">gavel</span>
                Bar Council & DLSA Oversight
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669]">
                <span className="material-symbols-outlined text-[15px]">policy</span>
                Advocates Act 1961 (§35)
              </span>
            </div>
            <h1 className="font-['Source_Serif_4'] text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00152a] tracking-tight">
              Institutional Governance & Disciplinary Rail
            </h1>
            <p className="text-[#43474d] text-sm sm:text-base max-w-3xl leading-relaxed">
              Statutory oversight for Bar Councils, High Court Legal Services Committees, and District Legal Services Authorities (DLSA).
            </p>
          </div>

          <div className="card-box bg-[#efedf0] border-[#e3e2e4] text-right shrink-0 w-full sm:w-auto">
            <span className="text-[10px] uppercase font-bold text-[#43474d] tracking-wider block">
              Authority Persona
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#00152a]">
              {actor.role === 'INSTITUTION' ? 'DLSA / Bar Council Official' : actor.role}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#93000a] p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-sm animate-fade-in shadow-sm">
          <span className="material-symbols-outlined text-2xl shrink-0 text-[#ba1a1a] mt-0.5">error</span>
          <div className="min-w-0">
            <strong className="block font-semibold">Please Note:</strong>
            <p className="mt-0.5 text-break-safe">{error}</p>
          </div>
        </div>
      )}

      {/* Disciplinary Progression Lifecycle Track */}
      <div className="section-box space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#e3e2e4]">
          <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#904d00] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">timeline</span>
          </div>
          <div>
            <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
              Statutory Grievance Lifecycle Track
            </h2>
            <p className="text-xs text-[#43474d]">Standard procedure under Bar Council of India Rules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="card-box bg-[#FAF9FB] p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="step-number bg-[#00152a] text-white">1</span>
              <h3 className="text-sm sm:text-base font-bold text-[#00152a]">1. Complaint Lodged</h3>
            </div>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              Citizen or Lok Adalat volunteer registers formal grievance regarding misconduct, non-appearance, or unauthorized fee demands.
            </p>
          </div>

          <div className="card-box bg-[#FAF9FB] p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="step-number bg-[#B45309] text-white">2</span>
              <h3 className="text-sm sm:text-base font-bold text-[#00152a]">2. DLSA Scrutiny</h3>
            </div>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              Member Secretary scrutinizes attendance records, court logs, and hearing reports for preliminary prima facie evaluation.
            </p>
          </div>

          <div className="card-box bg-[#FAF9FB] p-5 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <span className="step-number bg-[#7C3AED] text-white">3</span>
              <h3 className="text-sm sm:text-base font-bold text-[#00152a]">3. Bar Council Referral</h3>
            </div>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              Formal referral to State Bar Council Disciplinary Committee under Section 35 of the Advocates Act, 1961.
            </p>
          </div>

        </div>
      </div>

      {/* Grid: Lodge Conduct Complaint & Institutional Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Lodge Conduct Grievance Box */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#e3e2e4]">
              <div className="w-10 h-10 rounded-xl bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">report_problem</span>
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Lodge Formal Conduct Grievance
                </h2>
                <p className="text-xs text-[#43474d]">For Citizens & Nyaya Mitra Volunteers</p>
              </div>
            </div>

            <form onSubmit={handleSubmitGrievance} className="space-y-4">
              
              <div>
                <label className="field-label">Category of Complaint</label>
                <select
                  className="legal-input"
                  value={grievanceForm.category}
                  onChange={(e) => setGrievanceForm({ ...grievanceForm, category: e.target.value })}
                >
                  <option value="PROFESSIONAL_MISCONDUCT">Professional Misconduct (BCI Rules Violation)</option>
                  <option value="NON_APPEARANCE">Unexcused Absence in Listed Court Hearing</option>
                  <option value="UNAUTHORIZED_FEE_DEMAND">Demanding Unauthorized Fees for Free Legal Aid</option>
                  <option value="CONFLICT_OF_INTEREST">Undisclosed Representation of Adverse Party</option>
                </select>
              </div>

              <div>
                <label className="field-label flex justify-between items-center">
                  <span>Subject Advocate / Helper Identification</span>
                  <span className="text-[10px] text-[#ba1a1a] font-mono">{grievanceForm.subjectProviderId}</span>
                </label>
                <select
                  className="legal-input"
                  value={grievanceForm.subjectProviderId}
                  onChange={(e) => setGrievanceForm({ ...grievanceForm, subjectProviderId: e.target.value })}
                >
                  {DEMO_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} &bull; {p.sublabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Statement of Facts</label>
                <textarea
                  className="legal-input"
                  rows={3}
                  value={grievanceForm.description}
                  onChange={(e) => setGrievanceForm({ ...grievanceForm, description: e.target.value })}
                  placeholder="State the facts clearly and concisely..."
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ba1a1a] hover:bg-[#93000a] text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                <span>Submit Formal Grievance</span>
              </button>

            </form>

            {submissionResult && (
              <div className="p-4 bg-[#059669]/10 border border-[#059669]/30 rounded-xl text-xs space-y-1 animate-fade-in">
                <span className="font-bold text-[#00152a] block">Grievance Registered with DLSA Office</span>
                <p className="text-[#43474d]">
                  Tracking Reference: <strong>GRV-{submissionResult.submissionId?.slice(0, 8)}</strong> &bull; Status: {submissionResult.status}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Institutional Advocate Audit Box */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#e3e2e4]">
              <div className="w-10 h-10 rounded-xl bg-[#d1e4ff] text-[#00152a] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">verified_user</span>
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Institutional Standing Audit
                </h2>
                <p className="text-xs text-[#43474d]">For Authorized DLSA & Bar Council Officers</p>
              </div>
            </div>

            <form onSubmit={handleInspectRecord} className="space-y-4">
              
              <div>
                <label className="field-label flex justify-between items-center">
                  <span>Advocate Identification Code</span>
                  <span className="text-[10px] text-[#00152a] font-mono">{inspectProviderId}</span>
                </label>
                <select
                  className="legal-input"
                  value={inspectProviderId}
                  onChange={(e) => setInspectProviderId(e.target.value)}
                >
                  {DEMO_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} &bull; {p.sublabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label flex justify-between items-center">
                  <span>Statutory Authority Consent Order</span>
                  <span className="text-[10px] text-[#00152a] font-mono">{inspectConsentRef}</span>
                </label>
                <select
                  className="legal-input"
                  value={inspectConsentRef}
                  onChange={(e) => setInspectConsentRef(e.target.value)}
                >
                  {DEMO_CONSENTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} &bull; {c.sublabel}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={inspectLoading}
                className="w-full bg-[#00152a] hover:bg-[#102a43] text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">search</span>
                <span>{inspectLoading ? 'Fetching Dossier...' : 'Verify Standing & Service Record'}</span>
              </button>

            </form>

            {inspectResult && (
              <div className="card-box bg-[#FAF9FB] border-[#7C3AED]/30 space-y-3 animate-fade-in p-5">
                <div className="flex justify-between items-center pb-2 border-b border-[#e3e2e4]">
                  <h4 className="font-bold text-sm text-[#00152a]">Official Authority Dossier</h4>
                  <span className="px-2.5 py-1 rounded-full bg-[#059669] text-white font-bold text-xs">
                    {inspectResult.tier || 'VERIFIED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#43474d] block font-bold uppercase">Pro Bono Credits</span>
                    <strong className="text-sm text-[#00152a] mt-0.5 block">{inspectResult.serviceCredits || 0} Hours</strong>
                  </div>
                  <div>
                    <span className="text-[#43474d] block font-bold uppercase">Disciplinary Standing</span>
                    <strong className="text-sm text-[#059669] mt-0.5 block">Clear / In Good Standing</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
