import { useRef, useState, type DragEvent } from 'react';
import { Icon, ICON } from '../components/Icons';
import type { Screen } from '../components/Header';
import { addStatement, isCardPaymentLine, monthsWithData, newId, reviewQueue } from '../lib/actions';
import { formatCents, monthName, parseCents, shortDate } from '../lib/money';
import { displayName, maskDigits, merchantKey } from '../lib/normalize';
import { detectAndParse, guessMapping, parseGeneric, readCsv, type ColumnMapping } from '../lib/parsers';
import type { TextLine } from '../lib/pdf/lines';
import { parseStatement } from '../lib/pdf/statement';
import type { Account, ParseResult } from '../lib/types';
import { useStore } from '../store';

interface Notice {
  id: string;
  tone: 'good' | 'bad' | 'warm';
  title: string;
  body: string;
  warnings: string[];
}

/** A file that needs one answer from the owner before it can be added. Held in memory only. */
interface Pending {
  id: string;
  fileName: string;
  rows: string[][];
  /** Set when the bank layout was recognised and only the account is unclear. */
  parsed: ParseResult | null;
  mapping: ColumnMapping;
  accountId: string;
  /** Set for PDFs that did not pass the totals check: the owner looks the lines over first. */
  lookOver: string | null;
  /** Line numbers the owner unticked in the look-over list. */
  excluded: number[];
  /** Line numbers where a number was hard to read in a photo. */
  doubtful: number[];
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Upload({ go }: { go: (screen: Screen) => void }) {
  const { data, restore } = useStore();
  // Several files can be read in one drop, so each one builds on the last result.
  const latest = useRef(data);
  latest.current = data;

  const [notices, setNotices] = useState<Notice[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  /** Shown while a photo is being read, which can take a few seconds. */
  const [busy, setBusy] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const targetAccount = useRef<string | null>(null);

  const month = monthsWithData(data)[0] ?? previousMonth();
  const questions = reviewQueue(data).length;
  const uploadedCount = data.accounts.filter((a) => data.imports.some((r) => r.accountId === a.id && r.month === month)).length;

  const say = (notice: Omit<Notice, 'id'>) => setNotices((list) => [{ ...notice, id: newId() }, ...list]);

  const importNow = (account: Account, parsed: ParseResult, fileName: string) => {
    const outcome = addStatement(latest.current, account, parsed);
    latest.current = outcome.data;
    restore(outcome.data);
    const already = outcome.duplicates > 0 ? ` ${outcome.duplicates} were already here, so I skipped them.` : '';
    say({
      tone: outcome.added > 0 ? 'good' : 'warm',
      title:
        outcome.added > 0
          ? `${outcome.added} ${outcome.added === 1 ? 'line' : 'lines'} added to ${account.name}.`
          : `Nothing new in ${fileName}.`,
      body: `${outcome.range ? outcome.range + '.' : ''}${already} Statement processed and removed. Nothing was uploaded.`,
      warnings: outcome.warnings,
    });
  };

  const handlePdf = async (file: File, name: string, forAccountId: string | null) => {
    const bad = (body: string) => say({ tone: 'bad', title: `Couldn't read ${name}.`, body, warnings: [] });
    let textLines;
    try {
      // The PDF reader is loaded only when a PDF arrives, from the app's own files.
      const { extractPdfLines } = await import('../lib/pdf/extract');
      textLines = await extractPdfLines(await file.arrayBuffer());
    } catch (e) {
      bad(
        e instanceof Error && e.name === 'PdfLockedError'
          ? "It's locked with a password. Save an unlocked copy, or use a CSV instead."
          : "It doesn't open as a PDF. Try downloading it again from your bank's site.",
      );
      return;
    }
    if (textLines.length === 0) {
      bad("It's a scan, so there's no text layer in it. Take a screenshot or photo of each page and drop those in.");
      return;
    }
    intakeStatement(textLines, name, forAccountId, 'PDF');
  };

  const handlePhoto = async (file: File, name: string, forAccountId: string | null) => {
    const bad = (body: string) => say({ tone: 'bad', title: `Couldn't read ${name}.`, body, warnings: [] });
    let textLines;
    setBusy(`Reading ${name}...`);
    try {
      // The photo reader is large, so it is loaded only when a photo arrives, from the app's own files.
      const { readPhoto } = await import('../lib/photo/read');
      textLines = await readPhoto(file, (fraction) => setBusy(`Reading ${name}... ${Math.round(fraction * 100)}%`));
    } catch (e) {
      bad(
        e instanceof Error && e.name === 'PhotoUnreadableError'
          ? "This browser can't open that kind of picture. A JPG or PNG works."
          : "The photo reader didn't start. Reload the page and try again, or use a PDF or CSV.",
      );
      return;
    } finally {
      setBusy('');
    }
    if (textLines.length === 0) {
      bad("I couldn't find any text in it. Try a sharper, straight-on photo, or a PDF or CSV from your bank's site.");
      return;
    }
    intakeStatement(textLines, name, forAccountId, 'Photo');
  };

  /** Shared by PDFs and photos: find the transactions, check them, then add or ask. */
  const intakeStatement = (textLines: TextLine[], name: string, forAccountId: string | null, source: 'PDF' | 'Photo') => {
    const bad = (body: string) => say({ tone: 'bad', title: `Couldn't read ${name}.`, body, warnings: [] });
    const accounts = latest.current.accounts;
    const forced = forAccountId ? accounts.find((a) => a.id === forAccountId) : undefined;
    const statement = parseStatement(textLines, todayIso(), forced?.kind);
    if (statement.lines.length === 0) {
      bad(
        source === 'Photo'
          ? "I couldn't make out any transactions. It may be blurry or at an angle. A PDF or CSV from your bank's site works best."
          : "I couldn't find any transactions in it. If your bank offers a CSV, that works best.",
      );
      return;
    }
    const parsed: ParseResult = { format: source, lines: statement.lines, skipped: 0 };
    let matches = accounts.filter((a) => a.kind === statement.kind);
    if (statement.bank) matches = matches.filter((a) => a.bank === statement.bank);
    const account = forced ?? (matches.length === 1 ? matches[0] : undefined);

    // Only a statement that adds up to its own printed balance, with no
    // hard-to-read numbers, goes straight in.
    const trusted = statement.check.status === 'match' && statement.doubtful.length === 0;
    if (account && trusted) {
      importNow(account, parsed, name);
      return;
    }
    let lookOver: string | null = null;
    if (!trusted) {
      lookOver =
        statement.check.status === 'match'
          ? 'These add up to the balance on the statement, but a few numbers were hard to read.'
          : source === 'Photo' && statement.check.status === 'none'
            ? "Photos can be misread, and I couldn't find the statement's balances to check against."
            : statement.check.message;
    }
    setPending((list) => [
      ...list,
      {
        id: newId(),
        fileName: name,
        rows: [],
        parsed,
        mapping: guessMapping([]),
        accountId: account?.id ?? matches[0]?.id ?? '',
        lookOver,
        excluded: [],
        doubtful: statement.doubtful,
      },
    ]);
  };

  const handleFiles = async (files: File[], forAccountId: string | null) => {
    for (const file of files) {
      // Bank file names often contain account digits, so they are masked before display.
      const name = maskDigits(file.name);
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        await handlePdf(file, name, forAccountId);
        continue;
      }
      if (/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) || file.type.startsWith('image/')) {
        await handlePhoto(file, name, forAccountId);
        continue;
      }
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      if (!isCsv) {
        say({
          tone: 'bad',
          title: `Couldn't read ${name}.`,
          body: "I only understand statements: a CSV, a PDF, or a photo. A CSV from your bank's site works best.",
          warnings: [],
        });
        continue;
      }
      let rows: string[][];
      try {
        rows = readCsv(await file.text());
      } catch {
        rows = [];
      }
      if (rows.length === 0) {
        say({ tone: 'bad', title: `Couldn't read ${name}.`, body: 'It looks empty. Try downloading it again.', warnings: [] });
        continue;
      }

      const accounts = latest.current.accounts;
      const detected = detectAndParse(rows);
      const forced = forAccountId ? accounts.find((a) => a.id === forAccountId) : undefined;

      if (detected) {
        let matches = accounts.filter((a) => a.bank === detected.bank);
        if (detected.result.format.includes('chequing')) matches = matches.filter((a) => a.kind === 'bank');
        else if (detected.result.format.includes('card')) matches = matches.filter((a) => a.kind === 'card');
        const account = forced ?? (matches.length === 1 ? matches[0] : undefined);
        if (account) {
          importNow(account, detected.result, name);
          continue;
        }
        setPending((list) => [
          ...list,
          { id: newId(), fileName: name, rows: [], parsed: detected.result, mapping: guessMapping(rows), accountId: matches[0]?.id ?? '', lookOver: null, excluded: [], doubtful: [] },
        ]);
        continue;
      }
      setPending((list) => [
        ...list,
        { id: newId(), fileName: name, rows, parsed: null, mapping: guessMapping(rows), accountId: forced?.id ?? '', lookOver: null, excluded: [], doubtful: [] },
      ]);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles([...e.dataTransfer.files], null);
  };

  const pickFor = (accountId: string | null) => {
    targetAccount.current = accountId;
    fileInput.current?.click();
  };

  const patchPending = (id: string, change: Partial<Pending>) =>
    setPending((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const dropPending = (id: string) => setPending((list) => list.filter((p) => p.id !== id));

  const finishPending = (p: Pending) => {
    const account = data.accounts.find((a) => a.id === p.accountId);
    if (!account) return;
    let parsed = p.parsed ?? parseGeneric(p.rows, p.mapping);
    if (p.excluded.length > 0) {
      parsed = { ...parsed, lines: parsed.lines.filter((_, i) => !p.excluded.includes(i)) };
    }
    if (parsed.lines.length === 0) {
      say({
        tone: 'bad',
        title: `Still couldn't read ${p.fileName}.`,
        body: 'No rows had a date and an amount with those columns. Try different ones.',
        warnings: [],
      });
      return;
    }
    importNow(account, parsed, p.fileName);
    dropPending(p.id);
  };

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12 }}>
        <div className="label">Step 1 of 3 · {monthName(month)}</div>
        <h1 className="d" style={{ fontSize: 'clamp(40px, 6vw, 68px)', lineHeight: 0.98, fontWeight: 700 }}>
          Drop it. I'll sort it.
        </h1>
      </div>

      {pending.map((p) => (
        <PendingCard
          key={p.id}
          pending={p}
          accounts={data.accounts}
          onChange={(change) => patchPending(p.id, change)}
          onAdd={() => finishPending(p)}
          onCancel={() => dropPending(p.id)}
        />
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
        <label
          className={dragging ? 'drop over' : 'drop'}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={(e) => {
            // A click on the drop zone itself is not meant for one account.
            if (e.target !== fileInput.current) targetAccount.current = null;
          }}
          style={{ flex: '999 1 520px', minWidth: 0, minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}
        >
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".csv,text/csv,.pdf,application/pdf,image/*"
            className="sr"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              const forAccount = targetAccount.current;
              targetAccount.current = null;
              e.target.value = '';
              void handleFiles(files, forAccount);
            }}
          />
          <div className="bob" style={{ width: 88, height: 88, borderRadius: 28, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon path={ICON.upload} size={38} />
          </div>
          <div className="d" style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.05 }}>Drag your statements here</div>
          <div className="muted" style={{ fontSize: 16, lineHeight: 1.5, maxWidth: 380 }}>
CSV, PDF or a photo. Mix all your cards and the bank account in one go.
          </div>
          <span className="btn ink">Or pick files</span>
          <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Icon path={ICON.lock} size={16} />
            Read in this browser, then dropped. Nothing is uploaded.
          </div>
        </label>

        <section className="card" style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, animationDelay: '80ms' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="d" style={{ fontSize: 26, fontWeight: 600 }}>Accounts</h2>
            <div className="num muted" style={{ fontSize: 15 }}>
              {uploadedCount} of {data.accounts.length} in
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.accounts.map((a) => {
              const record = data.imports.find((r) => r.accountId === a.id && r.month === month);
              return (
                <div key={a.id} className="row" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="tile">
                    <Icon path={a.kind === 'bank' ? ICON.bank : ICON.card} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{a.name}</div>
                    <div className="muted num" style={{ fontSize: 14 }}>
                      {record ? `${record.lines} lines · ${record.format}` : `Still missing for ${monthName(month).split(' ')[0]}`}
                    </div>
                  </div>
                  {record ? (
                    <span className="st ok">Uploaded</span>
                  ) : (
                    <button className="btn pri sm" onClick={() => pickFor(a.id)} aria-label={`Add a statement for ${a.name}`}>
                      Add
                    </button>
                  )}
                </div>
              );
            })}
            {data.accounts.length === 0 && (
              <div className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
                No accounts yet. Add one in Settings.
              </div>
            )}
          </div>

          <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {busy && (
              <div className="note warm" role="status">
                <Icon path={ICON.upload} style={{ flex: 'none' }} />
                <div><strong>{busy}</strong> Photos take a few seconds. Nothing leaves this device.</div>
              </div>
            )}
            {notices.map((n) => (
              <div key={n.id} className={`note ${n.tone}`} style={{ animation: 'rise .4s both' }}>
                <Icon path={n.tone === 'good' ? ICON.check : 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v5M12 16v.5'} style={{ flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{n.title}</strong> {n.body}
                  {n.warnings.map((w) => (
                    <div key={w} style={{ paddingTop: 6 }}>
                      <strong>Heads up:</strong> {w}
                    </div>
                  ))}
                </div>
                <button
                  className="btn quiet"
                  style={{ minHeight: 32, width: 32, padding: 0, flex: 'none', color: 'inherit' }}
                  aria-label="Dismiss this message"
                  onClick={() => setNotices((list) => list.filter((x) => x.id !== n.id))}
                >
                  <Icon path={ICON.close} size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className="btn ink" disabled={data.txns.length === 0} onClick={() => go(questions > 0 ? 'review' : 'home')}>
            Sort my month
            <Icon path={ICON.arrow} size={18} />
          </button>
        </section>
      </div>
    </main>
  );
}

interface PendingCardProps {
  pending: Pending;
  accounts: Account[];
  onChange: (change: Partial<Pending>) => void;
  onAdd: () => void;
  onCancel: () => void;
}

/** Asks which account a file belongs to and, for unknown layouts, which column is which. */
function PendingCard({ pending: p, accounts, onChange, onAdd, onCancel }: PendingCardProps) {
  const needsMapping = p.parsed === null;
  const header = p.mapping.hasHeader ? p.rows[0] ?? [] : [];
  const sample = p.rows[p.mapping.hasHeader ? 1 : 0] ?? [];
  const width = Math.max(0, ...p.rows.slice(0, 5).map((r) => r.length));
  const columnLabel = (i: number) => {
    const name = header[i] ? maskDigits(header[i]) : `Column ${i + 1}`;
    const example = sample[i] ? maskDigits(sample[i]).slice(0, 24) : '';
    return example ? `${name} (${example})` : name;
  };
  const setMap = (change: Partial<ColumnMapping>) => onChange({ mapping: { ...p.mapping, ...change } });
  const preview = needsMapping ? parseGeneric(p.rows, p.mapping) : p.parsed!;
  const columns = Array.from({ length: width }, (_, i) => i);
  const kind = accounts.find((a) => a.id === p.accountId)?.kind;
  const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 } as const;

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="label" style={{ color: 'var(--accent-text)' }}>One quick thing · {p.fileName}</div>
        <h2 className="d" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1 }}>
          {needsMapping
            ? "I don't know this layout yet. Which column is which?"
            : p.lookOver
              ? 'Have a quick look before I add these.'
              : 'Which account is this for?'}
        </h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        <label style={labelStyle}>
          Account
          <select className="field" value={p.accountId} onChange={(e) => onChange({ accountId: e.target.value })}>
            <option value="">Pick one</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        {needsMapping && (
          <>
            <label style={labelStyle}>
              Date
              <select className="field" value={p.mapping.dateCol} onChange={(e) => setMap({ dateCol: Number(e.target.value) })}>
                {columns.map((i) => <option key={i} value={i}>{columnLabel(i)}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Merchant or description
              <select className="field" value={p.mapping.descCol} onChange={(e) => setMap({ descCol: Number(e.target.value) })}>
                {columns.map((i) => <option key={i} value={i}>{columnLabel(i)}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Amount
              <select
                className="field"
                value={p.mapping.amountCol}
                onChange={(e) => setMap({ amountCol: Number(e.target.value) })}
              >
                {columns.map((i) => <option key={i} value={i}>{columnLabel(i)}</option>)}
                <option value={-1}>Separate money out and money in columns</option>
              </select>
            </label>
            {p.mapping.amountCol === -1 ? (
              <>
                <label style={labelStyle}>
                  Money out
                  <select className="field" value={p.mapping.debitCol} onChange={(e) => setMap({ debitCol: Number(e.target.value) })}>
                    <option value={-1}>Pick one</option>
                    {columns.map((i) => <option key={i} value={i}>{columnLabel(i)}</option>)}
                  </select>
                </label>
                <label style={labelStyle}>
                  Money in
                  <select className="field" value={p.mapping.creditCol} onChange={(e) => setMap({ creditCol: Number(e.target.value) })}>
                    <option value={-1}>Pick one</option>
                    {columns.map((i) => <option key={i} value={i}>{columnLabel(i)}</option>)}
                  </select>
                </label>
              </>
            ) : (
              <label style={labelStyle}>
                A purchase shows as
                <select
                  className="field"
                  value={p.mapping.positiveIsSpending ? 'pos' : 'neg'}
                  onChange={(e) => setMap({ positiveIsSpending: e.target.value === 'pos' })}
                >
                  <option value="pos">A plain number, like 46.18</option>
                  <option value="neg">A minus number, like -46.18</option>
                </select>
              </label>
            )}
            <label style={labelStyle}>
              Dates are written
              <select className="field" value={p.mapping.dateOrder} onChange={(e) => setMap({ dateOrder: e.target.value as ColumnMapping['dateOrder'] })}>
                <option value="auto">Work it out for me</option>
                <option value="MDY">Month first (10/03/2026)</option>
                <option value="DMY">Day first (03/10/2026)</option>
              </select>
            </label>
            <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={p.mapping.hasHeader}
                onChange={(e) => setMap({ hasHeader: e.target.checked })}
                style={{ width: 22, height: 22, accentColor: 'var(--accent)' }}
              />
              First row is column names
            </label>
          </>
        )}
      </div>

      {p.lookOver && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            {p.lookOver} Untick anything that isn't a real transaction, and fix any amount that looks wrong.
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto', background: 'var(--surface)', borderRadius: 18, padding: '4px 16px' }}>
            {preview.lines.map((line, i) => {
              const on = !p.excluded.includes(i);
              return (
                <label key={i} className="num" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, fontSize: 15, cursor: 'pointer', borderTop: i ? '1px solid var(--line)' : 0, opacity: on ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onChange({ excluded: on ? [...p.excluded, i] : p.excluded.filter((x) => x !== i) })}
                    style={{ width: 20, height: 20, accentColor: 'var(--accent)', flex: 'none' }}
                  />
                  <span style={{ flex: 'none', width: 56 }}>{shortDate(line.date)}</span>
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{displayName(merchantKey(line.description))}</span>
                  {kind && isCardPaymentLine(kind, line.description, line.outCents) && (
                    <span className="st plain" title="A payment between your bank and a card. It is not spending, so it is left out of the totals on both accounts.">
                      Card payment, not counted
                    </span>
                  )}
                  {p.doubtful.includes(i) && <span className="st over">Check this one</span>}
                  <span className="sr">Amount for {displayName(merchantKey(line.description))}</span>
                  <input
                    className="field sm num"
                    inputMode="decimal"
                    aria-label={`Amount for ${displayName(merchantKey(line.description))}`}
                    defaultValue={(Math.abs(line.outCents) / 100).toFixed(2)}
                    style={{ flex: 'none', width: 104, minHeight: 36, textAlign: 'right', fontWeight: 600, padding: '0 10px' }}
                    onClick={(e) => e.preventDefault()}
                    onBlur={(e) => {
                      // A corrected amount keeps the line's direction (out or in).
                      const cents = parseCents(e.target.value);
                      if (cents === null || cents === 0 || !p.parsed) {
                        e.target.value = (Math.abs(line.outCents) / 100).toFixed(2);
                        return;
                      }
                      const fixed = line.outCents < 0 ? -Math.abs(cents) : Math.abs(cents);
                      if (fixed === line.outCents) return;
                      const lines = p.parsed.lines.map((l, n) => (n === i ? { ...l, outCents: fixed } : l));
                      onChange({ parsed: { ...p.parsed, lines }, doubtful: p.doubtful.filter((x) => x !== i) });
                    }}
                  />
                  <span style={{ flex: 'none', width: 24 }}>{line.outCents >= 0 ? 'out' : 'in'}</span>
                </label>
              );
            })}
          </div>
          <div className="num" style={{ fontSize: 14 }}>
            {preview.lines.length - p.excluded.length} of {preview.lines.length} lines will be added.
          </div>
        </div>
      )}

      {!p.lookOver && (
      <div style={{ fontSize: 15, lineHeight: 1.6 }}>
        {preview.lines.length === 0 ? (
          <span>I can't read any rows with these choices yet.</span>
        ) : (
          <>
            <strong>{preview.lines.length} lines.</strong> Here's how I read the first few:
            {preview.lines.slice(0, 3).map((line, i) => (
              <div key={i} className="num">
                {shortDate(line.date)} · {displayName(merchantKey(line.description))} ·{' '}
                {formatCents(Math.abs(line.outCents))} {line.outCents >= 0 ? 'out' : 'in'}
              </div>
            ))}
          </>
        )}
      </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button className="btn pri" disabled={!p.accountId || preview.lines.length - p.excluded.length <= 0} onClick={onAdd}>
          Add these lines
        </button>
        <button className="btn quiet" style={{ color: 'var(--text)' }} onClick={onCancel}>
          Skip this file
        </button>
      </div>
    </section>
  );
}
