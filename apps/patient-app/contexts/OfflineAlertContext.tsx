import React, { createContext, useContext, useState, ReactNode } from 'react';
import OfflineAlertModal from '../components/ui/OfflineAlertModal';

interface OfflineAlertContextProps {
  showOfflineAlert: (title?: string, message?: string) => void;
  hideOfflineAlert: () => void;
}

const OfflineAlertContext = createContext<OfflineAlertContextProps | undefined>(undefined);

export function OfflineAlertProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const showOfflineAlert = (customTitle?: string, customMessage?: string) => {
    setTitle(customTitle);
    setMessage(customMessage);
    setVisible(true);
  };

  const hideOfflineAlert = () => {
    setVisible(false);
  };

  return (
    <OfflineAlertContext.Provider value={{ showOfflineAlert, hideOfflineAlert }}>
      {children}
      <OfflineAlertModal
        visible={visible}
        onClose={hideOfflineAlert}
        title={title}
        message={message}
      />
    </OfflineAlertContext.Provider>
  );
}

export function useOfflineAlert() {
  const context = useContext(OfflineAlertContext);
  if (!context) {
    throw new Error('useOfflineAlert must be used within an OfflineAlertProvider');
  }
  return context;
}
