import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ZupaProvider } from '@zupa/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ZupaProvider url={`ws://${window.location.host}/zupa/ws`}>
            <App />
        </ZupaProvider>
    </React.StrictMode>
);
