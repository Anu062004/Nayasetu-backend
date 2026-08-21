import React, { useState, useEffect } from 'react';
import { api, type ActorContextState } from '../api/client';

interface CitizenPortalProps {
  actor: ActorContextState;
}

export const CitizenPortal: React.FC<CitizenPortalProps> = ({ actor }) => {
  const [formData, setFormData] = useState({
    citizenUserId: actor.actorId,
    taxonomyCode: 'CIVIL_PROPERTY_DISPUTE',
    district: 'Bengaluru Urban',
    language: 'English',
    modePreference: 'HYBRID',
    feeCeiling: 2500,
    urgency: 'STANDARD',
    channel: 'WEB',
    selfDeclaredSection12Category: '',
    narrative: '',
  });

  const [loading, setLoading] = useState(false);
  const [needResult, setNeedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Directory state
  const [providerType, setProviderType] = useState<string>('ADVOCATE');
  const [directoryData, setDirectoryData] = useState<any>(null);
  const [dirLoading, setDirLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [allocationResult, setAllocationResult] = useState<any>(null);
  const [referralDoc, setReferralDoc] = useState<any>(null);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, citizenUserId: actor.actorId }));
  }, [actor.actorId]);

  const handleSubmitNeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedResult(null);
    setDirectoryData(null);
    setAllocationResult(null);
    setReferralDoc(null);

    try {
      const payload: any = {
        citizenUserId: formData.citizenUserId,
        taxonomyCode: formData.taxonomyCode,
        district: formData.district,
        language: formData.language,
        modePreference: formData.modePreference,
        urgency: formData.urgency,
        channel: formData.channel,
      };

      if (formData.selfDeclaredSection12Category) {
        payload.selfDeclaredSection12Category = formData.selfDeclaredSection12Category;
      } else {
        payload.feeCeiling = Number(formData.feeCeiling);
      }

      if (formData.narrative) {
        payload.narrative = formData.narrative;
      }

      const res = await api.createNeedRequest(payload);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setNeedResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit legal assistance request');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchDirectory = async (selectedType = providerType) => {
    if (!needResult?.requestId) return;
    setDirLoading(true);
    setError(null);

    try {
      const res = await api.getDirectory(needResult.requestId, selectedType, 'SELF_DECLARED');
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setDirectoryData(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to find verified legal helpers');
    } finally {
      setDirLoading(false);
    }
  };

  const handleSelectProvider = async (providerId: string) => {
    if (!needResult?.requestId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.selectProvider(needResult.requestId, providerId);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setSelectedProvider(providerId);
        setAllocationResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request consultation');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchReferral = async () => {
    if (!needResult?.requestId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await api.getReferral(needResult.requestId);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setReferralDoc(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load official legal aid referral');
    } finally {
      setLoading(false);
    }
  };

  const legalCategories = [
    { code: 'CIVIL_PROPERTY_DISPUTE', label: 'Land, Tenancy & Property Dispute', desc: 'Boundary issues, tenancy rights & partition', icon: 'home' },
    { code: 'FAMILY_MAINTENANCE', label: 'Family, Matrimonial & Child Support', desc: 'Custody, maintenance & domestic matters', icon: 'family_restroom' },
    { code: 'LABOUR_WAGES_DISPUTE', label: 'Labour, Wages & Employment Rights', desc: 'Unpaid wages, workplace disputes & termination', icon: 'work' },
    { code: 'CONSUMER_DISPUTE', label: 'Consumer Rights & Fraud Protection', desc: 'Deficient services, claims & product disputes', icon: 'shopping_bag' },
    { code: 'CRIMINAL_BAIL_DEFENSE', label: 'Criminal Defense & Bail Assistance', desc: 'Bail representation & fundamental rights', icon: 'policy' },
    { code: 'CIVIL_GENERAL', label: 'General Civil Rights & Govt Schemes', desc: 'Documentation, entitlement & general advice', icon: 'gavel' },
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      
      {/* Title & Introduction Section */}
      <div className="section-box">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669]">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                Statutory Legal Aid (§12)
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#B45309]/10 text-[#B45309]">
                <span className="material-symbols-outlined text-[15px]">lock</span>
                Confidential & Protected
              </span>
            </div>
            <h1 className="font-['Source_Serif_4'] text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00152a] tracking-tight">
              Citizen Legal Need Intake & Allocation
            </h1>
            <p className="text-[#43474d] text-sm sm:text-base max-w-3xl leading-relaxed">
              Submit your legal assistance request. If you qualify under Section 12 of the Legal Services Authorities Act, you will receive 100% free legal aid with an official DLSA clinic voucher.
            </p>
          </div>

          <div className="card-box bg-[#efedf0] border-[#e3e2e4] text-right shrink-0 w-full sm:w-auto">
            <span className="text-[10px] uppercase font-bold text-[#43474d] tracking-wider block">
              Citizen Reference
            </span>
            <span className="font-mono text-sm font-bold text-[#B45309]">
              REF-{actor.actorId.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Error Callout */}
      {error && (
        <div className="bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#93000a] p-4 sm:p-5 rounded-2xl flex items-start gap-3 text-sm animate-fade-in shadow-sm">
          <span className="material-symbols-outlined text-2xl shrink-0 text-[#ba1a1a] mt-0.5">error</span>
          <div className="min-w-0">
            <strong className="block font-semibold">Please Note:</strong>
            <p className="mt-0.5 text-break-safe">{error}</p>
          </div>
        </div>
      )}

      {/* Step 1: Legal Need Intake Form */}
      <div className="section-box space-y-8">
        
        {/* Form Header */}
        <div className="flex items-center gap-3.5 pb-5 border-b border-[#e3e2e4]">
          <div className="step-number bg-[#00152a] text-white">
            1
          </div>
          <div>
            <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
              Step 1: Specify Your Legal Requirement
            </h2>
            <p className="text-xs sm:text-sm text-[#43474d]">
              Select your matter category and location to identify the right legal aid service.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmitNeed} className="space-y-8">
          
          {/* Fieldset 1: Category Selection */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="field-label">
                1. Select Matter Subject / Practice Area
              </label>
              <span className="text-xs text-[#B45309] font-semibold">Required</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {legalCategories.map((cat) => {
                const isSelected = formData.taxonomyCode === cat.code;
                return (
                  <div
                    key={cat.code}
                    onClick={() => setFormData({ ...formData, taxonomyCode: cat.code })}
                    className={`card-box-interactive flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-[#B45309] bg-[#ffdcc3]/15 shadow-sm ring-1 ring-[#B45309]'
                        : 'hover:border-[#c3c6ce]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-[#B45309] text-white' : 'bg-[#efedf0] text-[#00152a]'
                    }`}>
                      <span className="material-symbols-outlined text-xl">{cat.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-[#00152a] leading-tight">
                        {cat.label}
                      </div>
                      <p className="text-xs text-[#43474d] mt-1 line-clamp-2">
                        {cat.desc}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[#B45309] text-lg shrink-0">
                        check_circle
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fieldset 2: Location & Delivery Preference */}
          <div className="space-y-4 pt-4 border-t border-[#e3e2e4]">
            <label className="field-label">
              2. Location & Consultation Delivery
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* District */}
              <div>
                <label className="block text-xs font-semibold text-[#00152a] mb-1.5">
                  District / Location
                </label>
                <input
                  type="text"
                  className="legal-input"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  placeholder="e.g. Bengaluru Urban, Pune, Delhi"
                  required
                />
                <span className="field-hint">Your local court or DLSA jurisdiction</span>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-semibold text-[#00152a] mb-1.5">
                  Preferred Language
                </label>
                <select
                  className="legal-input"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                >
                  <option value="English">English</option>
                  <option value="Hindi">हिंदी (Hindi)</option>
                  <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
                  <option value="Tamil">தமிழ் (Tamil)</option>
                  <option value="Telugu">తెలుగు (Telugu)</option>
                  <option value="Marathi">मराठी (Marathi)</option>
                  <option value="Bengali">বাংলা (Bengali)</option>
                </select>
                <span className="field-hint">Consultation in your native language</span>
              </div>

              {/* Service Mode */}
              <div>
                <label className="block text-xs font-semibold text-[#00152a] mb-1.5">
                  Service Mode Preference
                </label>
                <select
                  className="legal-input"
                  value={formData.modePreference}
                  onChange={(e) => setFormData({ ...formData, modePreference: e.target.value })}
                >
                  <option value="HYBRID">Hybrid (Flexible Remote or In-Person)</option>
                  <option value="ONLINE">Remote Consultation (Phone / Video)</option>
                  <option value="IN_PERSON">In-Person (Court Complex / Clinic)</option>
                </select>
                <span className="field-hint">Choose how you wish to meet</span>
              </div>

            </div>
          </div>

          {/* Fieldset 3: Statutory Free Legal Aid Eligibility */}
          <div className="card-box bg-[#FDFCF7] border-[#e3e2e4] space-y-4 pt-4">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#B45309] text-2xl">help_center</span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#00152a]">
                  Statutory Free Legal Aid Self-Declaration (Section 12, Legal Services Authorities Act)
                </h3>
                <p className="text-xs text-[#43474d] mt-0.5">
                  Under Indian law, citizens belonging to the following categories are entitled to 100% government-funded legal representation.
                </p>
              </div>
            </div>

            <select
              className="legal-input bg-white"
              value={formData.selfDeclaredSection12Category}
              onChange={(e) => setFormData({ ...formData, selfDeclaredSection12Category: e.target.value })}
            >
              <option value="">None / Not Applicable (I will consult private verified advocates)</option>
              <option value="WOMEN_CHILDREN">Women & Children (§12c — 100% Free Government Legal Aid)</option>
              <option value="SCHEDULED_CASTE_TRIBE">Member of Scheduled Caste (SC) or Scheduled Tribe (ST) (§12a)</option>
              <option value="IN_CUSTODY">Person in Custody, Detention, or Juvenile Home (§12g)</option>
              <option value="DISASTER_VICTIM">Victim of Mass Disaster, Violence, or Industrial Accident (§12e)</option>
              <option value="LOW_INCOME">Annual Household Income Below State Ceiling (§12h)</option>
            </select>

            {!formData.selfDeclaredSection12Category && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-[#00152a] mb-1">
                  Budget Consultation Ceiling (₹ INR)
                </label>
                <input
                  type="number"
                  className="legal-input max-w-xs"
                  value={formData.feeCeiling}
                  onChange={(e) => setFormData({ ...formData, feeCeiling: Number(e.target.value) })}
                  min="0"
                  step="100"
                />
                <span className="field-hint">Maximum fee you are comfortable paying for initial advice</span>
              </div>
            )}
          </div>

          {/* Fieldset 4: Confidential Summary */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="field-label">
                3. Brief Case Summary (Optional)
              </label>
              <span className="text-[11px] text-[#059669] flex items-center gap-1 font-semibold">
                <span className="material-symbols-outlined text-[14px]">shield</span>
                Processed Privately &bull; Never Stored Permanently
              </span>
            </div>
            <textarea
              className="legal-input"
              rows={3}
              value={formData.narrative}
              onChange={(e) => setFormData({ ...formData, narrative: e.target.value })}
              placeholder="Briefly state your concern. Any contact details or names are automatically sanitized..."
            />
          </div>

          {/* Action Bar */}
          <div className="flex justify-end pt-4 border-t border-[#e3e2e4]">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#00152a] hover:bg-[#102a43] text-white font-semibold text-sm px-8 py-3.5 rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">search_insights</span>
              <span>{loading ? 'Evaluating Eligibility & Routing...' : 'Submit & Find Legal Assistance'}</span>
            </button>
          </div>

        </form>
      </div>

      {/* Step 2: Routing Recommendation */}
      {needResult && (
        <div className="section-box border-2 border-[#B45309]/30 space-y-6 animate-fade-in">
          
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-[#e3e2e4]">
            <div className="flex items-center gap-3">
              <div className="step-number bg-[#059669] text-white">
                2
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Step 2: Statutory Routing Outcome
                </h2>
                <p className="text-xs text-[#43474d]">Determined by the Legal Services Authorities Act framework</p>
              </div>
            </div>
            <span className="text-xs bg-[#efedf0] px-3.5 py-1.5 rounded-full text-[#43474d] font-bold font-mono">
              Ref: REF-{needResult.requestId.slice(0, 8).toUpperCase()}
            </span>
          </div>

          {needResult.route === 'LEGAL_AID_REFERRAL' ? (
            /* Statutory Free Legal Aid Case */
            <div className="space-y-6">
              <div className="card-box bg-[#059669]/10 border-[#059669]/30 flex items-start gap-4 p-5">
                <span className="material-symbols-outlined text-[#059669] text-3xl shrink-0 mt-0.5">
                  verified_user
                </span>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-[#00152a]">
                    Qualified for 100% Free Government Legal Aid
                  </h3>
                  <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
                    Based on your Section 12 declaration, you are entitled to free legal advice, drafting, and full court representation through the <strong>District Legal Services Authority (DLSA) / Nyaya Bandhu</strong>.
                  </p>
                </div>
              </div>

              <div className="flex justify-start">
                <button
                  onClick={handleFetchReferral}
                  disabled={loading}
                  className="bg-[#059669] hover:bg-[#047857] text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  <span>Generate Official DLSA Referral Letter & Pass</span>
                </button>
              </div>
            </div>
          ) : (
            /* Transparent Market Consultation Route */
            <div className="space-y-6">
              <div className="card-box bg-[#ffdcc3]/40 border-[#ffdcc3] flex items-start gap-4 p-5">
                <span className="material-symbols-outlined text-[#904d00] text-3xl shrink-0 mt-0.5">
                  balance
                </span>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-[#00152a]">
                    Verified Legal Helpers Available in {formData.district}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
                    We have matched your matter with verified legal service providers practicing in <strong>{formData.district}</strong> who offer transparent rates with zero platform commission.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[#00152a] mb-1.5">
                    Filter by Professional Classification:
                  </label>
                  <select
                    className="legal-input"
                    value={providerType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setProviderType(newType);
                      handleFetchDirectory(newType);
                    }}
                  >
                    <option value="ADVOCATE">Advocate (Court Litigation & Legal Counsel)</option>
                    <option value="MEDIATOR">Mediator (ADR & Out-of-Court Conciliation)</option>
                    <option value="ARBITRATOR">Arbitrator (Commercial & Binding Dispute Resolution)</option>
                    <option value="NOTARY">Notary Public (Affidavits & Document Attestation)</option>
                    <option value="DOCUMENT_WRITER">Document Writer (Deed Drafting & Registry Filing)</option>
                  </select>
                </div>

                <div className="sm:self-end">
                  <button
                    onClick={() => handleFetchDirectory(providerType)}
                    disabled={dirLoading}
                    className="w-full sm:w-auto bg-[#B45309] hover:bg-[#904d00] text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span className="material-symbols-outlined text-lg">supervised_user_circle</span>
                    <span>{dirLoading ? 'Loading Directory...' : 'View Verified Directory'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Official Legal Aid Referral Voucher (Presidential/Statutory Layout) */}
      {referralDoc && (
        <div className="legal-certificate p-6 sm:p-8 md:p-10 space-y-6 animate-fade-in">
          
          {/* Certificate Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-[#e3e2e4]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#00152a] text-[#fe932c] flex items-center justify-center shadow-lg shrink-0">
                <span className="material-symbols-outlined text-3xl">account_balance</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a] tracking-tight">
                  National Legal Services Authority (NALSA / DLSA)
                </h3>
                <p className="text-xs sm:text-sm text-[#43474d]">
                  Statutory Legal Aid Referral Pass &bull; Issued under Act 39 of 1987
                </p>
              </div>
            </div>

            <div className="shrink-0">
              <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#059669] text-white shadow-sm">
                OFFICIAL VOUCHER
              </span>
            </div>
          </div>

          {/* Key Reference Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Beneficiary Reference</span>
              <strong className="text-[#00152a] text-sm sm:text-base font-mono mt-1 block">
                REF-{needResult?.requestId?.slice(0, 8).toUpperCase()}
              </strong>
            </div>
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Designated Clinic</span>
              <strong className="text-[#00152a] text-sm sm:text-base mt-1 block">
                {formData.district} DLSA Clinic
              </strong>
            </div>
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Statutory Qualification</span>
              <strong className="text-[#059669] text-sm sm:text-base mt-1 block">
                {formData.selfDeclaredSection12Category || 'Free Statutory Aid'}
              </strong>
            </div>
          </div>

          {/* Citizen Instructions */}
          <div className="card-box bg-white border-[#e3e2e4] space-y-3 p-5">
            <h4 className="font-bold text-sm sm:text-base text-[#00152a]">
              Instructions for the Beneficiary:
            </h4>
            <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-[#43474d] leading-relaxed">
              <li>Visit the <strong>District Legal Services Authority (DLSA)</strong> Front Office at the District Court Complex in <strong>{formData.district}</strong>.</li>
              <li>Present this Reference Voucher on your mobile or printed paper to the Duty Legal Aid Advocate.</li>
              <li>You will be allocated a dedicated Panel Advocate without any charges for drafting or representation.</li>
              <li>National Legal Aid Helpline (24/7 Toll-Free): <strong className="text-[#00152a]">15100</strong>.</li>
            </ul>
          </div>

          {/* Action Bar */}
          <div className="pt-2 flex justify-end">
            <button
              onClick={() => window.print()}
              className="bg-[#00152a] hover:bg-[#102a43] text-white text-xs sm:text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-base">print</span>
              <span>Print or Save Voucher</span>
            </button>
          </div>

        </div>
      )}

      {/* Step 3: Verified Advocates Directory */}
      {directoryData && (
        <div className="section-box space-y-8 animate-fade-in">
          
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-5 border-b border-[#e3e2e4]">
            <div className="flex items-center gap-3.5">
              <div className="step-number bg-[#B45309] text-white">
                3
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Step 3: Verified Advocates in {formData.district}
                </h2>
                <p className="text-xs sm:text-sm text-[#43474d]">
                  {directoryData.providerCount || 0} advocate(s) available &bull; Fair rotated directory
                </p>
              </div>
            </div>
            <span className="text-xs text-[#059669] font-semibold bg-[#059669]/10 px-3 py-1 rounded-full">
              Zero Platform Surcharge
            </span>
          </div>

          {directoryData.providers?.length === 0 ? (
            <div className="p-10 text-center bg-[#faf9fb] rounded-2xl border border-dashed border-[#c3c6ce] space-y-2">
              <span className="material-symbols-outlined text-4xl text-[#94a3b8]">person_search</span>
              <h3 className="text-base font-bold text-[#00152a]">No advocates currently registered in this district/category</h3>
              <p className="text-xs text-[#43474d] max-w-md mx-auto">
                Please switch to the "For Helpers & Advocates" tab to publish a provider profile first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {directoryData.providers?.map((provider: any, idx: number) => {
                const isSelected = selectedProvider === provider.providerId;
                return (
                  <div
                    key={provider.providerId || idx}
                    className={`card-box bg-white flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-[#059669] ring-2 ring-[#059669]/30 shadow-md'
                        : 'hover:border-[#B45309]'
                    }`}
                  >
                    <div>
                      {/* Advocate Header */}
                      <div className="flex justify-between items-start gap-3 mb-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-[#00152a] text-[#fe932c] flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                            {provider.displayName?.slice(0, 2).toUpperCase() || 'AD'}
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-bold text-[#00152a] truncate">
                              {provider.displayName}
                            </h3>
                            <span className="text-xs text-[#43474d] block truncate">
                              High Court & District Court
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#059669]/10 text-[#059669] shrink-0">
                          Verified
                        </span>
                      </div>

                      {/* Advocate Details Grid */}
                      <div className="space-y-2 text-xs text-[#43474d] py-3 border-y border-[#e3e2e4]">
                        <div className="flex justify-between">
                          <span>Consultation Fee:</span>
                          <strong className="text-[#00152a] font-semibold">
                            ₹{provider.feeRange?.[0]} - ₹{provider.feeRange?.[1]}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Languages:</span>
                          <span className="text-[#00152a] truncate max-w-[140px] text-right">
                            {provider.languages?.join(', ') || 'English, Hindi'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Jurisdiction:</span>
                          <span className="text-[#00152a]">{formData.district}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Button */}
                    <div className="pt-4 mt-auto">
                      <button
                        onClick={() => handleSelectProvider(provider.providerId)}
                        disabled={loading || isSelected}
                        className={`w-full py-3 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm ${
                          isSelected
                            ? 'bg-[#059669] text-white cursor-default'
                            : 'bg-[#00152a] hover:bg-[#102a43] text-white'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {isSelected ? 'check_circle' : 'send'}
                        </span>
                        <span>{isSelected ? 'Consultation Requested' : 'Request Consultation'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Allocation Confirmation Box */}
      {allocationResult && (
        <div className="section-box border-2 border-[#059669] bg-[#059669]/5 space-y-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <span className="material-symbols-outlined text-4xl text-[#059669] shrink-0 mt-0.5">
              check_circle
            </span>
            <div className="space-y-2 min-w-0">
              <h3 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                Consultation Request Confirmed
              </h3>
              <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
                Your consultation request has been forwarded to the advocate. You will be notified when your appointment time is confirmed.
              </p>
              <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#059669]/30 text-xs text-[#00152a] font-mono font-bold shadow-sm">
                Booking ID: {allocationResult.allocationId}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
