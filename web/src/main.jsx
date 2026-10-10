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

/**
 * The phone keyboard, as CSS variables for the bottom sheets (ui/Modal):
 * `--kb-inset` is how much of the page it covers and `--vv-h` the height left
 * showing. iOS Safari never shrinks the page for the keyboard: it shrinks only
 * the visual viewport and lays the keyboard over the page. Android Chrome
 * resizes the page itself (interactive-widget in index.html), so the inset
 * reads 0 there and nothing is counted twice.
 */
function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    // A pinch-zoomed page is not the keyboard, and a smaller gap is Safari's own bars.
    // What it covers is that gap less Safari's pan up to the field, which can
    // be most of it when the field sits low on the page.
    const zoomed = Math.abs(vv.scale - 1) > 0.01;
    const shorter = root.clientHeight - vv.height;
    root.style.setProperty('--kb-inset', `${!zoomed && shorter >= 80 ? Math.max(0, Math.round(shorter - vv.offsetTop)) : 0}px`);
    root.style.setProperty('--vv-h', `${Math.round(zoomed ? root.clientHeight : vv.height)}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  update();
}
if (!leaving) trackKeyboard();

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
