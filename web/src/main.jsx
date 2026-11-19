import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SupportProvider } from './components/Support.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { ConfirmProvider, ToastProvider } from './ui.jsx';
import './styles.css';

if (navigator.userAgent.includes('JirexAndroid/')) {
  document.documentElement.classList.add('android-portal');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[pwa] service worker registration failed:', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ToastProvider>
          <ConfirmProvider>
            <SupportProvider>
              <App />
            </SupportProvider>
          </ConfirmProvider>
        </ToastProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
