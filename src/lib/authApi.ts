export type AuthUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  verified: boolean;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};

export type CurrentUserProfile = AuthUser & {
  status: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  userProfile: {
    firstName: string | null;
    lastName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
};

export type SkuMetrics = {
  sku: string;
  product: Record<string, unknown> | null;
  stock: Record<string, unknown>[];
  channels: Record<string, unknown>[];
  salesMetrics: Record<string, unknown>[];
};

export type SkuFilterParams = {
  q?: string;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  channel?: 'ALL' | 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';
};

export type PaginatedSkus = {
  items: SkuMetrics[];
  nextCursor: string | null;
  total: number;
};

export type ImportResult = Record<string, unknown>;

export type DashboardMetrics = {
  salesVelocity: { channel: string; fba: number; mfn: number }[];
  stockDistribution: { name: string; value: number; fill: string }[];
  revenueTrend: { month: string; revenue: number }[];
};

export type DashboardPeriod = '7D' | '30D' | '90D' | '365D';

export type SyncResult = {
  status: 'COMPLETED' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  syncedAt: string;
  durationMs: number;
};

export type InventoryAlertItem = {
  sku: string;
  title: string;
  type: 'DEAD_STOCK' | 'AGED_STOCK' | 'CRITICAL_LOW' | 'OUT_OF_STOCK';
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
};

export type TokenRefresh = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type PasswordResetGrant = {
  resetToken: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/v1';

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  let body: any = null;
  if (isJson) {
    body = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => null);
    if (!response.ok) {
      if (text && text.includes('Cannot GET')) {
        throw new Error('API endpoint not found or backend is offline. Check your connection.');
      }
      throw new Error(`Server returned non-JSON error: ${response.status} ${response.statusText}`);
    }
  }

  if (!response.ok) {
    let message = 'Request failed';
    if (body && typeof body === 'object' && 'message' in body) {
      message = String(body.message);
      if (message.includes('Cannot GET')) {
        message = 'API endpoint not found. Backend may be offline or syncing.';
      }
    }
    throw new Error(message);
  }

  return body as ApiEnvelope<T>;
}


const PERIOD_MULTIPLIERS: Record<string, number> = {
  '7D':   0.23,  // ~7/30 of monthly
  '30D':  1.0,
  '90D':  3.1,
  '365D': 13.2,
};

const BASE_VELOCITY = [
  { channel: 'Amazon US', fba: 1450, mfn: 350 },
  { channel: 'Amazon CA', fba: 520,  mfn: 85  },
  { channel: 'eBay',      fba: 0,    mfn: 890  },
  { channel: 'Dandu',     fba: 0,    mfn: 410  },
];

const BASE_CHANNEL_PERF = [
  { channel: 'Amazon US',        fulfillment: 'FBA', units: 1450, revenue: 28955, growth: 12.4, stockCover: 18 },
  { channel: 'Amazon CA',        fulfillment: 'FBA', units: 520,  revenue: 12948, growth: 8.1,  stockCover: 23 },
  { channel: 'eBay US',          fulfillment: 'MFN', units: 890,  revenue: 16465, growth: -2.3, stockCover: 42 },
  { channel: 'DistinctAndUnique',fulfillment: 'MFN', units: 410,  revenue: 6150,  growth: 5.7,  stockCover: 61 },
];

function buildDashboardMetrics(period: string): DashboardMetrics {
  const m = PERIOD_MULTIPLIERS[period] ?? 1.0;
  return {
    salesVelocity: BASE_VELOCITY.map(v => ({
      channel: v.channel,
      fba: Math.round(v.fba * m),
      mfn: Math.round(v.mfn * m),
    })),
    stockDistribution: [
      { name: 'US FBA',     value: 8500,  fill: '#047857' },
      { name: 'CA FBA',     value: 2400,  fill: '#34d399' },
      { name: 'US MFN Main',value: 14200, fill: '#0f172a' },
      { name: 'UK FBA',     value: 950,   fill: '#64748b' },
    ],
    revenueTrend: [
      { month: 'Jan', revenue: 42000 },
      { month: 'Feb', revenue: 48500 },
      { month: 'Mar', revenue: 51200 },
      { month: 'Apr', revenue: 64000 },
      { month: 'May', revenue: 68500 },
      { month: 'Jun', revenue: 75200 },
    ],
  };
}

export const CHANNEL_PERFORMANCE_BASE = BASE_CHANNEL_PERF;

const generateMockSkus = (): SkuMetrics[] => {
  const prefixes = ['REBAR', 'STEEL', 'ALUM', 'BRASS', 'COPPER'];
  const types = ['CTR', 'SIDE', 'FLAT', 'ROUD'];
  const sizes = ['8MM', '10MM', '12MM', '16MM', '20MM'];
  
  const catalog: SkuMetrics[] = [];
  
  for (let i = 0; i < 45; i++) {
    const prefix = prefixes[i % prefixes.length];
    const type = types[(i * 3) % types.length];
    const size = sizes[(i * 7) % sizes.length];
    const sku = `${prefix}-${type}-${size}-${Math.floor(Math.random() * 900) + 100}`;
    
    // Random stock to hit different status buckets
    const rand = Math.random();
    let fbaStock = 0;
    let mfnStock = 0;
    if (rand > 0.8) {
      // Out of stock
    } else if (rand > 0.6) {
      // Low stock
      fbaStock = Math.floor(Math.random() * 10);
      mfnStock = Math.floor(Math.random() * 20);
    } else {
      // Healthy stock
      fbaStock = Math.floor(Math.random() * 500) + 50;
      mfnStock = Math.floor(Math.random() * 1500) + 100;
    }

    const hasAmazon = Math.random() > 0.2;
    const hasEbay = Math.random() > 0.4;
    
    const channels = [];
    if (hasAmazon) {
      channels.push({ channel: 'AMAZON', country: 'US', asin: `B0${Math.floor(Math.random() * 10000000)}`, price: (Math.random() * 30 + 10).toFixed(2), currency: 'USD' });
    }
    if (hasEbay) {
      channels.push({ channel: 'EBAY', country: 'US', asin: `EBY-${Math.floor(Math.random() * 1000000)}`, price: (Math.random() * 30 + 10).toFixed(2), currency: 'USD' });
    }
    channels.push({ channel: 'DANDU', country: 'US', asin: `DDU-${sku}`, price: (Math.random() * 30 + 5).toFixed(2), currency: 'USD' });

    catalog.push({
      sku,
      product: {
        title: `Heavy Duty ${size} ${prefix} ${type} Cut`,
        brand: 'BuildTech',
        status: 'ACTIVE',
        cost: (Math.random() * 5 + 1).toFixed(2),
        currency: 'USD',
        weight: (Math.random() * 5 + 0.5).toFixed(2),
        length: '24.00',
        width: '0.50',
        height: '0.50',
        imageUrl: `https://images.unsplash.com/photo-${1518709268805 + i}?w=500&q=80`, // Just dummy urls to simulate varied images
      },
      stock: [
        { country: 'US', locationType: 'FBA', available: fbaStock, warehouse: 'US-FBA-1' },
        { country: 'US', locationType: 'MFN', available: mfnStock, warehouse: 'US-MAIN' },
      ],
      channels,
      salesMetrics: [
        { channel: 'AMAZON', country: 'US', unitsSold: fbaStock > 0 ? Math.floor(Math.random() * 100) : 0, periodStart: '2023-01-01', periodEnd: '2023-01-30' },
        { channel: 'EBAY', country: 'US', unitsSold: mfnStock > 0 ? Math.floor(Math.random() * 50) : 0, periodStart: '2023-01-01', periodEnd: '2023-01-30' }
      ],
    });
  }
  return catalog;
};

const MOCK_CATALOG = generateMockSkus();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockRequest<T>(data: T, delayMs = 600): Promise<ApiEnvelope<T>> {
  await delay(delayMs);
  return { success: true, message: 'Success', data };
}

export const authApi = {
  // --- REAL AUTHENTICATION APIS ---
  login(payload: { email: string; password: string }) {
    return request<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  register(payload: { username: string; email: string; password: string }) {
    return request<unknown>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyOtp(payload: { email: string; code: string; purpose?: 'registration' | 'password_reset' }) {
    return request<AuthSession | PasswordResetGrant>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resendOtp(payload: { email: string; purpose?: 'registration' | 'password_reset' }) {
    return request<unknown>('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  forgotPassword(payload: { email: string }) {
    return request<unknown>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  changePassword(payload: { currentPassword?: string; resetToken?: string; newPassword: string }, accessToken?: string) {
    return request<AuthSession>('/auth/change-password', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify(payload),
    });
  },

  refreshToken(refreshToken: string) {
    return request<TokenRefresh>('/auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  logout(refreshToken: string, accessToken: string) {
    return request<unknown>('/auth/logout', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({ refreshToken }),
    });
  },

  logoutAll(accessToken: string) {
    return request<unknown>('/auth/logout-all', {
      method: 'POST',
      token: accessToken,
    });
  },

  me(accessToken: string) {
    return request<CurrentUserProfile>('/auth/me', {
      token: accessToken,
    });
  },

  updateProfile(accessToken: string, payload: UpdateProfilePayload) {
    return request<CurrentUserProfile['userProfile']>('/auth/profile', {
      method: 'PATCH',
      token: accessToken,
      body: JSON.stringify(payload),
    });
  },

  googleInit(redirectUrl?: string) {
    const search = redirectUrl ? `?redirectUrl=${encodeURIComponent(redirectUrl)}` : '';
    return request<{ url: string; state: string; message: string }>(`/auth/google${search}`);
  },

  searchSku(accessToken: string, sku: string) {
    return request<SkuMetrics>(`/sku-dashboard/search?sku=${encodeURIComponent(sku)}`, {
      token: accessToken,
    });
  },

  browseSkus(accessToken: string, filters: SkuFilterParams, cursor?: string, limit = 10) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.stockStatus) params.set('stockStatus', filters.stockStatus);
    if (filters.channel) params.set('channel', filters.channel);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));

    return request<PaginatedSkus>(`/sku-dashboard/browse?${params.toString()}`, {
      token: accessToken,
    });
  },

  importSkuReport(accessToken: string, payload: { fileName: string; content: string }) {
    return request<ImportResult>('/sku-dashboard/import', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify(payload),
    });
  },

  getDashboardMetrics(accessToken: string, period: string = '30D') {
    return request<DashboardMetrics>(`/sku-dashboard/dashboard?period=${encodeURIComponent(period)}`, {
      token: accessToken,
    });
  },

  triggerLinnworksSync(accessToken: string) {
    return request<SyncResult>('/sku-dashboard/sync/linnworks', {
      method: 'POST',
      token: accessToken,
      body: JSON.stringify({ queued: false }),
    });
  },

  getInventoryAlerts(accessToken: string) {
    return request<InventoryAlertItem[]>('/sku-dashboard/alerts', {
      token: accessToken,
    });
  },
};
