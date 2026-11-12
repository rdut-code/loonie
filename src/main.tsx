import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled with the app. Nothing is loaded from another site.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles.css';
import { App } from './App';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
