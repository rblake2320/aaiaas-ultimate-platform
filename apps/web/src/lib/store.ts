import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setOrganization: (organization: Organization | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      organization: null,
      isAuthenticated: false,
      setUser: (user) =>
        set({ user, isAuthenticated: user !== null }),
      setOrganization: (organization) => set({ organization }),
      logout: () =>
        set({ user: null, organization: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
