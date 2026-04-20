import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

if (import.meta.env.DEV) {
  import('eruda').then((m) => m.default.init());
}

const requiredEnvKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const missingEnv = requiredEnvKeys.filter((key) => !import.meta.env[key]);
const root = ReactDOM.createRoot(document.getElementById('root')!);

if (missingEnv.length > 0) {
  root.render(
    <React.StrictMode>
      <div style={{ fontFamily: 'sans-serif', padding: '24px', lineHeight: 1.6 }}>
        <h1>Configuration Error</h1>
        <p>Firebase environment variables are missing.</p>
        <p>Please set the following variables in your deployment environment:</p>
        <pre>{missingEnv.join('\n')}</pre>
      </div>
    </React.StrictMode>
  );
} else {
  import('./App.tsx').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}
