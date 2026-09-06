import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import {initSentry, SentryErrorBoundary} from './lib/sentry';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SentryErrorBoundary>
  </StrictMode>,
);

function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf7f1] px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-[#3a2f1f]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#8a7a5c]">
          This error has been reported. Please refresh the page to try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-lg bg-[#7a5a26] text-white text-sm font-medium"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
