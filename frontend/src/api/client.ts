export type Role = 'CITIZEN' | 'PROVIDER' | 'OPERATOR' | 'INSTITUTION' | 'ADMIN';

export interface ActorContextState {
  actorId: string;
  role: Role;
  scopes: string[];
  onBehalfOfCitizenId?: string;
  delegationId?: string;
  token?: string;
}

export const ROLE_ACTORS: Record<Role, ActorContextState> = {
  CITIZEN: {
    actorId: '00000000-0000-4000-8000-000000000001',
    role: 'CITIZEN',
    scopes: [],
  },
  PROVIDER: {
    actorId: '00000000-0000-4000-8000-000000000002',
    role: 'PROVIDER',
    scopes: [],
  },
  OPERATOR: {
    actorId: '00000000-0000-4000-8000-000000000003',
    role: 'OPERATOR',
    scopes: [],
  },
  INSTITUTION: {
    actorId: '00000000-0000-4000-8000-000000000004',
    role: 'INSTITUTION',
    scopes: [],
  },
  ADMIN: {
    actorId: '00000000-0000-4000-8000-000000000005',
    role: 'ADMIN',
    scopes: ['credentials:revalidate', 'rosters:allocate'],
  },
};

export const defaultActor: ActorContextState = ROLE_ACTORS.CITIZEN;

export class ApiClient {
  private actor: ActorContextState;
  private baseUrl: string;

  constructor(actor: ActorContextState = defaultActor, baseUrl: string = '') {
    this.actor = actor;
    this.baseUrl = baseUrl;
  }

  setActor(actor: ActorContextState) {
    this.actor = actor;
  }

  getActor(): ActorContextState {
    return this.actor;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.actor.token) {
      headers['Authorization'] = `Bearer ${this.actor.token}`;
      headers['x-actor-role'] = this.actor.role;
    } else {
      headers['x-actor-id'] = this.actor.actorId;
      headers['x-actor-role'] = this.actor.role;
      if (this.actor.scopes.length > 0) {
        headers['x-actor-scopes'] = this.actor.scopes.join(',');
      }
      if (this.actor.onBehalfOfCitizenId && this.actor.delegationId) {
        headers['x-on-behalf-of-citizen-id'] = this.actor.onBehalfOfCitizenId;
        headers['x-delegation-id'] = this.actor.delegationId;
      }
    }

    return headers;
  }

  async fetchHealthLive() {
    const res = await fetch(`${this.baseUrl}/health/live`);
    return res.json();
  }

  async fetchHealthReady() {
    const res = await fetch(`${this.baseUrl}/health/ready`);
    return res.json();
  }

  // --- Identity & Provider ---
  async createProvider(data: {
    userId: string;
    providerType: string;
    displayName: string;
    district: string;
    state: string;
    languages: string[];
    serviceModes: string[];
    services: Array<{
      taxonomyCode: string;
      feeMin: number;
      feeMax: number;
      proBonoAvailable?: boolean;
    }>;
  }) {
    const res = await fetch(`${this.baseUrl}/v1/providers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getProviderStatus(id: string) {
    const res = await fetch(`${this.baseUrl}/v1/providers/${id}/status`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  // --- Intake & Allocation ---
  async createNeedRequest(data: {
    citizenUserId: string;
    taxonomyCode?: string;
    narrative?: string;
    district: string;
    language: string;
    modePreference: string;
    feeCeiling?: number;
    urgency: string;
    channel: string;
    selfDeclaredSection12Category?: string;
  }) {
    const res = await fetch(`${this.baseUrl}/v1/needs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getReferral(needId: string) {
    const res = await fetch(`${this.baseUrl}/v1/needs/${needId}/referral`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async getDirectory(needId: string, providerType: string, minimumTier: string) {
    const params = new URLSearchParams({ providerType, minimumTier });
    const res = await fetch(`${this.baseUrl}/v1/needs/${needId}/directory?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async selectProvider(needId: string, providerId: string) {
    const res = await fetch(`${this.baseUrl}/v1/needs/${needId}/select`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ providerId }),
    });
    return res.json();
  }

  async rotateRoster(needId: string, rosterId: string) {
    const res = await fetch(`${this.baseUrl}/v1/needs/${needId}/rotate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ rosterId }),
    });
    return res.json();
  }

  // --- Scheduling & Bookings ---
  async getProviderSlots(providerId: string) {
    const res = await fetch(`${this.baseUrl}/v1/providers/${providerId}/slots`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async acceptBooking(bookingId: string) {
    const res = await fetch(`${this.baseUrl}/v1/bookings/${bookingId}/accept`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });
    return res.json();
  }

  async declineBooking(bookingId: string, reasonCode: string) {
    const res = await fetch(`${this.baseUrl}/v1/bookings/${bookingId}/decline`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reasonCode }),
    });
    return res.json();
  }

  async cancelBooking(bookingId: string, reasonCode: string) {
    const res = await fetch(`${this.baseUrl}/v1/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reasonCode }),
    });
    return res.json();
  }

  async getMatterStatus(matterId: string) {
    const res = await fetch(`${this.baseUrl}/v1/matters/${matterId}/status`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  // --- Ledger, Redemptions & Payments ---
  async getMyCredits() {
    const res = await fetch(`${this.baseUrl}/v1/me/credits`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async requestRedemption(kind: string) {
    const res = await fetch(`${this.baseUrl}/v1/me/redemptions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ kind }),
    });
    return res.json();
  }

  async getServiceRecord() {
    const res = await fetch(`${this.baseUrl}/v1/me/service-record`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async getPanelEvidence() {
    const res = await fetch(`${this.baseUrl}/v1/me/panel-evidence`, {
      headers: this.getHeaders(),
    });
    return res.json();
  }

  async createPaymentQuote(data: {
    matterId: string;
    amount: string;
    currency: string;
    feeBreakdown: {
      professionalFee: string;
      processingFee: string;
      platformCommission: string;
    };
    expiresAt: string;
  }) {
    const res = await fetch(`${this.baseUrl}/v1/payments/quotes`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  // --- Grievance & Public Stats ---
  async submitGrievance(data: {
    subjectProviderId: string;
    category: string;
  }) {
    const res = await fetch(`${this.baseUrl}/v1/grievances`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getInstitutionalProviderRecord(providerId: string, consentRef: string) {
    const headers = this.getHeaders() as Record<string, string>;
    headers['x-consent-ref'] = consentRef;
    const res = await fetch(`${this.baseUrl}/v1/institutional/providers/${providerId}/record`, {
      headers,
    });
    return res.json();
  }

  async getPublicStats() {
    const res = await fetch(`${this.baseUrl}/v1/public/stats`);
    return res.json();
  }
}

export const api = new ApiClient();
