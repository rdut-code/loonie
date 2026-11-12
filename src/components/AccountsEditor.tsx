import { useState } from 'react';
import { newId } from '../lib/actions';
import type { Account, AppData } from '../lib/types';
import { Icon, ICON } from './Icons';

interface Props {
  accounts: Account[];
  people: AppData['people'];
  onChange: (accounts: Account[]) => void;
  /** Called instead of onChange when an account that may hold data is removed. */
  onRemove?: (id: string) => void;
  /** One short row per account, with the editor opened on demand. Used in Settings. */
  compact?: boolean;
}

const BANK_LABEL: Record<string, string> = {
  'amex:card': 'Amex card',
  'scotia:card': 'Scotiabank card',
  'scotia:bank': 'Scotiabank chequing',
  'other:card': 'Other card',
  'other:bank': 'Other bank account',
};

/** Add, rename and tag accounts. Names are nicknames only, never card numbers. */
export function AccountsEditor({ accounts, people, onChange, onRemove, compact = false }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const ownerName = (o: Account['owner']) => (o === 'you' ? people.you || 'You' : o === 'partner' ? people.partner || 'Partner' : 'Shared');
  const patch = (id: string, change: Partial<Account>) =>
    onChange(accounts.map((a) => (a.id === id ? { ...a, ...change } : a)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {accounts.map((a, i) => {
        const isOpen = !compact || editing === a.id;
        const summary = compact && (
          <button className="rowbtn" style={{ padding: '6px 0' }} aria-expanded={isOpen} onClick={() => { setEditing(isOpen ? null : a.id); setConfirming(null); }}>
            <div className="tile"><Icon path={a.kind === 'bank' ? ICON.bank : ICON.card} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{a.name || 'New account'}</div>
              <div className="muted" style={{ fontSize: 14 }}>{BANK_LABEL[`${a.bank}:${a.kind}`]} · {ownerName(a.owner)}</div>
            </div>
            <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>{isOpen ? 'Done' : 'Edit'}</span>
            <span className="chev" style={{ display: 'flex', transform: isOpen ? 'rotate(180deg)' : 'none' }}><Icon path={ICON.chevron} size={18} /></span>
          </button>
        );
        const editor = (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 8, padding: compact ? '6px 0 14px' : '0 0 14px' }}>
          <label>
            <span className="sr">Nickname for account {i + 1}</span>
            <input
              className="field sm"
              value={a.name}
              maxLength={30}
              placeholder="Nickname"
              // At most two digits in a row, so "Visa 2" works but a card number cannot be typed in.
              onChange={(e) => patch(a.id, { name: e.target.value.replace(/(\d{2})\d+/g, '$1') })}
            />
          </label>
          <label>
            <span className="sr">Bank for {a.name}</span>
            <select
              className="field sm"
              value={`${a.bank}:${a.kind}`}
              onChange={(e) => {
                const [bank, kind] = e.target.value.split(':') as [Account['bank'], Account['kind']];
                patch(a.id, { bank, kind });
              }}
            >
              <option value="amex:card">Amex card</option>
              <option value="scotia:card">Scotiabank card</option>
              <option value="scotia:bank">Scotiabank chequing</option>
              <option value="other:card">Other card</option>
              <option value="other:bank">Other bank account</option>
            </select>
          </label>
          <label>
            <span className="sr">Owner of {a.name}</span>
            <select className="field sm" value={a.owner} onChange={(e) => patch(a.id, { owner: e.target.value as Account['owner'] })}>
              <option value="you">{people.you || 'You'}</option>
              <option value="partner">{people.partner || 'Partner'}</option>
              <option value="shared">Shared</option>
            </select>
          </label>
          {confirming === a.id ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn sm danger"
                style={{ flex: 1 }}
                onClick={() => {
                  setConfirming(null);
                  if (onRemove) onRemove(a.id);
                  else onChange(accounts.filter((x) => x.id !== a.id));
                }}
              >
                Yes, remove
              </button>
              <button className="btn sm quiet" onClick={() => setConfirming(null)}>Keep</button>
            </div>
          ) : (
            <button className="btn sm quiet" style={{ justifySelf: 'start' }} onClick={() => setConfirming(a.id)}>
              Remove
            </button>
          )}
        </div>
        );
        return (
          <div key={a.id} style={{ borderBottom: '1px solid var(--line)' }}>
            {summary}
            {compact ? (
              <div className={isOpen ? 'fold' : 'fold shut'}>
                <div className="in" inert={!isOpen}>{editor}</div>
              </div>
            ) : (
              editor
            )}
          </div>
        );
      })}
      <button
        className="btn sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          const id = newId();
          onChange([...accounts, { id, name: '', kind: 'card', bank: 'other', owner: 'shared' }]);
          setEditing(id);
        }}
      >
        Add an account
      </button>
    </div>
  );
}
