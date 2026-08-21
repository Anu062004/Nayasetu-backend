import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

export const PublicStatsPortal: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPublicStats();
      if (res.error) {
        setError(`${res.error.code}: ${res.error.message}`);
      } else {
        setStats(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch public impact metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      
      {/* Title Header */}
      <div className="section-box">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#059669]/10 text-[#059669]">
                <span className="material-symbols-outlined text-[15px]">public</span>
                National Transparency Framework
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full bg-[#B45309]/10 text-[#B45309]">
                <span className="material-symbols-outlined text-[15px]">lock</span>
                Strict Privacy Guarantees
              </span>
            </div>
            <h1 className="font-['Source_Serif_4'] text-2xl sm:text-3xl lg:text-4xl font-bold text-[#00152a] tracking-tight">
              Public Impact & Legal Aid Transparency
            </h1>
            <p className="text-[#43474d] text-sm sm:text-base max-w-3xl leading-relaxed">
              Real-time transparency on legal aid delivery across Indian districts. Commercial provider rankings, private tracking, and paid placements are strictly prohibited.
            </p>
          </div>

          <button
            onClick={loadStats}
            disabled={loading}
            className="bg-[#efedf0] hover:bg-[#e3e2e4] text-[#00152a] font-bold text-xs sm:text-sm py-3 px-5 rounded-xl transition-all border border-[#e3e2e4] flex items-center gap-2 shrink-0 shadow-sm"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            <span>{loading ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </button>
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="card-box bg-white p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-[#B45309]">
            <div className="w-9 h-9 rounded-xl bg-[#ffdcc3]/50 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">volunteer_activism</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Free Aid Provided</span>
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-['Source_Serif_4'] text-[#00152a]">
            100% Free
          </div>
          <p className="text-xs text-[#43474d] leading-relaxed">
            To all qualifying citizens under Section 12 criteria
          </p>
        </div>

        <div className="card-box bg-white p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-[#059669]">
            <div className="w-9 h-9 rounded-xl bg-[#059669]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">location_city</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Active Coverage</span>
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-['Source_Serif_4'] text-[#00152a]">
            Pan-India
          </div>
          <p className="text-xs text-[#43474d] leading-relaxed">
            Karnataka, Maharashtra, Delhi & NCR districts
          </p>
        </div>

        <div className="card-box bg-white p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-[#fe932c]">
            <div className="w-9 h-9 rounded-xl bg-[#ffdcc3]/50 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">percent</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Platform Cut</span>
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-['Source_Serif_4'] text-[#00152a]">
            0.00%
          </div>
          <p className="text-xs text-[#43474d] leading-relaxed">
            Zero middleman markups on advocate consultation fees
          </p>
        </div>

        <div className="card-box bg-white p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-[#7C3AED]">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">security</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">Privacy Protection</span>
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-['Source_Serif_4'] text-[#00152a]">
            Guaranteed
          </div>
          <p className="text-xs text-[#43474d] leading-relaxed">
            Case narratives ephemeral & never persisted in storage
          </p>
        </div>

      </div>

      {/* Public Trust Charter Section */}
      <div className="section-box space-y-6">
        <div className="pb-4 border-b border-[#e3e2e4]">
          <h3 className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a]">
            The NyayaSetu Public Trust Charter
          </h3>
          <p className="text-xs sm:text-sm text-[#43474d] mt-1">
            Fundamental design invariants ensuring equal access and impartial justice
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="card-box bg-[#FAF9FB] p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#00152a] text-[#fe932c] flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-2xl">balance</span>
            </div>
            <strong className="block text-sm sm:text-base text-[#00152a] font-bold">
              No Commercial Provider Rankings
            </strong>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              Advocate directories rotate fairly and deterministically to prevent paid placement, monopoly practices, and artificial rating manipulation.
            </p>
          </div>

          <div className="card-box bg-[#FAF9FB] p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#00152a] text-[#fe932c] flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-2xl">lock</span>
            </div>
            <strong className="block text-sm sm:text-base text-[#00152a] font-bold">
              Zero Narrative Storage
            </strong>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              Citizen case narratives and personal conversations are processed in memory solely to determine eligibility and routing, then permanently discarded.
            </p>
          </div>

          <div className="card-box bg-[#FAF9FB] p-6 space-y-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#00152a] text-[#fe932c] flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-2xl">savings</span>
            </div>
            <strong className="block text-sm sm:text-base text-[#00152a] font-bold">
              Non-Custodial Direct Settlement
            </strong>
            <p className="text-xs sm:text-sm text-[#43474d] leading-relaxed">
              All fees are settled directly between clients and advocates without platform custody, escrow deductions, or hidden transaction cuts.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};
