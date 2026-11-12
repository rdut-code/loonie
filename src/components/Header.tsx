import { APP_NAME } from '../config';

export type Screen = 'home' | 'upload' | 'review' | 'sorted' | 'settings';

interface Props {
  screen: Screen;
  go: (screen: Screen) => void;
  questionsLeft: number;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  initial: string;
  showNav: boolean;
}

/** The gold loon coin. Gold appears nowhere else in the app. */
function Coin() {
  const ink = { fill: 'var(--accent-ink)' };
  const dot = { fill: 'var(--accent)' };
  return (
    <div className="coin" aria-hidden="true" style={{ width: 42, height: 42 }}>
      <svg className="loon" viewBox="0 0 36 36" style={{ width: 34, height: 34 }}>
        <path d="M8 23c0-4 4-7 9-7 5 0 10 2 12 6-2 3-6 4.5-11 4.5S8 26 8 23z" style={ink} />
        <path d="M9.4 13.5c-1.2 3-.8 6.5 1 9h6.2c-1.8-2.500-2.200-6-1-9z" style={ink} />
        <circle cx="12.6" cy="12.2" r="4.4" style={ink} />
        <path d="M16.200 10.800l6.800 1.500-6.600 1.800z" style={ink} />
        <circle cx="13.800" cy="11.600" r="1.150" style={dot} />
        <circle cx="17.500" cy="20.800" r=".9" style={dot} />
        <circle cx="21.200" cy="20.200" r=".9" style={dot} />
        <circle cx="19.500" cy="23.200" r=".9" style={dot} />
        <circle cx="23.400" cy="22.800" r=".9" style={dot} />
        <path
          d="M6.500 29.500c1.900-1.100 3.800-1.100 5.700 0s3.800 1.100 5.700 0 3.800-1.100 5.700 0 3.800 1.100 5.700 0"
          style={{ fill: 'none', stroke: 'var(--accent-ink)', strokeWidth: 1.5, strokeLinecap: 'round' }}
        />
      </svg>
    </div>
  );
}

const TABS: [Screen, string][] = [
  ['home', 'Home'],
  ['upload', 'Upload'],
  ['review', 'Review'],
  ['sorted', 'Sorted'],
];

export function Header({ screen, go, questionsLeft, theme, toggleTheme, initial, showNav }: Props) {
  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 20px' }}>
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Coin />
        <div className="d" style={{ fontSize: 24, fontWeight: 700 }}>{APP_NAME}</div>
      </div>
      {showNav && (
        <nav className="nav" aria-label="Main">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={screen === id ? 'tab on' : 'tab'}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              {label}
              {id === 'review' && questionsLeft > 0 && (
                <span className="badge num" aria-label={`${questionsLeft} questions left`}>{questionsLeft}</span>
              )}
            </button>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="toggle" onClick={toggleTheme} aria-label="Switch between light and dark mode">
          <span className="knob">
            {theme === 'light' ? (
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
              </svg>
            ) : (
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}>
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </span>
        </button>
        {showNav && (
          <button
            className={screen === 'settings' ? 'avatar on' : 'avatar'}
            onClick={() => go('settings')}
            aria-label="Settings and privacy"
            aria-current={screen === 'settings' ? 'page' : undefined}
          >
            {initial}
          </button>
        )}
      </div>
    </header>
  );
}
