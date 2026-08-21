import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { CitizenPortal } from './components/CitizenPortal';
import { ProviderPortal } from './components/ProviderPortal';
import { InstitutionalPortal } from './components/InstitutionalPortal';
import { PublicStatsPortal } from './components/PublicStatsPortal';
import { defaultActor, type ActorContextState } from './api/client';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('citizen');
  const [actor, setActor] = useState<ActorContextState>(defaultActor);

  const scrollToContent = () => {
    const el = document.getElementById('portal-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCF7] text-[#1b1c1e] font-['Work_Sans',sans-serif]">
      
      {/* Navigation Header */}
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        actor={actor} 
        setActor={setActor} 
      />

      {/* Hero Section */}
      <section className="relative w-full min-h-[560px] md:min-h-[660px] flex items-center pt-10 pb-20 overflow-hidden">
        
        {/* Background Image & Warm Overlays */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div 
            className="w-full h-full bg-cover bg-center"
            style={{ 
              backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuA7UwYmv9SYoRiZAgf2YNOKHeXzJXUY8OM62CcteQcm8B6cCLGhmIzEauBdOSaFLju7KKFc9CzOxIH_BT4_t4ocCzo-a6b5vcVDYuBjLAEgVaf_-bxUSFzJbvB-Q7mdNk_ohYfcS8TqMyxGwTNiTEHSgKcp7-ATqofF26I6PC7bH6Wz7UHzyyjYZF-IeZ9KNrTmR-YVruRgYHm6s4j8_wyhGewxsxBzWEMNTdf_QwTBl8YKW0XkG7uA')` 
            }}
          />
          <div className="absolute inset-0 hero-gradient" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#FDFCF7]/95 via-[#FDFCF7]/80 to-transparent" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="col-span-1 md:col-span-8 lg:col-span-7 flex flex-col gap-6">
            
            <div className="inline-flex items-center gap-2 bg-[#ffdcc3]/90 backdrop-blur-sm border border-[#ffdcc3] px-4 py-1.5 rounded-full w-fit shadow-sm">
              <span className="material-symbols-outlined text-[#904d00] text-sm">balance</span>
              <span className="text-xs font-bold text-[#904d00] tracking-wide">
                National Legal Aid Framework &bull; Section 12 Statutory Rail
              </span>
            </div>

            <h1 className="font-['Source_Serif_4'] text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-[#00152a] tracking-tight leading-[1.12]">
              Justice for All.<br />
              <span className="text-[#B45309]">Always Accessible.</span>
            </h1>

            <p className="text-base sm:text-lg text-[#43474d] max-w-xl leading-relaxed">
              Connecting every citizen to 100% free legal aid, trusted advocates and dignity, backed by transparent statutory routing.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button 
                onClick={() => {
                  setActiveTab('citizen');
                  scrollToContent();
                }}
                className="bg-[#B45309] hover:bg-[#904d00] text-white font-semibold text-sm sm:text-base px-8 py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <span>Get Legal Help</span>
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>

              <button 
                onClick={() => {
                  setActiveTab('stats');
                  scrollToContent();
                }}
                className="bg-white hover:bg-[#faf9fb] text-[#00152a] border border-[#e3e2e4] font-semibold text-sm sm:text-base px-7 py-3.5 rounded-xl transition-all shadow-sm flex items-center gap-2"
              >
                <span>Learn More</span>
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* Trust Indicators Bar */}
      <section className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 -mt-10 md:-mt-16 relative z-20 mb-16">
        <div className="bg-white rounded-2xl ambient-shadow p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-[#e3e2e4] border border-[#e3e2e4]">
          
          <div className="flex items-start gap-4 pt-4 sm:pt-0 sm:px-4 first:pt-0 first:px-0">
            <div className="bg-[#ffdcc3] text-[#904d00] p-3 rounded-xl shrink-0">
              <span className="material-symbols-outlined text-2xl">volunteer_activism</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-[#00152a]">Free Legal Aid</h3>
              <p className="text-xs text-[#43474d] leading-relaxed">100% free aid for eligible citizens (§12)</p>
            </div>
          </div>

          <div className="flex items-start gap-4 pt-4 sm:pt-0 sm:px-4">
            <div className="bg-[#d1e4ff] text-[#00152a] p-3 rounded-xl shrink-0">
              <span className="material-symbols-outlined text-2xl">verified_user</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-[#00152a]">Trusted Helpers</h3>
              <p className="text-xs text-[#43474d] leading-relaxed">Bar Council verified advocates</p>
            </div>
          </div>

          <div className="flex items-start gap-4 pt-4 sm:pt-0 sm:px-4">
            <div className="bg-[#059669]/10 text-[#059669] p-3 rounded-xl shrink-0">
              <span className="material-symbols-outlined text-2xl">lock</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-[#00152a]">Confidential & Safe</h3>
              <p className="text-xs text-[#43474d] leading-relaxed">Your case details are strictly protected</p>
            </div>
          </div>

          <div className="flex items-start gap-4 pt-4 sm:pt-0 sm:px-4">
            <div className="bg-[#7C3AED]/10 text-[#7C3AED] p-3 rounded-xl shrink-0">
              <span className="material-symbols-outlined text-2xl">diversity_3</span>
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-sm text-[#00152a]">Accessible for All</h3>
              <p className="text-xs text-[#43474d] leading-relaxed">Online, in-person and assisted aid</p>
            </div>
          </div>

        </div>
      </section>

      {/* Main Interactive Workspaces */}
      <main id="portal-section" className="flex-grow scroll-mt-24 pb-12">
        {activeTab === 'citizen' && <CitizenPortal actor={actor} />}
        {activeTab === 'provider' && <ProviderPortal actor={actor} />}
        {activeTab === 'institution' && <InstitutionalPortal actor={actor} />}
        {activeTab === 'stats' && <PublicStatsPortal />}
      </main>

      {/* Testimonial Quote Section */}
      <section className="w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 my-16">
        <div className="bg-white rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-center border border-[#e3e2e4] ambient-shadow">
          <div className="p-8 sm:p-10 md:p-14 md:col-span-7 flex flex-col gap-6">
            <span className="material-symbols-outlined text-[#B45309] text-4xl">format_quote</span>
            <p className="font-['Source_Serif_4'] text-xl sm:text-2xl text-[#00152a] italic leading-relaxed">
              "NyayaSetu helped me navigate a complex legal situation with dignity. I finally felt heard and supported by people who truly care."
            </p>
            <div className="pt-2 border-t border-[#e3e2e4]">
              <p className="font-bold text-sm sm:text-base text-[#00152a]">Anjali Sharma</p>
              <p className="text-xs text-[#43474d]">Beneficiary &bull; Legal Aid Clinic, Delhi</p>
            </div>
          </div>
          <div 
            className="md:col-span-5 h-[340px] md:h-full min-h-[340px] bg-cover bg-center"
            style={{ 
              backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuBTlHck_oxmpEJbn42r0skMAdqgjemh3XaljAwyk-gW98GORkAIaLdgVmRHzWdLMgM24H1sKRbm5YyVGCfN_LN9s0kjL0DeBds7L6C7eoq5HuEsgb0CMJ4YCvh7lbb3gTDCajv77vjDFJLfrxBIx-mVQeFAPwP1vEJLkeoybTa4OCBOp3Eq1juYled729kVVstXKvxGXqJto0JoO8OjoYz1QCRWlLLqa9HmmOIDK9ovKpxfdFqP66J7')` 
            }}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-[#00152a] text-[#ffffff] rounded-t-3xl mt-16 pt-16 pb-12">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12 pb-12 border-b border-[#ffffff]/10">
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#fe932c]">
                  <span className="material-symbols-outlined text-2xl">balance</span>
                </div>
                <span className="font-['Source_Serif_4'] text-2xl font-bold text-white tracking-tight">NyayaSetu</span>
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                National Legal Services Infrastructure ensuring deterministic integrity, accessible legal representation, and dignity for every citizen.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#fe932c]">Free Legal Aid</h4>
              <ul className="space-y-2 text-xs text-[#94a3b8]">
                <li><a href="#" className="hover:text-white transition-colors">Section 12 Statutory Criteria</a></li>
                <li><a href="#" className="hover:text-white transition-colors">District Legal Services Authorities</a></li>
                <li><a href="#" className="hover:text-white transition-colors">High Court Legal Aid Clinics</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Lok Adalat Assistance</a></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#fe932c]">Advocates & Helpers</h4>
              <ul className="space-y-2 text-xs text-[#94a3b8]">
                <li><a href="#" className="hover:text-white transition-colors">Pro Bono Service Credits</a></li>
                <li><a href="#" className="hover:text-white transition-colors">DLSA Panel Empanelment</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Bar Council Standards</a></li>
                <li><a href="#" className="hover:text-white transition-colors">0% Commission Billing</a></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#fe932c]">Helpline & Support</h4>
              <p className="text-xs text-[#94a3b8]">
                National Legal Aid Helpline (24/7 Toll-Free):
              </p>
              <div className="text-xl font-bold text-white font-mono tracking-wider">
                15100
              </div>
              <p className="text-[11px] text-[#94a3b8]">
                Available across all states in official scheduled languages.
              </p>
            </div>

          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-6 text-xs text-[#94a3b8]">
            <p>&copy; 2026 NyayaSetu &bull; National Legal Infrastructure Framework</p>
            <div className="flex flex-wrap justify-center gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Charter</a>
              <a href="#" className="hover:text-white transition-colors">Citizen Charter</a>
              <a href="#" className="hover:text-white transition-colors">Accessibility Statement</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
};

export default App;
