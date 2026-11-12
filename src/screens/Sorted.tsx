import { useState } from 'react';
import { categoryIcon, Icon, ICON } from '../components/Icons';
import type { Screen } from '../components/Header';
import { assignMerchant, assignOne, monthsWithData, spendingTotal } from '../lib/actions';
import { formatCents, formatDollars, monthName, shortDate } from '../lib/money';
import { isGenericKey } from '../lib/normalize';
import { INCOME, NOT_SPENDING, type Category, type Txn } from '../lib/types';
import { useStore } from '../store';

const GROUPS: { id: Category['group']; title: string }[] = [
  { id: 'fixed', title: 'Fixed costs' },
  { id: 'everyday', title: 'Everyday spending' },
  { id: 'system', title: 'Not counted as spending' },
];

/** Stage 1's results page: where every line landed, with a way to fix any of them. */
export function Sorted({ go }: { go: (screen: Screen) => void }) {
  const { data, update } = useStore();
  const months = monthsWithData(data);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [fix, setFix] = useState<{ txn: Txn; categoryId: string } | null>(null);

  const month = picked && months.includes(picked) ? picked : months[0];

  if (!month) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
        <section className="card" style={{ width: '100%', maxWidth: 640, padding: 'clamp(32px, 6vw, 56px)', borderRadius: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
          <h1 className="d" style={{ fontSize: 'clamp(36px, 6vw, 52px)', fontWeight: 700, lineHeight: 1 }}>Nothing here yet.</h1>
          <div className="muted" style={{ fontSize: 17, lineHeight: 1.5, maxWidth: 380 }}>
            Once you drop in a statement, this is where you'll see how I sorted it.
          </div>
          <button className="btn pri" onClick={() => go('upload')}>Go to Upload</button>
        </section>
      </main>
    );
  }

  const rows = data.txns.filter((t) => t.date.startsWith(month));
  const hasRows = rows.length > 0;
  const totals = data.monthTotals[month] ?? {};
  const waiting = rows.filter((t) => t.status === 'unknown');
  const waitingCents = waiting.reduce((sum, t) => sum + t.cents, 0);
  const guesses = rows.filter((t) => t.status === 'guess').length;
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Account';
  const spent = spendingTotal(totals);
  const notCounted = rows.filter((t) => t.categoryId === NOT_SPENDING).length;

  const applyFix = (all: boolean) => {
    if (!fix) return;
    const { txn, categoryId } = fix;
    update((d) => {
      const one = assignOne(d, txn.id, categoryId);
      return all ? assignMerchant(one, txn.key, categoryId, true) : one;
    });
    setFix(null);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
        <div className="label">
          Step 3 of 3 · {monthName(month)}
          {hasRows ? ` · ${rows.length} lines` : ''}
        </div>
        <h1 className="d" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700 }}>
          Here's how it landed.
        </h1>
      </div>

      {months.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Pick a month">
          {months.map((m) => (
            <button
              key={m}
              className={m === month ? 'chip on' : 'chip'}
              aria-pressed={m === month}
              onClick={() => {
                setPicked(m);
                setOpen(null);
                setFix(null);
              }}
            >
              {monthName(m)}
            </button>
          ))}
        </div>
      )}

      <section className="hero" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--hero-muted)' }}>Spent in {monthName(month).split(' ')[0]}</div>
          <div className="d num big" style={{ fontSize: 'clamp(64px, 12vw, 128px)', lineHeight: 0.9, fontWeight: 700 }}>
            {formatDollars(spent)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.5, color: 'var(--hero-muted)', maxWidth: 360 }}>
          {notCounted > 0 && (
            <div className="num">{notCounted} card {notCounted === 1 ? 'payment or transfer' : 'payments and transfers'}, not counted.</div>
          )}
          {(totals[INCOME] ?? 0) !== 0 && <div className="num">{formatDollars(Math.abs(totals[INCOME]))} came in.</div>}
          {guesses > 0 && <div className="num">{guesses} {guesses === 1 ? 'line is my guess' : 'lines are my guesses'}. Fix any that look off.</div>}
        </div>
      </section>

      {waiting.length > 0 && (
        <section className="card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          <div style={{ fontSize: 17, lineHeight: 1.5 }}>
            <strong className="num">{waiting.length} {waiting.length === 1 ? 'line' : 'lines'}</strong> ({formatDollars(waitingCents)}) still{' '}
            {waiting.length === 1 ? 'needs' : 'need'} an answer, so {waiting.length === 1 ? "it isn't" : "they aren't"} in the totals yet.
          </div>
          <button className="btn pri" onClick={() => go('review')}>
            Answer them
            <Icon path={ICON.arrow} size={18} />
          </button>
        </section>
      )}

      {!hasRows && (
        <div className="note warm">
          <div>
            Totals only for this month. The rows weren't kept on this device, so to see or fix single lines, drop the
            statements in again.
          </div>
        </div>
      )}

      {GROUPS.map((group) => {
        const cats = data.categories
          .filter((c) => c.group === group.id)
          .map((c) => ({ c, lines: rows.filter((t) => t.categoryId === c.id), total: totals[c.id] ?? 0 }))
          .filter((x) => x.lines.length > 0 || x.total !== 0);
        if (cats.length === 0) return null;
        const groupTotal = cats.reduce((sum, x) => sum + x.total, 0);
        return (
          <section key={group.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 8 }}>
              <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>{group.title}</h2>
              {group.id !== 'system' && <div className="d num" style={{ fontSize: 22, fontWeight: 600 }}>{formatDollars(groupTotal)}</div>}
            </div>
            {cats.map(({ c, lines, total }) => {
              const isOpen = open === c.id && hasRows;
              return (
                <div key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <button
                    className="rowbtn"
                    aria-expanded={hasRows ? isOpen : undefined}
                    disabled={!hasRows}
                    onClick={() => {
                      setOpen(isOpen ? null : c.id);
                      setFix(null);
                    }}
                  >
                    <div className="tile"><Icon path={categoryIcon(c.id)} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                      {hasRows && <div className="muted num" style={{ fontSize: 14 }}>{lines.length} {lines.length === 1 ? 'line' : 'lines'}</div>}
                    </div>
                    {/* Transfers go both ways, so a net figure would mislead. The line count is enough. */}
                    {c.id !== NOT_SPENDING && <div className="num" style={{ fontWeight: 600, fontSize: 17 }}>{formatDollars(Math.abs(total))}</div>}
                    {hasRows && <Icon path={ICON.chevron} size={18} style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }} />}
                  </button>
                  {isOpen && (
                    <div style={{ paddingBottom: 8 }}>
                      {[...lines].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                        <div key={t.id}>
                          <div className="line">
                            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: 15, overflowWrap: 'anywhere' }}>{t.merchant}</div>
                              <div className="muted num" style={{ fontSize: 13 }}>{shortDate(t.date)} · {accountName(t.accountId)}</div>
                            </div>
                            {t.status === 'guess' && !isGenericKey(t.key) && (
                              <button
                                className="st close"
                                style={{ border: 0, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600, minHeight: 28 }}
                                title="Tap to confirm and remember this merchant"
                                onClick={() => update((d) => assignMerchant(d, t.key, c.id, true))}
                              >
                                My guess. Right?
                              </button>
                            )}
                            <div className="num" style={{ fontWeight: 600, fontSize: 15, minWidth: 84, textAlign: 'right' }}>
                              {t.cents < 0 && c.group !== 'system' ? 'Refund ' : ''}
                              {c.id === NOT_SPENDING ? (t.cents < 0 ? 'In ' : 'Out ') : ''}
                              {formatCents(Math.abs(t.cents))}
                            </div>
                            <label style={{ flex: '0 1 210px', minWidth: 150 }}>
                              <span className="sr">Category for {t.merchant}</span>
                              <select
                                className="field sm"
                                value={fix?.txn.id === t.id ? fix.categoryId : c.id}
                                onChange={(e) => setFix(e.target.value === c.id ? null : { txn: t, categoryId: e.target.value })}
                              >
                                {data.categories.map((opt) => (
                                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {fix?.txn.id === t.id && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '4px 0 14px' }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}>Move to {data.categories.find((x) => x.id === fix.categoryId)?.name}:</span>
                              <button className="btn sm" onClick={() => applyFix(false)}>Just this one</button>
                              {!isGenericKey(t.key) && (
                                <button className="btn sm pri" onClick={() => applyFix(true)}>All from {t.merchant}, and remember</button>
                              )}
                              <button className="btn sm quiet" onClick={() => setFix(null)}>Never mind</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
