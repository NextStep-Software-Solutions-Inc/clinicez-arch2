// create AuthContext provider and hook for patient app

import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isLocked: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  lock: () => Promise<void>;
  unlock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLocked, setIsLocked] = useState(true)

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

  const login = async () => {
    setIsAuthenticated(true);
    await waitForNextFrame();
  };
  const logout = async () => {
    setIsAuthenticated(false);
    await waitForNextFrame();
  };
  const lock = async () => {
    setIsLocked(true);
    await waitForNextFrame();
  };
  const unlock = async () => {
    setIsLocked(false);
    await waitForNextFrame();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, isLocked, lock, unlock }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
