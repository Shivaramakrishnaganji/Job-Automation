import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import './index.css';

// Configure global axios defaults for API requests
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
axios.defaults.baseURL = rawBaseUrl.endsWith('/api/v1')
  ? rawBaseUrl
  : `${rawBaseUrl.replace(/\/+$/, '')}/api/v1`;
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
