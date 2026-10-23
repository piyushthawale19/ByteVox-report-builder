// API Client for ByteVox Express Server

export interface User {
  id: number;
  email: string;
  created_at?: string;
}

export interface DatasetColumn {
  col_index: number;
  original_name: string;
  safe_name: string;
  detected_type: 'number' | 'date' | 'category' | 'text';
  missing_count: number;
  type_rule?: string;
}

export interface BadRow {
  row_number: number;
  reason: string;
}

export interface InvalidCell {
  row_number: number;
  col_index: number;
  raw_value: string;
  reason: string;
}

export interface DatasetSummary {
  id: number;
  name: string;
  row_count: number;
  created_at: string;
}

export interface DatasetDetail extends DatasetSummary {
  columns: DatasetColumn[];
  badRows: BadRow[];
  invalidCells: InvalidCell[];
}

export interface ReportSummary {
  id: number;
  title: string;
  dataset_id: number;
  dataset_name: string;
  created_at: string;
  updated_at: string;
}

export interface ReportBlock {
  id: number;
  block_type: 'metric' | 'chart' | 'table' | 'text';
  config_json: string;
  block_order: number;
}

export interface ReportDetail extends ReportSummary {
  filter_json: string;
  blocks: ReportBlock[];
  columns: DatasetColumn[];
}

export interface Explanation {
  plainEnglish: string;
  query: string;
  rowsIncluded: number;
  rowsExcluded: number;
  nullCount?: number;
  zeroCount?: number;
  notes?: string[];
}

export interface ComputeResult {
  value?: number;
  chartData?: Array<Record<string, any>>;
  tableData?: Array<Record<string, any>>;
  text?: string;
  explanation?: Explanation;
}

export interface ShareLink {
  id: number;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include', // Include httpOnly cookies
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = (isJson && data?.error) || res.statusText || 'Request failed';
    throw new ApiError(res.status, errorMsg);
  }

  return data as T;
}

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      request<{ user: User }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () =>
      request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      }),
    me: () =>
      request<{ user: User | null }>('/api/auth/me'),
  },

  datasets: {
    list: () =>
      request<{ datasets: DatasetSummary[] }>('/api/datasets'),
    get: (id: number | string) =>
      request<DatasetDetail>(`/api/datasets/${id}`),
    upload: (file: File, name?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (name?.trim()) formData.append('name', name.trim());
      return request<{ id: number; name: string } & Partial<DatasetDetail>>('/api/datasets', {
        method: 'POST',
        body: formData,
      });
    },
    delete: (id: number | string) =>
      request<{ message: string }>(`/api/datasets/${id}`, {
        method: 'DELETE',
      }),
  },

  reports: {
    list: () =>
      request<{ reports: ReportSummary[] }>('/api/reports'),
    create: (datasetId: number, title?: string) =>
      request<{ id: number }>('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ datasetId, title }),
      }),
    get: (id: number | string) =>
      request<ReportDetail>(`/api/reports/${id}`),
    update: (id: number | string, data: { title?: string; filter_json?: string }) =>
      request<{ message: string }>(`/api/reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number | string) =>
      request<{ message: string }>(`/api/reports/${id}`, {
        method: 'DELETE',
      }),
    addBlock: (id: number | string, block: { block_type: string; config_json: string; block_order: number }) =>
      request<{ id: number }>(`/api/reports/${id}/blocks`, {
        method: 'POST',
        body: JSON.stringify(block),
      }),
    updateBlock: (id: number | string, blockId: number, data: { config_json?: string; block_order?: number }) =>
      request<{ message: string }>(`/api/reports/${id}/blocks/${blockId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteBlock: (id: number | string, blockId: number) =>
      request<{ message: string }>(`/api/reports/${id}/blocks/${blockId}`, {
        method: 'DELETE',
      }),
    reorderBlocks: (id: number | string, blockIds: number[]) =>
      request<{ message: string }>(`/api/reports/${id}/blocks/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ blockIds }),
      }),
    compute: (id: number | string, block_type: string, config: any) =>
      request<{ result: ComputeResult }>(`/api/reports/${id}/compute`, {
        method: 'POST',
        body: JSON.stringify({ block_type, config }),
      }),
    distinct: (id: number | string, column: string) =>
      request<{ values: Array<string | number> }>(`/api/reports/${id}/distinct/${encodeURIComponent(column)}`),
  },

  share: {
    create: (reportId: number, expiresInHours?: number) =>
      request<ShareLink>('/api/share/links', {
        method: 'POST',
        body: JSON.stringify({ reportId, expiresInHours }),
      }),
    list: (reportId: number) =>
      request<{ links: ShareLink[] }>(`/api/share/links/${reportId}`),
    revoke: (linkId: number) =>
      request<{ message: string }>(`/api/share/links/${linkId}/revoke`, {
        method: 'POST',
      }),
    getPublic: (token: string) =>
      request<ReportDetail>(`/api/share/public/${encodeURIComponent(token)}`),
    computePublic: (token: string, block_type: string, config: any) =>
      request<{ result: ComputeResult }>(`/api/share/public/${encodeURIComponent(token)}/compute`, {
        method: 'POST',
        body: JSON.stringify({ block_type, config }),
      }),
  },
};
