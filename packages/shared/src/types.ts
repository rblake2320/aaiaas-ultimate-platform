/**
 * Shared TypeScript types and interfaces
 */

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  id: string;
  name: string;
  organizationId: string;
  isActive: boolean;
  expiresAt?: Date;
  createdAt: Date;
}

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrganizationMember {
  userId: string;
  organizationId: string;
  role: Role;
  createdAt: Date;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
