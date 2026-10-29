import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { ClerkProvider } from '@clerk/clerk-react';
import { ApiProvider } from './components/ApiProvider';
import { ClerkConfigDiagnosticScreen } from './components/ClerkConfigDiagnosticScreen';
import { router } from './router';
import './index.css';

const clerkPubKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY?.trim()) || '';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);

  if (!clerkPubKey) {
    // Headless boot resilience: render informative diagnostic screen without letting Clerk crash
    root.render(
      <React.StrictMode>
        <ClerkConfigDiagnosticScreen />
      </React.StrictMode>
    );
  } else {
    root.render(
      <React.StrictMode>
        <ClerkProvider publishableKey={clerkPubKey}>
          <ApiProvider>
            <RouterProvider router={router} />
          </ApiProvider>
        </ClerkProvider>
      </React.StrictMode>
    );
  }
}
