import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { queryClient } from './platform/queryClient';
import { useTheme } from './platform/theme';
import { ConfirmProvider } from './platform/ui';
import { advertiseIphoneApp, redirectIphoneToApp } from './platform/iphoneApp';
import './index.css';

// iPhones open the mobile app (public/iphone/) instead: see platform/iphoneApp.
advertiseIphoneApp();
const leaving = redirectIphoneToApp();

/** The CSS re-themes itself (every colour is a variable); only the toasts are told. */
function Themed() {
  const scheme = useTheme((s) => s.scheme);
  return (
    <>
      <App />
      <Toaster theme={scheme} position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'Inter, system-ui, sans-serif' } }} />
    </>
  );
}

if (!leaving) ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ConfirmProvider>
          <Themed />
        </ConfirmProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
