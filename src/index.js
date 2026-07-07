import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LeadDashboard from './LeadDashboard';
import './index.css';

const Page = window.location.pathname.startsWith('/leads') ? LeadDashboard : App;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><Page /></React.StrictMode>);
