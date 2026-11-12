import { useRef, useState } from 'react';
import { AccountsEditor } from '../components/AccountsEditor';
import { Icon, ICON } from '../components/Icons';
import { APP_NAME } from '../config';
import { newId } from '../lib/actions';
import { applyRestored, unpackBackup } from '../lib/backup';
import type { Account } from '../lib/types';
import { useStore } from '../store';

const STARTER_ACCOUNTS = (): Account[] => [
  { id: newId(), name: 'Amex', kind: 'card', bank: 'amex', owner: 'you' },
  { id: newId(), name: 'Scene+ Visa 1', kind: 'card', bank: 'scotia', owner: 'you' },
  { id: newId(), name: 'Scene+ Visa 2', kind: 'card', bank: 'scotia', owner: 'partner' },
  { id: newId(), name: 'Chequing', kind: 'bank', bank: 'scotia', owner: 'shared' },
];

/** First run. Three small questions, then straight to Upload. */
export function Welcome() {
  const { update, restore: replaceAll } = useStore();
  const [you, setYou] = useState('');
  const [partner, setPartner] = useState('');
  const [accounts, setAccounts] = useState<Account[]>(STARTER_ACCOUNTS);
  const [keepRows, setKeepRows] = useState(true);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const named = accounts.filter((a) => a.name.trim());
  const ready = you.trim() !== '' && named.length > 0;

  const start = () =>
    update((d) => ({
      ...d,
      setupDone: true,
      people: { you: you.trim(), partner: partner.trim() },
      accounts: named.map((a) => ({ ...a, name: a.name.trim() })),
      keepRows,
    }));

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const restored = await unpackBackup(new Uint8Array(await file.arrayBuffer()));
      if (restored.kind === 'full') replaceAll({ ...restored.data, lastBackupOn: restored.exportedOn || null });
      else update((d) => applyRestored(d, restored));
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't read that file.");
    }
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
        <div className="label">First time here · about a minute</div>
        <h1 className="d" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700 }}>
          Hi. I'm {APP_NAME}.
        </h1>
        <p className="muted" style={{ fontSize: 17, lineHeight: 1.5, paddingTop: 8 }}>
          Drop in your statements each month and I'll sort them. Three quick things first.
        </p>
      </div>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="step">1</div>
          <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>Who's in the household?</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Your first name
            <input className="field" value={you} maxLength={24} autoComplete="off" onChange={(e) => setYou(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
            Your partner's first name (optional)
            <input className="field" value={partner} maxLength={24} autoComplete="off" onChange={(e) => setPartner(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, animationDelay: '80ms' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="step">2</div>
          <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>Which cards and accounts?</h2>
        </div>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
          Nicknames only. I never read, keep or show card or account numbers.
        </p>
        <AccountsEditor accounts={accounts} people={{ you, partner }} onChange={setAccounts} />
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, animationDelay: '160ms' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="step">3</div>
          <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>What should I remember?</h2>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button
            className="switch"
            role="switch"
            aria-checked={keepRows}
            aria-label="Keep transaction rows on this device"
            onClick={() => setKeepRows(!keepRows)}
          >
            <span />
          </button>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            <strong>Keep transaction rows on this device.</strong>{' '}
            <span className="muted">
              {keepRows
                ? 'On: you can close the tab and pick up later, and fix past months. Rows stay in this browser only.'
                : 'Off: I keep only rules and monthly totals. Rows vanish when you close the tab.'}
            </span>
          </div>
        </div>
        <div className="note good">
          <Icon path={ICON.lock} style={{ flex: 'none' }} />
          <div>
            Everything happens in this browser. Your statement files are read, then dropped. Nothing is uploaded, ever.
          </div>
        </div>
      </section>

      {error && (
        <div className="note bad" role="alert">
          <div>{error}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <button className="btn pri" disabled={!ready} onClick={start}>
          Let's go
          <Icon path={ICON.arrow} size={18} />
        </button>
        <button className="btn quiet" onClick={() => fileInput.current?.click()}>
          Restore from a backup file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".loonie,.json,application/json,application/octet-stream"
          className="sr"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void restore(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {!ready && <span className="muted" style={{ fontSize: 14 }}>Add your name and at least one account.</span>}
      </div>
    </main>
  );
}
