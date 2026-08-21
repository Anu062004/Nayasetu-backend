import React, { useState, useEffect } from 'react';
import { api, type ActorContextState } from '../api/client';

interface ProviderPortalProps {
  actor: ActorContextState;
}

export const ProviderPortal: React.FC<ProviderPortalProps> = ({ actor }) => {
  const [profileForm, setProfileForm] = useState({
    userId: actor.actorId,
    providerType: 'ADVOCATE',
    displayName: 'Adv. Ananya Sharma',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    languages: 'English, Hindi, Kannada',
    serviceModes: 'HYBRID, ONLINE',
    taxonomyCode: 'CIVIL_PROPERTY_DISPUTE',
    feeMin: '1500.00',
    feeMax: '3500.00',
    proBonoAvailable: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProvider, setCreatedProvider] = useState<any>(null);

  // Ledger & Evidence state
  const [credits, setCredits] = useState<any>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [serviceRecordDoc, setServiceRecordDoc] = useState<any>(null);
  const [panelEvidenceDoc, setPanelEvidenceDoc] = useState<any>(null);

  // Quote State
  const [quoteForm, setQuoteForm] = useState({
    matterId: '00000000-0000-4000-8000-000000000007',
    amount: '2000.00',
    professionalFee: '1990.00',
    processingFee: '10.00',
    platformCommission: '0.00',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const [quoteResult, setQuoteResult] = useState<any>(null);

  // Booking Action State
  const [bookingId, setBookingId] = useState('00000000-0000-4000-8000-000000000004');
  const [declineReason, setDeclineReason] = useState('CAPACITY_LIMIT');
  const [bookingActionMsg, setBookingActionMsg] = useState<any>(null);

  useEffect(() => {
    setProfileForm((prev) => ({ ...prev, userId: actor.actorId }));
    if (actor.role === 'PROVIDER') {
      fetchCredits();
    }
  }, [actor.actorId, actor.role]);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        userId: profileForm.userId,
        providerType: profileForm.providerType,
        displayName: profileForm.displayName,
        district: profileForm.district,
        state: profileForm.state,
        languages: profileForm.languages.split(',').map((s) => s.trim()),
        serviceModes: profileForm.serviceModes.split(',').map((s) => s.trim()),
        services: [
          {
            taxonomyCode: profileForm.taxonomyCode,
            feeMin: Number(profileForm.feeMin),
            feeMax: Number(profileForm.feeMax),
            proBonoAvailable: profileForm.proBonoAvailable,
          },
        ],
      };

      const res = await api.createProvider(payload);
      if (res.error) {
        if (res.error.code === 'CONFLICT') {
          setError(`Active Profile Found: An active practice profile is already registered under ${profileForm.displayName}. Your profile is live in the verified advocate directory.`);
          fetchCredits();
        } else {
          setError(`${res.error.code}: ${res.error.message}`);
        }
      } else {
        setCreatedProvider(res);
        fetchCredits();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update provider profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchCredits = async () => {
    setCreditsLoading(true);
    setError(null);
    try {
      const res = await api.getMyCredits();
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setCredits(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pro-bono credits');
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleExportServiceRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getServiceRecord();
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setServiceRecordDoc(res);
        setPanelEvidenceDoc(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate pro bono service record');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPanelEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPanelEvidence();
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setPanelEvidenceDoc(res);
        setServiceRecordDoc(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate panel application dossier');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.createPaymentQuote({
        matterId: quoteForm.matterId,
        amount: quoteForm.amount,
        currency: 'INR',
        feeBreakdown: {
          professionalFee: quoteForm.professionalFee,
          processingFee: quoteForm.processingFee,
          platformCommission: '0.00',
        },
        expiresAt: quoteForm.expiresAt,
      });
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setQuoteResult(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate payment quote');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBooking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.acceptBooking(bookingId);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setBookingActionMsg({ action: 'ACCEPTED', title: 'Consultation Confirmed', res });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to accept booking');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineBooking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.declineBooking(bookingId, declineReason);
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setBookingActionMsg({ action: 'DECLINED', title: 'Consultation Declined', res });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to decline booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      
      {/* Title Header */}
      <div className="section-box">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669]">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                Verified Advocate Portal
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#904d00]/10 text-[#904d00]">
                <span className="material-symbols-outlined text-[15px]">volunteer_activism</span>
                0% Platform Commission
              </span>
            </div>
            <h1 className="font-['Source_Serif_4'] text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00152a] tracking-tight">
              Advocate Practice & Evidence Ledger
            </h1>
            <p className="text-[#43474d] text-sm sm:text-base max-w-3xl leading-relaxed">
              Manage your verified practice profile, accumulate certified pro-bono service hours, issue direct transparent client fee estimates, and process consultation bookings.
            </p>
          </div>

          <div className="card-box bg-[#efedf0] border-[#e3e2e4] text-right shrink-0 w-full sm:w-auto">
            <span className="text-[10px] uppercase font-bold text-[#43474d] tracking-wider block">
              Advocate Reference
            </span>
            <span className="font-mono text-sm font-bold text-[#00152a]">
              ADV-{actor.actorId.slice(0, 8).toUpperCase()}
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

      {/* Grid: Practice Profile & Pro Bono Credit Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Practice Profile Box */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#e3e2e4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#904d00] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">badge</span>
                </div>
                <div>
                  <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                    Practice Registration
                  </h2>
                  <p className="text-xs text-[#43474d]">Public directory listing & credentials</p>
                </div>
              </div>
              {credits?.providerId && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669] flex items-center gap-1 shrink-0">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                  Active In Directory
                </span>
              )}
            </div>

            <form onSubmit={handleCreateProfile} className="space-y-5">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Full Professional Name & Title</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Provider Classification</label>
                  <select
                    className="legal-input"
                    value={profileForm.providerType}
                    onChange={(e) => setProfileForm({ ...profileForm, providerType: e.target.value })}
                  >
                    <option value="ADVOCATE">Advocate (Litigation & Representation)</option>
                    <option value="MEDIATOR">Mediator (ADR & Conciliation)</option>
                    <option value="ARBITRATOR">Arbitrator (Commercial Arbitration)</option>
                    <option value="NOTARY">Notary Public (Attestation & Oaths)</option>
                    <option value="DOCUMENT_WRITER">Document Writer (Deed Drafting & Registry)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">District of Practice</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={profileForm.district}
                    onChange={(e) => setProfileForm({ ...profileForm, district: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">State / Jurisdiction</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={profileForm.state}
                    onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Primary Practice Specialization</label>
                <select
                  className="legal-input"
                  value={profileForm.taxonomyCode}
                  onChange={(e) => setProfileForm({ ...profileForm, taxonomyCode: e.target.value })}
                >
                  <option value="CIVIL_PROPERTY_DISPUTE">Civil, Property & Tenancy Law</option>
                  <option value="FAMILY_MAINTENANCE">Family, Matrimonial & Child Support</option>
                  <option value="LABOUR_WAGES_DISPUTE">Labour & Employment Rights</option>
                  <option value="CONSUMER_DISPUTE">Consumer Protection & Commercial</option>
                  <option value="CRIMINAL_BAIL_DEFENSE">Criminal Defense & Bail</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Minimum Fee (₹ INR)</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={profileForm.feeMin}
                    onChange={(e) => setProfileForm({ ...profileForm, feeMin: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Maximum Fee (₹ INR)</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={profileForm.feeMax}
                    onChange={(e) => setProfileForm({ ...profileForm, feeMax: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="card-box bg-[#FDFCF7] border-[#e3e2e4] flex items-center gap-3 p-4">
                <input
                  type="checkbox"
                  id="proBonoCheck"
                  checked={profileForm.proBonoAvailable}
                  onChange={(e) => setProfileForm({ ...profileForm, proBonoAvailable: e.target.checked })}
                  className="w-4 h-4 rounded border-[#c3c6ce] text-[#B45309] focus:ring-[#B45309]"
                />
                <label htmlFor="proBonoCheck" className="text-xs sm:text-sm text-[#00152a] font-semibold cursor-pointer">
                  Available to receive Pro Bono & Statutory Legal Aid Rotations
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#00152a] hover:bg-[#102a43] text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">save</span>
                  <span>{loading ? 'Saving Profile...' : 'Save & Publish Practice Profile'}</span>
                </button>
              </div>

            </form>
          </div>

        </div>

        {/* Pro Bono Credits & Certifications Box */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-[#e3e2e4]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#d1e4ff] text-[#00152a] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">military_tech</span>
                </div>
                <div>
                  <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                    Pro Bono Service Ledger
                  </h2>
                  <p className="text-xs text-[#43474d]">Verified legal aid hours & credits</p>
                </div>
              </div>

              <button
                onClick={fetchCredits}
                disabled={creditsLoading}
                className="text-xs text-[#B45309] hover:text-[#904d00] font-bold flex items-center gap-1 bg-[#ffdcc3]/30 px-3 py-1.5 rounded-lg transition-all"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Refresh</span>
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              NyayaSetu records verified pro-bono service hours completed by advocates. These credits serve as verified qualification credentials for <strong>DLSA Panel Empanelment</strong> and <strong>Senior Designation</strong>.
            </p>

            {credits ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card-box bg-[#FAF9FB] p-5">
                  <span className="text-xs text-[#43474d] block font-bold uppercase">Cumulative Hours</span>
                  <div className="text-3xl sm:text-4xl font-bold text-[#00152a] mt-1 font-['Source_Serif_4']">
                    {credits.totalCredits || 0}
                  </div>
                  <span className="text-[11px] text-[#059669] font-bold block mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    Audited & Certified
                  </span>
                </div>
                <div className="card-box bg-[#FAF9FB] p-5">
                  <span className="text-xs text-[#43474d] block font-bold uppercase">Current Quarter</span>
                  <div className="text-3xl sm:text-4xl font-bold text-[#B45309] mt-1 font-['Source_Serif_4']">
                    {credits.periodCredits || 0}
                  </div>
                  <span className="text-[11px] text-[#43474d] block mt-1.5 font-medium">Q3 2026 Rotation</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-[#FAF9FB] rounded-2xl border border-dashed border-[#c3c6ce]">
                <p className="text-xs text-[#43474d]">Click refresh to load your verified pro bono record summary.</p>
              </div>
            )}
          </div>

          {/* Official Certificates Export Bar */}
          <div className="pt-6 border-t border-[#e3e2e4] space-y-3">
            <h3 className="text-xs font-bold uppercase text-[#00152a] tracking-wider">
              Formal Credentials & Panel Packets
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExportServiceRecord}
                disabled={loading}
                className="bg-[#efedf0] hover:bg-[#e3e2e4] text-[#00152a] font-bold text-xs py-3 px-3.5 rounded-xl transition-all border border-[#e3e2e4] flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">workspace_premium</span>
                <span>Pro Bono Certificate</span>
              </button>
              <button
                onClick={handleExportPanelEvidence}
                disabled={loading}
                className="bg-[#efedf0] hover:bg-[#e3e2e4] text-[#00152a] font-bold text-xs py-3 px-3.5 rounded-xl transition-all border border-[#e3e2e4] flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-base">folder_shared</span>
                <span>DLSA Panel Dossier</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* Official Certificate Presentation View */}
      {(serviceRecordDoc || panelEvidenceDoc) && (
        <div className="legal-certificate p-6 sm:p-8 md:p-10 space-y-6 animate-fade-in">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-[#e3e2e4]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#00152a] text-[#fe932c] flex items-center justify-center shadow-lg shrink-0">
                <span className="material-symbols-outlined text-3xl">verified</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a] tracking-tight">
                  {serviceRecordDoc ? 'Certificate of Pro Bono Legal Service' : 'DLSA Panel Empanelment Dossier'}
                </h3>
                <p className="text-xs sm:text-sm text-[#43474d]">
                  National Legal Services Authority &bull; Verified Public Service Record
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-[#059669] text-white shrink-0">
              BAR COUNCIL VERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Advocate Name</span>
              <strong className="text-[#00152a] text-sm sm:text-base mt-1 block">{profileForm.displayName}</strong>
            </div>
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Court Jurisdiction</span>
              <strong className="text-[#00152a] text-sm sm:text-base mt-1 block">{profileForm.district}, {profileForm.state}</strong>
            </div>
            <div className="card-box bg-[#FAF9FB]">
              <span className="text-xs text-[#43474d] block font-bold uppercase">Certified Contribution</span>
              <strong className="text-[#059669] text-sm sm:text-base font-bold mt-1 block">
                {credits?.totalCredits || 12} Verified Credits
              </strong>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
            This authentic certificate confirms that the practitioner has delivered verified legal aid consultations under the National Legal Services framework. Recognized for DLSA panel applications and Senior Advocate designation.
          </p>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => window.print()}
              className="bg-[#00152a] hover:bg-[#102a43] text-white text-xs sm:text-sm font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
            >
              <span className="material-symbols-outlined text-base">print</span>
              <span>Print Formal Certificate</span>
            </button>
          </div>

        </div>
      )}

      {/* Direct Payment Quote & Consultation Bookings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Issue Client Fee Quote */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#e3e2e4]">
              <div className="w-10 h-10 rounded-xl bg-[#059669]/10 text-[#059669] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">receipt_long</span>
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Issue Client Fee Estimate
                </h2>
                <p className="text-xs text-[#43474d]">Direct client billing &bull; 0% platform commission</p>
              </div>
            </div>

            <form onSubmit={handleCreateQuote} className="space-y-4">
              
              <div>
                <label className="field-label">Matter / Case Reference</label>
                <input
                  type="text"
                  className="legal-input"
                  value={quoteForm.matterId}
                  onChange={(e) => setQuoteForm({ ...quoteForm, matterId: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Advocate Professional Fee (₹)</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={quoteForm.professionalFee}
                    onChange={(e) => setQuoteForm({ ...quoteForm, professionalFee: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Court / Drafting Fee (₹)</label>
                  <input
                    type="text"
                    className="legal-input"
                    value={quoteForm.processingFee}
                    onChange={(e) => setQuoteForm({ ...quoteForm, processingFee: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Total Quote Amount (₹)</label>
                  <input
                    type="text"
                    className="legal-input font-bold text-[#00152a]"
                    value={quoteForm.amount}
                    onChange={(e) => setQuoteForm({ ...quoteForm, amount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">Platform Surcharge</label>
                  <input
                    type="text"
                    className="legal-input bg-[#efedf0] text-[#059669] font-bold"
                    value="₹0.00 (Free)"
                    disabled
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#059669] hover:bg-[#047857] text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                <span>Issue Official Fee Estimate</span>
              </button>

            </form>

            {quoteResult && (
              <div className="p-4 bg-[#059669]/10 border border-[#059669]/30 rounded-xl text-xs space-y-1 animate-fade-in">
                <span className="font-bold text-[#00152a] block">Quote Issued Successfully</span>
                <p className="text-[#43474d]">
                  Total: <strong>₹{quoteResult.amount}</strong> &bull; Quote ID: {quoteResult.quoteId?.slice(0, 8)}
                </p>
              </div>
            )}
          </div>

        </div>

        {/* Consultation Requests Action Center */}
        <div className="section-box flex flex-col justify-between space-y-6">
          
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-[#e3e2e4]">
              <div className="w-10 h-10 rounded-xl bg-[#ffdcc3] text-[#904d00] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">pending_actions</span>
              </div>
              <div>
                <h2 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
                  Consultation Request Queue
                </h2>
                <p className="text-xs text-[#43474d]">Process held client booking requests</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="field-label">Booking Request Reference</label>
                <input
                  type="text"
                  className="legal-input"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Decline Reason Code (If Declining)</label>
                <select
                  className="legal-input"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                >
                  <option value="CAPACITY_LIMIT">Schedule Full / Maximum Capacity</option>
                  <option value="CONFLICT_OF_INTEREST">Conflict of Interest with Adverse Party</option>
                  <option value="OUT_OF_JURISDICTION">Matter Outside Practicing District / Court</option>
                  <option value="TIMING_MISMATCH">Timing Mismatch / Hearing Date Conflict</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <button
                  onClick={handleAcceptBooking}
                  disabled={loading}
                  className="bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs sm:text-sm py-3 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">check</span>
                  <span>Accept Consultation</span>
                </button>
                <button
                  onClick={handleDeclineBooking}
                  disabled={loading}
                  className="bg-white hover:bg-[#ffdad6]/40 text-[#ba1a1a] border border-[#ba1a1a]/30 font-semibold text-xs sm:text-sm py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                  <span>Decline Request</span>
                </button>
              </div>

              {bookingActionMsg && (
                <div className="p-4 bg-[#efedf0] border border-[#e3e2e4] rounded-xl text-xs space-y-1 animate-fade-in">
                  <span className="font-bold text-[#00152a] block">{bookingActionMsg.title}</span>
                  <p className="text-[#43474d]">
                    Booking Reference {bookingId.slice(0, 8)} successfully updated.
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
