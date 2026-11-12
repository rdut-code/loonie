// Merchant cleanup. The goal: "SQ *LITTLE SPROUTS PLAY #204  TORONTO ON"
// and "LITTLE SPROUTS PLAY 0031 TORONTO ON" both become one merchant,
// so one saved rule covers every visit.

/** Hides any run of 6 or more digits, so card and account numbers are never shown or kept. */
export function maskDigits(text: string): string {
  return text
    .replace(/\d(?:[ -]?\d){11,}/g, '••••')
    .replace(/\d{6,}/g, '••••');
}

// Payment-processor and bank prefixes that say nothing about the merchant.
const PREFIXES = [
  /^SQ\s*\*\s*/,
  /^TST\s*\*\s*/,
  /^SP\s*\*?\s+/,
  /^SP\*\s*/,
  /^PAYPAL\s*\*\s*/,
  /^PP\s*\*\s*/,
  /^IN\s*\*\s*/,
  /^CKO\s*\*\s*/,
  /^ZSK\s*\*\s*/,
  /^FS\s*\*\s*/,
  /^GOOGLE\s*\*\s*/,
  /^(?:FPOS|OPOS|APOS|POS)\s+/,
  /^(?:POINT OF SALE|POS|INTERAC|DEBIT|VISA DEBIT)\s+(?:PURCHASE|RETAIL PURCHASE|PURCHASE INTERAC)\s*[-:]?\s*/,
  /^PRE-?AUTHORIZED\s+(?:DEBIT|PAYMENT)\s*[-:]?\s*/,
  /^(?:MISC|MISCELLANEOUS)\s+PAYMENT\s*[-:]?\s*/,
  /^(?:BILL|ONLINE BILL)\s+PAYMENT\s*[-:]?\s*/,
  /^PURCHASE\s*[-:]?\s+/,
  // Online banking wording: the payee is what follows.
  /^AUTO-?\s?WITHDRAWAL (?:BY|TO)\s+/,
  /^DIRECT DEPOSIT FROM\s+/,
  /^(?:BILL )?PAYMENT TO\s+/,
];

const PROVINCES = new Set([
  'ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'YT', 'NT', 'NU',
]);

// Cities that show up at the end of local statement lines. Longest names first.
const CITIES = [
  'NIAGARA FALLS', 'RICHMOND HILL', 'NORTH YORK', 'EAST YORK', 'ST CATHARINES',
  'SCARBOROUGH', 'MISSISSAUGA', 'ETOBICOKE', 'WOODBRIDGE', 'BURLINGTON', 'NEWMARKET',
  'KITCHENER', 'VANCOUVER', 'THORNHILL', 'PICKERING', 'OAKVILLE', 'BRAMPTON', 'EDMONTON',
  'HAMILTON', 'WINNIPEG', 'WATERLOO', 'MONTREAL', 'KINGSTON', 'VICTORIA', 'TORONTO',
  'MARKHAM', 'VAUGHAN', 'CALGARY', 'HALIFAX', 'CONCORD', 'OSHAWA', 'OTTAWA', 'AURORA',
  'MILTON', 'WHITBY', 'GUELPH', 'BARRIE', 'LONDON', 'QUEBEC', 'AJAX', 'YORK',
];

function stripLocation(s: string): string {
  const tokens = s.split(' ');
  if (tokens.length >= 3 && PROVINCES.has(tokens[tokens.length - 1])) {
    s = tokens.slice(0, -1).join(' ');
    for (const city of CITIES) {
      if (s.endsWith(' ' + city) && s.length > city.length + 1) {
        return s.slice(0, -city.length - 1);
      }
    }
    return s;
  }
  for (const city of CITIES) {
    if (s.endsWith(' ' + city) && s.split(' ').length > city.split(' ').length + 1) {
      return s.slice(0, -city.length - 1);
    }
  }
  return s;
}

/** Returns the rule key for a raw statement description. Upper case, no store numbers. */
export function merchantKey(description: string): string {
  let s = description.toUpperCase().trim();

  // Banks pad the merchant to a fixed width and put the location after it.
  const columns = s.split(/\s{2,}/);
  if (columns.length > 1) {
    const last = columns[columns.length - 1];
    const lastTokens = last.split(' ');
    const looksLikePlace =
      PROVINCES.has(lastTokens[lastTokens.length - 1]) || CITIES.includes(last);
    if (looksLikePlace) columns.pop();
    s = columns.join(' ');
  }

  // Digit runs go first, so nothing sensitive survives the later steps.
  s = s.replace(/\d(?:[ -]?\d){11,}/g, ' ').replace(/\d{6,}/g, ' ');

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PREFIXES) {
      const next = s.replace(prefix, '');
      if (next !== s) {
        s = next.trim();
        changed = true;
      }
    }
  }

  // Order codes after a star, for example "AMZN MKTP CA*1A2B3C4D5".
  s = s.replace(/\*\s*\S*\d\S*.*$/, ' ');
  s = s.replace(/\*/g, ' ');
  // Store numbers: "#204", "UNIT 12", and bare number tokens.
  s = s.replace(/#\s*\w+/g, ' ');
  s = s.replace(/\b(?:STN|UNIT|LOC)\s*\d+\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = stripLocation(s);
  s = s.replace(/(?:\s+\d+)+$/g, '');
  s = s.replace(/\s+\d{2,}(?=\s)/g, '');
  s = stripLocation(s.replace(/\s+/g, ' ').trim());
  s = s.replace(/[\s.,\-/:]+$/g, '').trim();

  return s || 'UNKNOWN MERCHANT';
}

/**
 * Lines like e-transfers, cash withdrawals and cheques share one name but
 * mean something different each time. They are asked about one by one and
 * never get a "remember forever" rule.
 */
export function isGenericKey(key: string): boolean {
  return /E-?TRANSFER|E-?TRF|\bATM\b|^(?:CASH |ABM )?WITHDRAWAL|CHEQUE|CHECK\b|^TRANSFER\b|CASH ADVANCE|^UNKNOWN MERCHANT$/.test(key);
}

const KEEP_UPPER = new Set(['LCBO', 'TTC', 'IKEA', 'A&W', 'KFC', 'BMO', 'CIBC', 'RBC', 'TD', 'UPS', 'GO', 'CAA', 'H&M', 'CRA']);

/** "LITTLE SPROUTS PLAY" -> "Little Sprouts Play" */
export function displayName(key: string): string {
  return key
    .split(' ')
    .map((word) => {
      if (KEEP_UPPER.has(word) || /\.(COM|CA)$/.test(word)) {
        return /\./.test(word) ? word.toLowerCase() : word;
      }
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(' ');
}
