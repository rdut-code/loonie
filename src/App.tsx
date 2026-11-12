import { useEffect, useRef, useState } from 'react';
import { Header, type Screen } from './components/Header';
import { reviewQueue } from './lib/actions';
import { Home } from './screens/Home';
import { Review, type UndoStep } from './screens/Review';
import { Settings } from './screens/Settings';
import { Sorted } from './screens/Sorted';
import { Upload } from './screens/Upload';
import { Welcome } from './screens/Welcome';
import { useStore } from './store';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const { data, update } = useStore();
  // Open on the summary when there is something to summarise, otherwise on Upload.
  const [screen, setScreen] = useState<Screen>(() => (Object.keys(data.monthTotals).length > 0 ? 'home' : 'upload'));
  // Review's session state lives here so it survives switching tabs.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [undoLog, setUndoLog] = useState<UndoStep[]>([]);
  // Before setup nothing is stored, so the theme choice is held here.
  const [earlyTheme, setEarlyTheme] = useState<'light' | 'dark' | null>(null);

  const theme = data.theme ?? earlyTheme ?? systemTheme();
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setEarlyTheme(next);
    update((d) => ({ ...d, theme: next }));
  };

  useEffect(() => {
    document.body.style.background = theme === 'dark' ? '#121419' : '#F2F3F5';
  }, [theme]);

  // Hover effects are paused while the page is moving, so scrolling stays smooth.
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      shell.current?.classList.add('scrolling');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => shell.current?.classList.remove('scrolling'), 120);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, []);

  // Ask the browser not to clear this app's storage on its own when disk space runs low.
  useEffect(() => {
    if (data.setupDone) void navigator.storage?.persist?.().catch(() => false);
  }, [data.setupDone]);

  // After a wipe, go back to the start with a clean slate.
  useEffect(() => {
    if (!data.setupDone) {
      setScreen('upload');
      setSkipped([]);
      setUndoLog([]);
    } else if (Object.keys(data.monthTotals).length > 0) {
      // Setup just finished with data already there: a backup was restored. Show it.
      setScreen('home');
    }
    // Only the moment setup starts or finishes matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.setupDone]);

  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
  };

  const questionsLeft = data.setupDone ? reviewQueue(data).length : 0;

  return (
    <div ref={shell} className="app" data-theme={theme} style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px clamp(16px, 4vw, 32px) 64px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Header
          screen={screen}
          go={go}
          questionsLeft={questionsLeft}
          theme={theme}
          toggleTheme={toggleTheme}
          initial={(data.people.you.trim()[0] ?? '?').toUpperCase()}
          showNav={data.setupDone}
        />
        {!data.setupDone ? (
          <Welcome />
        ) : screen === 'home' ? (
          <Home go={go} />
        ) : screen === 'upload' ? (
          <Upload go={go} />
        ) : screen === 'review' ? (
          <Review go={go} skipped={skipped} setSkipped={setSkipped} undoLog={undoLog} setUndoLog={setUndoLog} />
        ) : screen === 'sorted' ? (
          <Sorted go={go} />
        ) : (
          <Settings />
        )}
      </div>
    </div>
  );
}
