import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import '@whiteboard/styles/index.css';
import './features/reader/styles/index.css';
import './features/study/styles/study.css';
import './features/study/styles/workspace-controls.css';
import './features/study/styles/workspace-panels.css';
import './features/study/styles/chat.css';
import './features/study/styles/settings.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
