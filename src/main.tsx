import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './i18n';
import './index.css';
import { initAnalytics } from './lib/analytics';

// 在 React 掛載前先初始化 PostHog，避免首次 pageview 漏掉
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
