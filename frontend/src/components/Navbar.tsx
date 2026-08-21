import React, { useState, useEffect } from 'react';
import { type Role, type ActorContextState, ROLE_ACTORS, api } from '../api/client';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  actor: ActorContextState;
  setActor: (actor: ActorContextState) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, actor, setActor }) => {
  const [health, setHealth] = useState<{ status: string; uptimeSeconds?: number } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const checkHealth = async () => {
    try {
      const data = await api.fetchHealthReady();
      setHealth(data);
    } catch {
      setHealth({ status: 'unreachable' });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleRoleChange = (role: Role) => {
    const updated = ROLE_ACTORS[role] || { ...actor, role };
    setActor(updated);
    api.setActor(updated);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setMobileMenuOpen(false);

    let targetRole: Role = 'CITIZEN';
    if (tabId === 'provider') targetRole = 'PROVIDER';
    else if (tabId === 'institution') targetRole = 'INSTITUTION';
    else if (tabId === 'citizen' || tabId === 'stats') targetRole = 'CITIZEN';

    const updated = ROLE_ACTORS[targetRole];
    setActor(updated);
    api.setActor(updated);

    // Smooth scroll to the active workspace
    const el = document.getElementById('portal-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const tabs = [
    { id: 'citizen', label: 'For Citizens', icon: 'person_outline' },
    { id: 'provider', label: 'For Helpers & Advocates', icon: 'gavel' },
    { id: 'institution', label: 'Authorities & DLSA', icon: 'account_balance' },
    { id: 'stats', label: 'Public Impact', icon: 'insights' },
  ];

  return (
    <header className="w-full bg-[#FDFCF7]/95 backdrop-blur-md sticky top-0 z-50 border-b border-[#e3e2e4] transition-all">
      <div className="flex justify-between items-center w-full px-4 sm:px-6 lg:px-8 py-3 max-w-[1280px] mx-auto min-h-[72px] gap-4">
        
        {/* Brand */}
        <div 
          className="flex items-center gap-3 cursor-pointer group shrink-0" 
          onClick={() => handleTabChange('citizen')}
        >
          <div className="w-10 h-10 rounded-xl bg-[#00152a] flex items-center justify-center text-[#fe932c] shadow-sm group-hover:bg-[#102a43] transition-colors shrink-0">
            <span className="material-symbols-outlined fill-icon text-2xl">balance</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-['Source_Serif_4'] text-xl sm:text-2xl font-bold text-[#00152a] tracking-tight truncate">
                NyayaSetu
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#ffdcc3] text-[#904d00] whitespace-nowrap">
                National Rail
              </span>
            </div>
            <p className="text-[11px] text-[#43474d] hidden md:block truncate">
              Justice for All &bull; Always Accessible
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-[#efedf0]/80 p-1.5 rounded-xl border border-[#e3e2e4]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#00152a] shadow-sm border border-[#e3e2e4]'
                    : 'text-[#43474d] hover:text-[#00152a] hover:bg-white/50'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#B45309]' : 'text-[#43474d]'}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Persona Selector & Action Button */}
        <div className="flex items-center gap-3 shrink-0">
          
          {/* Persona Switcher */}
          <div className="hidden sm:flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#e3e2e4] shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-[#904d00]">badge</span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase font-bold text-[#43474d] tracking-wider leading-tight">
                Role Context
              </span>
              <select
                value={actor.role}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="bg-transparent border-none text-xs font-bold text-[#00152a] p-0 pr-4 cursor-pointer focus:ring-0 outline-none truncate max-w-[140px]"
              >
                <option value="CITIZEN">Citizen (Seeking Aid)</option>
                <option value="PROVIDER">Advocate (Helper)</option>
                <option value="OPERATOR">Nyaya Mitra (Volunteer)</option>
                <option value="INSTITUTION">DLSA Official (Authority)</option>
                <option value="ADMIN">System Administrator</option>
              </select>
            </div>
          </div>

          {/* Quick Action Button */}
          <button
            onClick={() => handleTabChange('citizen')}
            className="bg-[#B45309] hover:bg-[#904d00] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
            <span>Get Legal Aid</span>
          </button>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden text-[#00152a] p-2 rounded-xl border border-[#e3e2e4] bg-white hover:bg-[#efedf0]"
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#FDFCF7] border-b border-[#e3e2e4] px-4 py-4 space-y-3 animate-fade-in shadow-lg">
          <div className="space-y-1.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                    isActive
                      ? 'bg-white text-[#00152a] border border-[#B45309] shadow-sm'
                      : 'text-[#43474d] hover:bg-[#efedf0]'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-[#B45309]' : 'text-[#43474d]'}`}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#e3e2e4]">
            <label className="block text-[10px] uppercase font-bold text-[#43474d] mb-1.5">
              Active Persona
            </label>
            <select
              value={actor.role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              className="w-full bg-white border border-[#e3e2e4] rounded-xl text-xs font-bold text-[#00152a] p-2.5"
            >
              <option value="CITIZEN">Citizen (Seeking Aid)</option>
              <option value="PROVIDER">Advocate (Helper)</option>
              <option value="OPERATOR">Nyaya Mitra (Volunteer)</option>
              <option value="INSTITUTION">DLSA Official (Authority)</option>
              <option value="ADMIN">System Administrator</option>
            </select>
          </div>
        </div>
      )}
    </header>
  );
};
