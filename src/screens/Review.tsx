import { useState } from 'react';
import { Confetti, Icon, ICON } from '../components/Icons';
import type { Screen } from '../components/Header';
import { assignMerchant, assignOne, monthsWithData, reviewQueue } from '../lib/actions';
import { formatCents, monthName, shortDate } from '../lib/money';
import type { AppData } from '../lib/types';
import { useStore } from '../store';

/** One step that "Undo last" can take back. */
export type UndoStep = { type: 'answer'; before: AppData } | { type: 'skip'; id: string };

interface Props {
  go: (screen: Screen) => void;
  skipped: string[];
  setSkipped: (keys: string[]) => void;
  undoLog: UndoStep[];
  setUndoLog: (log: UndoStep[]) => void;
}

/** The flag queue: one merchant at a time, one tap to answer. */
export function Review({ go, skipped, setSkipped, undoLog, setUndoLog }: Props) {
  const { data, update, restore } = useStore();
  const [remember, setRemember] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const queue = reviewQueue(data);
  const active = queue.filter((q) => !skipped.includes(q.id));
  const answered = undoLog.filter((s) => s.type === 'answer').length;
  const total = answered + queue.length;
  const q = active[0];

  const answer = (categoryId: string) => {
    if (!q) return;
    setUndoLog([...undoLog, { type: 'answer', before: data }]);
    update((d) => (q.single ? assignOne(d, q.latest.id, categoryId) : assignMerchant(d, q.key, categoryId, remember)));
    setShowAll(false);
    setRemember(true);
  };

  const skip = () => {
    if (!q) return;
    setUndoLog([...undoLog, { type: 'skip', id: q.id }]);
    setSkipped([...skipped, q.id]);
    setShowAll(false);
  };

  const undo = () => {
    const last = undoLog[undoLog.length - 1];
    if (!last) return;
    if (last.type === 'answer') restore(last.before);
    else setSkipped(skipped.filter((k) => k !== last.id));
    setUndoLog(undoLog.slice(0, -1));
  };

  const wrap = { width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 } as const;
  const doneCard = { width: '100%', maxWidth: 640, padding: 'clamp(32px, 6vw, 56px)', borderRadius: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' } as const;

  if (!q) {
    const nothingYet = data.txns.length === 0;
    const onlySkipped = queue.length > 0;
    const month = monthsWithData(data)[0];
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 12 }}>
        <section className="card" style={doneCard}>
          {!nothingYet && !onlySkipped && (
            <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', animation: 'pop .6s cubic-bezier(.3,1.6,.5,1) both' }}>
              <Confetti />
              <Icon path={ICON.check} size={40} style={{ strokeWidth: 2.4 }} />
            </div>
          )}
          <h1 className="d" style={{ fontSize: 'clamp(36px, 6vw, 52px)', fontWeight: 700, lineHeight: 1 }}>
            {nothingYet ? 'Nothing to sort yet.' : onlySkipped ? 'Easy ones done.' : 'All sorted.'}
          </h1>
          <div className="muted" style={{ fontSize: 17, lineHeight: 1.5, maxWidth: 380 }}>
            {nothingYet
              ? "Drop in a statement and I'll bring you the lines I'm not sure about."
              : onlySkipped
                ? `${queue.length} ${queue.length === 1 ? 'question is' : 'questions are'} waiting from when you skipped. No rush.`
                : `That's ${month ? monthName(month).split(' ')[0] : 'the month'} done. Nothing else needs you.`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            {nothingYet ? (
              <button className="btn pri" onClick={() => go('upload')}>Go to Upload</button>
            ) : (
              <>
                {onlySkipped && (
                  <button className="btn pri" onClick={() => setSkipped([])}>Go through skipped</button>
                )}
                <button className={onlySkipped ? 'btn' : 'btn pri'} onClick={() => go('home')}>
                  See how the month landed
                </button>
                {undoLog.length > 0 && <button className="btn quiet" onClick={undo}>Undo last</button>}
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  const account = data.accounts.find((a) => a.id === q.latest.accountId);
  const left = queue.length;
  const options = showAll
    ? data.categories.filter((c) => c.id !== 'income')
    : q.suggestions;

  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, paddingTop: 12 }}>
      <div style={wrap}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <h1 className="label" style={{ animation: 'none' }}>Step 2 of 3 · quick questions</h1>
            <div className="num" style={{ fontSize: 15, fontWeight: 600 }} aria-live="polite">
              {left} of {total} left
            </div>
          </div>
          <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Questions answered">
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--accent)', width: `${total ? Math.round((answered / total) * 100) : 0}%`, transition: 'width .5s cubic-bezier(.3,1.4,.5,1)' }} />
          </div>
        </div>

        <section key={q.id} className="card swA" style={{ padding: 'clamp(24px, 5vw, 40px)', borderRadius: 36, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="muted num" style={{ fontSize: 15 }}>
              {shortDate(q.latest.date)} · {account?.name ?? 'Account'}
            </div>
            <div className="d" style={{ fontSize: 'clamp(26px, 4.5vw, 36px)', fontWeight: 600, lineHeight: 1.05, overflowWrap: 'anywhere' }}>
              {q.merchant}
            </div>
            <div className="d num" style={{ fontSize: 'clamp(56px, 11vw, 88px)', fontWeight: 700, lineHeight: 0.95 }}>
              {formatCents(Math.abs(q.latest.cents))}
            </div>
            {q.latest.cents < 0 && <div className="muted" style={{ fontSize: 15 }}>This one is a refund or credit.</div>}
            {q.count > 1 && (
              <div className="muted num" style={{ fontSize: 15, lineHeight: 1.5 }}>
                {q.count} lines from here, {formatCents(q.totalCents)} in total. One answer sorts them all.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>What was this?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
              {options.map((c) => (
                <button key={c.id} className="pick" onClick={() => answer(c.id)}>
                  {c.name}
                  <Icon path={ICON.arrow} size={18} />
                </button>
              ))}
            </div>
            {!showAll && (
              <button className="btn quiet" style={{ alignSelf: 'flex-start', padding: '0 14px' }} onClick={() => setShowAll(true)}>
                Something else
              </button>
            )}
          </div>

          {q.single ? (
            <div className="muted" style={{ fontSize: 15, lineHeight: 1.5, minHeight: 44, display: 'flex', alignItems: 'center' }}>
              These differ each time, so I'll ask about each one.
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, fontSize: 15, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
              />
              Remember this for {q.merchant}
            </label>
          )}
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button className="btn quiet" onClick={undo} disabled={undoLog.length === 0}>Undo last</button>
          <button className="btn" onClick={skip}>Skip for later</button>
        </div>
      </div>
    </main>
  );
}
