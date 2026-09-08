import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';

interface User {
  id: number;
  name: string;
  email: string;
  userType: string;
  partnerType?: 'oem' | 'reseller' | null;
  companyTypes?: string[] | null;
  profileSubmitted?: boolean;
  photoUrl?: string | null;
}

interface PartnerRegisterPayload {
  name: string;
  email: string;
  partnerType: 'oem' | 'reseller';
  companyTypes: string[];
  password: string;
  confirmPassword: string;
  captchaToken: string;
  captchaAnswer: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<User>;
  registerPartner: (payload: PartnerRegisterPayload) => Promise<{ message: string }>;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('adminUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('adminToken'));

  // Refreshes the stored user from the server — e.g. profileSubmitted flips
  // to true right after the Setup Profile wizard submits (see
  // SetupProfilePage.tsx), and getDefaultRoute() needs that fresh value
  // immediately to send them to their real portal instead of looping back
  // to the wizard on a stale cached user.
  const refreshUser = async () => {
    try {
      const r = await api.get('/auth/me');
      setUser((prev) => {
        const merged = { ...prev, ...r.data };
        localStorage.setItem('adminUser', JSON.stringify(merged));
        return merged;
      });
      return r.data;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!token) return;
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = res.data;

    if (newUser.userType !== 'partner') {
      throw new Error('Access denied. Partner accounts only.');
    }

    localStorage.setItem('adminToken', newToken);
    localStorage.setItem('adminUser', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  };

  // Public OEM/Reseller partner registration (from the pricing section's
  // "Get Started" -> /login -> Register). The backend doesn't return a
  // token here — PartnerRegisterPage.tsx follows this with its own login()
  // call using the same credentials, so the new partner lands straight in
  // Setup Profile instead of being bounced back to a login screen.
  const registerPartner = async (payload: PartnerRegisterPayload) => {
    const res = await api.post('/auth/register-partner', payload);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, registerPartner, refreshUser, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
