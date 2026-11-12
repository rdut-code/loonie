import { useEffect, useState } from 'react';
import { categoryIcon, Confetti, Icon, ICON } from '../components/Icons';
import type { Screen } from '../components/Header';
import { monthsWithData, reviewQueue } from '../lib/actions';
import { checksFor, dismissCheck, type CheckKind } from '../lib/checks';
import { formatDollars, monthName } from '../lib/money';
import { monthSummary, trendOf, type PersonFilter } from '../lib/summary';
import { useStore } from '../store';

/** True on phone-sized screens, where long lists are folded to their top few rows. */
function useNarrow(): boolean {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

const FOLDED_ROWS = 3;

/** Counts a number up from zero, as in the design. Jumps straight to the value when motion is reduced. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    setValue(0);
    frame = requestAnimationFrame(tick);
    // Browsers pause animation frames in background tabs. Never leave a wrong number on screen.
    const settle = window.setTimeout(() => setValue(target), 1400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target]);
  return value;
}

const CHECK_LABEL: Record<CheckKind, string> = {
  changed: 'Changed',
  duplicate: 'Twice?',
  jump: 'Higher',
  new: 'New',
};

/** The monthly summary: where the month landed, and the few things worth a look. */
export function Home({ go }: { go: (screen: Screen) => void }) {
  const { data, update } = useStore();
  const months = monthsWithData(data);
  const [picked, setPicked] = useState<string | null>(null);
  const [who, setWho] = useState<PersonFilter>('all');
  /** Checks that are on their way out, mid-animation. */
  const [leaving, setLeaving] = useState<string[]>([]);
  /** True once the owner has cleared the whole list this visit, to show a small celebration. */
  const [cleared, setCleared] = useState(false);
  const narrow = useNarrow();
  /** Which category groups the owner has opened up fully on a phone. */
  const [expanded, setExpanded] = useState<string[]>([]);
  const month = picked && months.includes(picked) ? picked : months[0];

  const summary = month ? monthSummary(data, month, who) : null;
  const shownSpent = useCountUp(summary?.spent ?? 0);

  if (!month || !summary) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
        <section className="card" style={{ width: '100%', maxWidth: 640, padding: 'clamp(32px, 6vw, 56px)', borderRadius: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
          <h1 className="d" style={{ fontSize: 'clamp(36px, 6vw, 52px)', fontWeight: 700, lineHeight: 1 }}>
            Nothing to show yet{data.people.you ? `, ${data.people.you}` : ''}.
          </h1>
          <div className="muted" style={{ fontSize: 17, lineHeight: 1.5, maxWidth: 380 }}>
            Drop in this month's statements and I'll show you where the money went.
          </div>
          <button className="btn pri" onClick={() => go('upload')}>
            Go to Upload
            <Icon path={ICON.arrow} size={18} />
          </button>
        </section>
      </main>
    );
  }

  const monthWord = monthName(month).split(' ')[0];
  const questions = reviewQueue(data).length;
  const checks = checksFor(data, month);
  const accountsIn = data.accounts.filter((a) => data.imports.some((r) => r.accountId === a.id && r.month === month)).length;
  const allIn = accountsIn === data.accounts.length;
  const earlierCount = months.filter((m) => m < month).length;

  // The filter only makes sense when rows are on this device and someone owns an account outright.
  const people: [PersonFilter, string][] = [['all', 'Household']];
  if (data.accounts.some((a) => a.owner === 'you')) people.push(['you', data.people.you || 'You']);
  if (data.accounts.some((a) => a.owner === 'partner')) people.push(['partner', data.people.partner || 'Partner']);
  const showFilter = summary.hasRows && people.length > 1;

  const left = summary.moneyIn - summary.spent;
  const hasIncome = summary.moneyIn > 0 && who === 'all';
  const usedPct = hasIncome ? Math.min(100, Math.round((summary.spent / summary.moneyIn) * 100)) : 0;
  const barTotal = hasIncome ? Math.max(summary.moneyIn, summary.spent) : summary.spent;
  const share = (cents: number) => (barTotal > 0 ? `${Math.max(0, (cents / barTotal) * 100).toFixed(1)}%` : '0%');
  const segments = [
    { label: 'Fixed costs', cents: summary.fixed, color: 'var(--seg1)' },
    { label: 'Everyday spending', cents: summary.everyday, color: 'var(--seg3)' },
    ...(hasIncome && left > 0 ? [{ label: 'Not spent', cents: left, color: 'var(--seg5)' }] : []),
  ].filter((s) => s.cents > 0);

  const gotIt = (id: string) => {
    const last = checks.length === 1;
    const finish = () => {
      update((d) => dismissCheck(d, id));
      setLeaving((list) => list.filter((x) => x !== id));
      if (last) setCleared(true);
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    // Let the row swoop away and the list close up before it is really removed.
    setLeaving((list) => [...list, id]);
    window.setTimeout(finish, 620);
  };

  // Biggest first, so the folded view on a phone shows what matters most.
  const bySize = (a: (typeof summary.categories)[number], b: (typeof summary.categories)[number]) => b.cents - a.cents;
  const everyday = summary.categories.filter((c) => c.category.group === 'everyday').sort(bySize);
  const fixed = summary.categories.filter((c) => c.category.group === 'fixed').sort(bySize);

  const rowGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '26px 32px' } as const;

  /** A titled group of categories. On a phone it shows its top few and folds the rest away. */
  const renderGroup = (id: string, title: string, lines: typeof everyday, totalCents: number, offset: number) => {
    const folds = narrow && lines.length > FOLDED_ROWS;
    const open = !folds || expanded.includes(id);
    const top = folds ? lines.slice(0, FOLDED_ROWS) : lines;
    const rest = folds ? lines.slice(FOLDED_ROWS) : [];
    // Bars are sized within their own group, so rent does not flatten every everyday bar.
    const biggest = Math.max(1, ...lines.map((c) => Math.max(c.cents, c.usual ?? 0)));
    const toggle = () => setExpanded((list) => (open ? list.filter((x) => x !== id) : [...list, id]));
    const heading = (
      <>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="d" style={{ fontSize: 28, fontWeight: 600 }}>{title}</h2>
          <div className="muted num" style={{ fontSize: 14, paddingTop: 2 }}>
            {lines.length} {lines.length === 1 ? 'category' : 'categories'}
          </div>
        </div>
        <div className="d num" style={{ fontSize: 24, fontWeight: 600 }}>{formatDollars(totalCents)}</div>
      </>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {folds ? (
          <button className={open ? 'sechead open' : 'sechead'} aria-expanded={open} onClick={toggle}>
            {heading}
            <span className="chev" style={{ display: 'flex' }}><Icon path={ICON.chevron} size={20} /></span>
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>{heading}</div>
        )}
        {lines.length === 0 ? (
          <div className="muted" style={{ fontSize: 15 }}>Nothing here for {monthWord}.</div>
        ) : (
          <div>
            {renderRows(top, offset, biggest)}
            {rest.length > 0 && (
              <>
                <div className={open ? 'fold' : 'fold shut'}>
                  <div className="in" inert={!open}>
                    <div style={{ paddingTop: 26 }}>{renderRows(rest, offset + top.length, biggest)}</div>
                  </div>
                </div>
                <button className="btn sm quiet" style={{ marginTop: 14, padding: '0 14px' }} onClick={toggle}>
                  {open ? 'Show fewer' : `Show all ${lines.length}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRows = (lines: typeof everyday, offset: number, biggest: number) => (
    <div style={rowGrid}>
      {lines.map((line, i) => {
        const trend = trendOf(line);
        const up = trend?.kind === 'up';
        return (
          <div key={line.category.id} className="row" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div className="tile"><Icon path={categoryIcon(line.category.id)} /></div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{line.category.name}</div>
                {trend && (
                  <span className={`st ${up ? 'close' : 'ok'}`}>
                    {trend.kind === 'usual' ? 'About usual' : `${up ? 'Up' : 'Down'} ${formatDollars(trend.byCents)}`}
                  </span>
                )}
              </div>
              <div className="track">
                <div
                  className={`fill ${up ? 'close' : 'ok'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (line.cents / biggest) * 100)).toFixed(1)}%`, animationDelay: `${(offset + i) * 60}ms` }}
                />
              </div>
              <div className="num" style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{formatDollars(line.cents)}</span>{' '}
                <span className="muted">
                  {line.usual !== null ? `usually ${formatDollars(line.usual)}` : summary.hasRows ? `${line.lines} ${line.lines === 1 ? 'line' : 'lines'}` : ''}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingTop: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="label">
            {monthName(month)} · {allIn ? 'all statements in' : `${accountsIn} of ${data.accounts.length} statements in`}
          </div>
          <h1 className="d" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700 }}>
            Here's {monthWord}{data.people.you ? `, ${data.people.you}` : ''}.
          </h1>
        </div>
        {months.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Pick a month">
            {months.slice(0, 6).map((m) => (
              <button key={m} className={m === month ? 'chip on' : 'chip'} aria-pressed={m === month} onClick={() => setPicked(m)}>
                {monthName(m).split(' ')[0].slice(0, 3)}
              </button>
            ))}
          </div>
        )}
      </div>

      <section key={month + who} className="hero" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--hero-muted)' }}>
              {who === 'all' ? `Spent in ${monthWord}` : `Spent on ${people.find((p) => p[0] === who)?.[1]}'s cards`}
            </div>
            <div className="d num big" style={{ fontSize: 'clamp(72px, 13vw, 148px)', lineHeight: 0.9, fontWeight: 700 }} aria-label={formatDollars(summary.spent)}>
              {formatDollars(shownSpent)}
            </div>
            <div style={{ fontSize: 16, color: 'var(--hero-muted)', paddingTop: 10 }}>
              {hasIncome
                ? left >= 0
                  ? `${formatDollars(summary.moneyIn)} came in, so ${formatDollars(left)} wasn't spent.`
                  : `${formatDollars(summary.moneyIn)} came in. Spending ran ${formatDollars(-left)} past that this month.`
                : who === 'all'
                  ? 'Add the chequing statement and I can show this against what came in.'
                  : 'Shared accounts are counted under Household only.'}
            </div>
          </div>
          {hasIncome && (
            <div style={{ position: 'relative', width: 168, height: 168, flex: 'none' }}>
              <svg viewBox="0 0 140 140" aria-hidden="true" style={{ width: 168, height: 168, transform: 'rotate(-90deg)' }}>
                <circle cx="70" cy="70" r="58" style={{ fill: 'none', stroke: 'var(--hero-track)', strokeWidth: 14 }} />
                <circle className="ring" cx="70" cy="70" r="58" style={{ fill: 'none', stroke: 'var(--hero-ring)', strokeWidth: 14, strokeLinecap: 'round', strokeDasharray: `${Math.round((usedPct / 100) * 364.4)} 365` }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="d num" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{usedPct}%</div>
                <div style={{ fontSize: 13, color: 'var(--hero-muted)' }}>of money in</div>
              </div>
            </div>
          )}
        </div>
        {segments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--hero-muted)' }}>
              {hasIncome ? `Where ${formatDollars(summary.moneyIn)} of money in went` : 'How the spending splits'}
            </div>
            <div role="img" aria-label={segments.map((s) => `${s.label} ${formatDollars(s.cents)}`).join(', ')} style={{ display: 'flex', gap: 4, height: 20 }}>
              {segments.map((s, i) => (
                <div
                  key={s.label}
                  className="seg"
                  style={{
                    width: share(s.cents),
                    minWidth: 6,
                    background: s.color,
                    borderRadius: `${i === 0 ? '999px' : '6px'} ${i === segments.length - 1 ? '999px 999px' : '6px 6px'} ${i === 0 ? '999px' : '6px'}`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 16 }}>
              {segments.map((s) => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--hero-muted)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
                    {s.label}
                  </div>
                  <div className="d num" style={{ fontSize: 26, fontWeight: 600 }}>{formatDollars(s.cents)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {checks.length > 0 && who === 'all' && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6, animationDelay: '60ms' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 6 }}>
            <h2 className="d" style={{ fontSize: 28, fontWeight: 600 }}>Worth a look</h2>
            <div className="num muted" style={{ fontSize: 15 }} aria-live="polite">
              {checks.length - leaving.length} {checks.length - leaving.length === 1 ? 'thing' : 'things'}
            </div>
          </div>
          {checks.slice(0, 6).map((c) => {
            const going = leaving.includes(c.id);
            return (
              <div key={c.id} className={going ? 'fold bye' : 'fold'}>
                <div className="in">
                  <div className="line" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span className={`st ${c.kind === 'duplicate' || c.kind === 'changed' ? 'close' : 'ok'}`} style={{ marginTop: 2, flex: 'none', minWidth: 66, textAlign: 'center' }}>
                      {CHECK_LABEL[c.kind]}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16, overflowWrap: 'anywhere' }}>{c.title}</div>
                      <div className="muted num" style={{ fontSize: 14, lineHeight: 1.5 }}>{c.detail}</div>
                    </div>
                    {going ? (
                      <span className="tick" aria-hidden="true">
                        <Icon path={ICON.check} size={20} style={{ strokeWidth: 2.4 }} />
                      </span>
                    ) : (
                      <button className="btn sm quiet" style={{ flex: 'none' }} onClick={() => gotIt(c.id)} aria-label={`Got it: ${c.title}`}>
                        Got it
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {checks.length > 6 && <div className="muted" style={{ fontSize: 14, paddingTop: 8 }}>And {checks.length - 6} more once these are cleared.</div>}
        </section>
      )}

      {checks.length === 0 && cleared && who === 'all' && (
        <section className="card" style={{ display: 'flex', alignItems: 'center', gap: 18, animation: 'rise .5s cubic-bezier(.2,.8,.2,1) both' }}>
          <span className="tick" aria-hidden="true">
            <Confetti />
            <Icon path={ICON.check} size={20} style={{ strokeWidth: 2.4 }} />
          </span>
          <div>
            <div className="d" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>All clear.</div>
            <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Nothing left to look at for {monthWord}.</div>
          </div>
        </section>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24, animationDelay: '80ms' }}>
          {showFilter && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-label="Filter by person">
              {people.map(([id, label]) => (
                <button key={id} className={who === id ? 'chip on' : 'chip'} aria-pressed={who === id} onClick={() => setWho(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {renderGroup('everyday', 'Everyday spending', everyday, summary.everyday, 0)}
          {fixed.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 24 }}>
              {renderGroup('fixed', 'Fixed costs', fixed, summary.fixed, everyday.length)}
            </div>
          )}
          <button className="btn quiet" style={{ alignSelf: 'flex-start', padding: '0 14px' }} onClick={() => go('sorted')}>
            See every line
            <Icon path={ICON.arrow} size={18} />
          </button>
        </section>

        <aside style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, animationDelay: '140ms' }}>
            <div className="label">Next up</div>
            {questions > 0 ? (
              <>
                <div className="d" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.05 }}>
                  {questions} quick {questions === 1 ? 'question' : 'questions'}
                </div>
                <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
                  A few lines I wasn't sure about. They aren't in the totals until you answer.
                </div>
                <button className="btn pri" onClick={() => go('review')}>
                  Answer them
                  <Icon path={ICON.arrow} size={18} />
                </button>
              </>
            ) : !allIn ? (
              <>
                <div className="d" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.05 }}>
                  {data.accounts.length - accountsIn} {data.accounts.length - accountsIn === 1 ? 'statement' : 'statements'} to go
                </div>
                <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>The picture for {monthWord} is partial until they're in.</div>
                <button className="btn pri" onClick={() => go('upload')}>
                  Add them
                  <Icon path={ICON.arrow} size={18} />
                </button>
              </>
            ) : (
              <>
                <div className="d" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.05 }}>All caught up.</div>
                <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Nothing needs you until the next statements land.</div>
              </>
            )}
          </section>

          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, animationDelay: '200ms' }}>
            <div className="label">Worth knowing</div>
            <div style={{ fontSize: 16, lineHeight: 1.5 }}>
              {earlierCount === 0
                ? "This is the first month I've seen. From next month I'll compare each category with your usual and point out changes."
                : earlierCount === 1
                  ? "I'm comparing with last month for now. One more month and I can spot standing charges that change."
                  : checks.length === 0
                    ? `No doubles, no changed bills and nothing running high in ${monthWord}.`
                    : `Comparing ${monthWord} with your last ${Math.min(3, earlierCount)} months.`}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
