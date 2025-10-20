import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const AI_API_URL = process.env.NEXT_PUBLIC_AI_API_URL || 'http://localhost:5000';

class ApiClient {
  private client: AxiosInstance;
  private aiClient: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.aiClient = axios.create({
      baseURL: AI_API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      const token = this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.aiClient.interceptors.request.use((config) => {
      const token = this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Try to refresh token
          const refreshed = await this.refreshToken();
          if (refreshed && error.config) {
            return this.client.request(error.config);
          }
          // Redirect to login
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  }

  private setTokens(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  private clearTokens() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) return false;

      const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
        refreshToken,
      });

      this.setTokens(response.data.accessToken, refreshToken);
      return true;
    } catch (error) {
      this.clearTokens();
      return false;
    }
  }

  // Auth endpoints
  async register(data: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }) {
    const response = await this.client.post('/api/v1/auth/register', data);
    this.setTokens(response.data.accessToken, response.data.refreshToken);
    return response.data;
  }

  async login(data: { email: string; password: string }) {
    const response = await this.client.post('/api/v1/auth/login', data);
    this.setTokens(response.data.accessToken, response.data.refreshToken);
    return response.data;
  }

  async logout() {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      await this.client.post('/api/v1/auth/logout', { refreshToken });
    }
    this.clearTokens();
  }

  async getCurrentUser() {
    const response = await this.client.get('/api/v1/auth/me');
    return response.data;
  }

  // AI endpoints
  async chatCompletion(data: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
  }) {
    const response = await this.aiClient.post('/api/v1/chat', data);
    return response.data;
  }

  async textCompletion(data: {
    prompt: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }) {
    const response = await this.aiClient.post('/api/v1/completions', data);
    return response.data;
  }

  async createEmbeddings(data: { input: string | string[]; model?: string }) {
    const response = await this.aiClient.post('/api/v1/embeddings', data);
    return response.data;
  }

  // Health checks
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }

  async aiHealthCheck() {
    const response = await this.aiClient.get('/health');
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
