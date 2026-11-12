import { useRef, useState, type ReactNode } from 'react';
import { AccountsEditor } from '../components/AccountsEditor';
import { categoryIcon, Icon, ICON } from '../components/Icons';
import { APP_NAME } from '../config';
import { addCategory, assignMerchant, deleteRule, removeAccount, removeCategory, renameCategory } from '../lib/actions';
import { applyRestored, packBackup, unpackBackup, type Restored } from '../lib/backup';
import { daysBetween, shortDate } from '../lib/money';
import { makeBackup } from '../lib/storage';
import { OTHER } from '../lib/types';
import { useStore } from '../store';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sizeOf(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
}

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** A card that folds down to its title and a one-line summary. */
function Section(props: { title: string; summary: string; defaultOpen?: boolean; delay?: number; children: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', animationDelay: `${props.delay ?? 0}ms` }}>
      <button className={open ? 'sechead open' : 'sechead'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>{props.title}</h2>
          <div className="muted num" style={{ fontSize: 14, paddingTop: 2 }}>{props.summary}</div>
        </div>
        <span className="chev" style={{ display: 'flex' }}><Icon path={ICON.chevron} size={20} /></span>
      </button>
      <div className={open ? 'fold' : 'fold shut'}>
        <div className="in" inert={!open}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 18 }}>{props.children}</div>
        </div>
      </div>
    </section>
  );
}

/** Privacy and backup, what the app has learned, categories, accounts and names. */
export function Settings() {
  const { data, update, restore, wipe, saved } = useStore();
  const [message, setMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Restored | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [search, setSearch] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const [newGroup, setNewGroup] = useState<'everyday' | 'fixed'>('everyday');
  const [removing, setRemoving] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const ruleEntries = Object.entries(data.rules).sort((a, b) => a[1].merchant.localeCompare(b[1].merchant));
  const ruleCount = ruleEntries.length;
  const query = search.trim().toLowerCase();
  const months = Object.keys(data.monthTotals).length;
  const editable = data.categories.filter((c) => c.group !== 'system');

  const exportEverything = async () => {
    try {
      const bytes = await packBackup(data, today());
      download(`loonie-backup-${today()}.loonie`, bytes as BlobPart, 'application/octet-stream');
      update((d) => ({ ...d, lastBackupOn: today() }));
      setMessage({
        tone: 'good',
        text: `Backup saved to your downloads: ${sizeOf(bytes.length)} holding ${data.txns.length} lines, ${months} ${months === 1 ? 'month' : 'months'}, ${ruleCount} rules and all your settings.`,
      });
    } catch {
      setMessage({ tone: 'bad', text: "I couldn't make the backup file. Nothing was changed." });
    }
  };

  const exportRulesOnly = () => {
    download(`loonie-rules-${today()}.json`, JSON.stringify(makeBackup(data, today()), null, 2), 'application/json');
    setMessage({ tone: 'good', text: 'Rules and settings saved to your downloads. This file has no transactions in it.' });
  };

  const chooseBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const restored = await unpackBackup(new Uint8Array(await file.arrayBuffer()));
      if (restored.kind === 'rules') {
        update((d) => applyRestored(d, restored));
        setMessage({ tone: 'good', text: `Rules restored: ${Object.keys(restored.backup.rules).length} merchants are back. Your transactions were left as they are.` });
      } else if (data.txns.length === 0 && months === 0) {
        restore({ ...restored.data, lastBackupOn: restored.exportedOn || null });
        setMessage({ tone: 'good', text: `Everything is back: ${restored.lines} lines across ${restored.months} ${restored.months === 1 ? 'month' : 'months'}.` });
      } else {
        // There is data here already, so ask before replacing it.
        setPendingRestore(restored);
        setMessage(null);
      }
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : "I couldn't read that file." });
    }
  };

  const confirmRestore = () => {
    if (pendingRestore?.kind !== 'full') return;
    restore({ ...pendingRestore.data, lastBackupOn: pendingRestore.exportedOn || null });
    setMessage({ tone: 'good', text: `Everything is back: ${pendingRestore.lines} lines across ${pendingRestore.months} ${pendingRestore.months === 1 ? 'month' : 'months'}.` });
    setPendingRestore(null);
  };

  const sinceBackup = data.lastBackupOn ? daysBetween(data.lastBackupOn, today()) : null;
  const backupNote =
    sinceBackup === null
      ? data.txns.length > 0
        ? "You haven't made a backup yet. If the browser's data is cleared, everything here goes with it."
        : 'No backup yet.'
      : sinceBackup <= 0
        ? 'Last backup: today.'
        : `Last backup: ${shortDate(data.lastBackupOn!)}${sinceBackup > 30 ? `, ${sinceBackup} days ago. Worth making a fresh one.` : '.'}`;

  const hint = { fontSize: 15, lineHeight: 1.5 } as const;

  const ruleRow = ([key, rule]: (typeof ruleEntries)[number]) => (
    <div key={key} className="line">
      <div style={{ flex: '1 1 160px', minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>{rule.merchant}</div>
      <label style={{ flex: '0 1 200px', minWidth: 150 }}>
        <span className="sr">Category for {rule.merchant}</span>
        <select className="field sm" value={rule.categoryId} onChange={(e) => update((d) => assignMerchant(d, key, e.target.value, true))}>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <button className="btn sm quiet" onClick={() => update((d) => deleteRule(d, key))} aria-label={`Forget the rule for ${rule.merchant}`}>
        Forget
      </button>
    </div>
  );

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
        <div className="label">Settings · stays on this device</div>
        <h1 className="d" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700 }}>
          Your data, your call.
        </h1>
      </div>

      {!saved && (
        <div className="note bad" role="alert">
          <div>
            <strong>I couldn't save to this browser.</strong> Storage may be full or blocked (private windows do this).
            Export a backup now so nothing is lost.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>Privacy and backup</h2>
            <div className="note good">
              <Icon path={ICON.lock} style={{ flex: 'none' }} />
              <div>
                {APP_NAME} has no server. Statements are read in this browser and dropped. I keep cleaned-up merchant
                names, amounts, dates and categories only, never card or account numbers.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={hint}>
                <strong>One small file holds everything.</strong>{' '}
                <span className="muted">
                  Every line, category, rule, account and setting. If the browser's data is ever cleared, restore the
                  file and the app is exactly as you left it.
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button className="btn ink" onClick={() => void exportEverything()}>Export everything</button>
                <button className="btn" onClick={() => fileInput.current?.click()}>Restore from a backup</button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".loonie,.json,application/json,application/octet-stream"
                  className="sr"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    void chooseBackup(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="muted num" style={{ fontSize: 14, lineHeight: 1.5 }}>
                {backupNote} The file contains your transactions and is not locked, so keep it somewhere only you can
                reach.
              </div>
            </div>

            {pendingRestore?.kind === 'full' && (
              <div className="note warm" role="alertdialog" aria-label="Replace everything on this device?" style={{ flexDirection: 'column' }}>
                <div>
                  <strong>Replace what's on this device?</strong> The backup from{' '}
                  {pendingRestore.exportedOn ? shortDate(pendingRestore.exportedOn) : 'an unknown date'} has{' '}
                  {pendingRestore.lines} lines across {pendingRestore.months} months. This device has {data.txns.length}{' '}
                  lines across {months}. Restoring swaps one for the other.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button className="btn pri sm" onClick={confirmRestore}>Yes, restore the backup</button>
                  <button className="btn sm quiet" style={{ color: 'var(--text)' }} onClick={() => setPendingRestore(null)}>Keep what's here</button>
                </div>
              </div>
            )}

            {message && (
              <div className={`note ${message.tone}`} role="status">
                <div>{message.text}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <button
                className="switch"
                role="switch"
                aria-checked={data.keepRows}
                aria-label="Keep transaction rows on this device"
                onClick={() => update((d) => ({ ...d, keepRows: !d.keepRows }))}
              >
                <span />
              </button>
              <div style={hint}>
                <strong>Keep transaction rows on this device.</strong>{' '}
                <span className="muted">
                  {data.keepRows
                    ? 'On: you can close the tab and pick up later, fix past months, and I can spot repeats across statements.'
                    : 'Off: only rules and monthly totals are kept. Rows vanish when this tab closes, and stored rows were just removed.'}
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {confirmWipe ? (
                <>
                  <span style={{ ...hint, flex: '1 1 240px' }}>
                    <strong>Delete everything on this device?</strong> Rules, totals, rows, accounts and names. Without
                    a backup file this can't be undone.
                  </span>
                  <button className="btn danger" onClick={wipe}>Yes, wipe it all</button>
                  <button className="btn quiet" onClick={() => setConfirmWipe(false)}>Keep it</button>
                </>
              ) : (
                <>
                  <button className="btn danger" onClick={() => setConfirmWipe(true)}>Wipe everything</button>
                  <button className="btn quiet" onClick={exportRulesOnly} title="A readable file with rules and settings but no transactions">
                    Export rules only
                  </button>
                </>
              )}
            </div>
          </section>

          <Section
            title="What I've learned"
            summary={ruleCount === 0 ? 'Nothing yet' : `${ruleCount} ${ruleCount === 1 ? 'merchant' : 'merchants'} remembered`}
            delay={80}
          >
            {ruleCount === 0 ? (
              <div className="muted" style={hint}>
                Each time you answer a question with "Remember" ticked, the merchant shows up here.
              </div>
            ) : (
              <>
                <label>
                  <span className="sr">Find a merchant</span>
                  <input className="field sm" placeholder="Find a merchant" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                {query ? (
                  <div>
                    {ruleEntries.filter(([, r]) => r.merchant.toLowerCase().includes(query)).map(ruleRow)}
                    {!ruleEntries.some(([, r]) => r.merchant.toLowerCase().includes(query)) && (
                      <div className="muted" style={hint}>No merchant matches "{search.trim()}".</div>
                    )}
                  </div>
                ) : (
                  <div>
                    {data.categories.map((c) => {
                      const mine = ruleEntries.filter(([, r]) => r.categoryId === c.id);
                      if (mine.length === 0) return null;
                      const isOpen = openGroup === c.id;
                      return (
                        <div key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                          <button className="rowbtn" aria-expanded={isOpen} onClick={() => setOpenGroup(isOpen ? null : c.id)}>
                            <div className="tile"><Icon path={categoryIcon(c.id)} /></div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                              <div className="muted" style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {mine.slice(0, 3).map(([, r]) => r.merchant).join(', ')}
                                {mine.length > 3 ? ` and ${mine.length - 3} more` : ''}
                              </div>
                            </div>
                            <span className="st plain num">{mine.length}</span>
                            <span className="chev" style={{ display: 'flex' }}><Icon path={ICON.chevron} size={18} /></span>
                          </button>
                          <div className={isOpen ? 'fold' : 'fold shut'}>
                            <div className="in" inert={!isOpen}>
                              <div style={{ paddingBottom: 10 }}>{isOpen && mine.map(ruleRow)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Change a category and past lines from that merchant move with it.
                </div>
              </>
            )}
          </Section>
        </div>

        <aside style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Section
            title="Accounts"
            summary={data.accounts.length === 0 ? 'None yet' : data.accounts.map((a) => a.name).join(', ')}
            delay={120}
          >
            <div className="muted" style={hint}>Nicknames only. Removing an account also removes its uploaded lines.</div>
            <AccountsEditor
              compact
              accounts={data.accounts}
              people={data.people}
              onChange={(accounts) => update((d) => ({ ...d, accounts }))}
              onRemove={(id) => update((d) => removeAccount(d, id))}
            />
          </Section>

          <Section title="Categories" summary={`${editable.length} categories`} delay={180}>
            <div>
              {editable.map((c) => (
                <div key={c.id} className="line" style={{ flexWrap: 'nowrap' }}>
                  <label style={{ flex: 1, minWidth: 0 }}>
                    <span className="sr">Name of category {c.name}</span>
                    <input
                      className="field sm"
                      value={c.name}
                      maxLength={32}
                      onChange={(e) => update((d) => ({ ...d, categories: d.categories.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }))}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) update((d) => renameCategory(d, c.id, 'Unnamed'));
                      }}
                    />
                  </label>
                  <span className="st plain">{c.group === 'fixed' ? 'Fixed' : 'Everyday'}</span>
                  {c.id !== OTHER &&
                    (removing === c.id ? (
                      <button className="btn sm danger" onClick={() => { update((d) => removeCategory(d, c.id)); setRemoving(null); }}>
                        Move to Other
                      </button>
                    ) : (
                      <button className="btn sm quiet" style={{ width: 44, padding: 0 }} aria-label={`Remove category ${c.name}`} onClick={() => setRemoving(c.id)}>
                        <Icon path={ICON.close} size={16} />
                      </button>
                    ))}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <label style={{ flex: '1 1 150px' }}>
                <span className="sr">New category name</span>
                <input className="field sm" placeholder="New category" value={newCat} maxLength={32} onChange={(e) => setNewCat(e.target.value)} />
              </label>
              <label style={{ flex: '0 1 130px' }}>
                <span className="sr">Kind of category</span>
                <select className="field sm" value={newGroup} onChange={(e) => setNewGroup(e.target.value as 'everyday' | 'fixed')}>
                  <option value="everyday">Everyday</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <button
                className="btn sm"
                disabled={!newCat.trim()}
                onClick={() => {
                  update((d) => addCategory(d, newCat, newGroup));
                  setNewCat('');
                }}
              >
                Add
              </button>
            </div>
          </Section>

          <Section
            title="Household"
            summary={[data.people.you, data.people.partner].filter(Boolean).join(' and ') || 'Names not set'}
            delay={240}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Your first name
              <input className="field sm" value={data.people.you} maxLength={24} onChange={(e) => update((d) => ({ ...d, people: { ...d.people, you: e.target.value } }))} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 }}>
              Your partner's first name
              <input className="field sm" value={data.people.partner} maxLength={24} onChange={(e) => update((d) => ({ ...d, people: { ...d.people, partner: e.target.value } }))} />
            </label>
          </Section>
        </aside>
      </div>
    </main>
  );
}
