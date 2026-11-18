import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import {TooltipProvider} from '@eduthemes/ui/components/tooltip';
import reportWebVitals from './reportWebVitals';

document.documentElement.dataset.ui = "shadcn";

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider><App /></TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
