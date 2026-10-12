import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/components.css';
import './styles/chart.css';
import './styles/screens.css';
import './styles/pages.css';
import './styles/windows.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { recordError, showFatal, watchGlobalErrors } from './lib/errors';

watchGlobalErrors();

const container = document.getElementById('root')!;
createRoot(container, {
  onUncaughtError(error, info) {
    recordError('root', error, info.componentStack);
    window.setTimeout(() => showFatal(container, error instanceof Error ? error.message : String(error)), 0);
  },
}).render(
  <StrictMode>
    <ErrorBoundary area="app" full>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
