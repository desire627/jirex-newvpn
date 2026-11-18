import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { SupportProvider } from './components/Support.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { ConfirmProvider, ToastProvider } from './ui.jsx';
import './styles.css';

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
