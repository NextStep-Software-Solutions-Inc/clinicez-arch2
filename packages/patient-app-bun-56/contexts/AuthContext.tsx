import { createContext, useContext, useState, ReactNode } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/expo';
import { waitForNextFrame } from 'utils/wait-for-next-frame';

interface AuthContextType {
  isAuthenticated: boolean;
  isLocked: boolean;
  logout: () => void;
  lock: () => void;
  unlock: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const [isLocked, setIsLocked] = useState(true);

  const logout = () => {
    signOut();
    setIsLocked(true);
  };

  const lock = () => {
    setIsLocked(true);
  };

  const unlock = () => {
    setIsLocked(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: isSignedIn ?? false,
        isLocked,
        logout,
        lock,
        unlock,
      }}
    >
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
