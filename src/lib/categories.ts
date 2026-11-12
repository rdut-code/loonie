import { INCOME, NOT_SPENDING, OTHER, type Category } from './types';

/** The starting list. Everything except the system entries can be renamed in Settings. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'rent', name: 'Rent', group: 'fixed' },
  { id: 'car-loan', name: 'Car loan', group: 'fixed' },
  { id: 'car-insurance', name: 'Car insurance', group: 'fixed' },
  { id: 'daycare', name: 'Daycare', group: 'fixed' },
  { id: 'utilities', name: 'Utilities', group: 'fixed' },
  { id: 'family-support', name: 'Support to family', group: 'fixed' },

  { id: 'groceries', name: 'Groceries', group: 'everyday' },
  { id: 'dining', name: 'Dining out', group: 'everyday' },
  { id: 'transport', name: 'Gas and transport', group: 'everyday' },
  { id: 'kids', name: 'Kids', group: 'everyday' },
  { id: 'health', name: 'Health', group: 'everyday' },
  { id: 'shopping', name: 'Shopping', group: 'everyday' },
  { id: 'phone-internet', name: 'Phone and internet', group: 'everyday' },
  { id: 'subscriptions', name: 'Subscriptions', group: 'everyday' },
  { id: 'travel', name: 'Travel', group: 'everyday' },
  { id: 'vices', name: 'Vape, alcohol and lottery', group: 'everyday' },
  { id: 'irregular', name: 'Irregular', group: 'everyday' },
  { id: 'fun', name: 'Fun', group: 'everyday' },
  { id: OTHER, name: 'Other', group: 'everyday' },

  { id: NOT_SPENDING, name: 'Not spending', group: 'system' },
  { id: INCOME, name: 'Money in', group: 'system' },
];

/**
 * Keyword hints, checked in order. `sure` hints are well-known names, so the
 * line is filed straight away (still marked as a guess). The rest only
 * decide which answers are offered first in the review queue.
 */
interface Hint {
  categoryId: string;
  sure: boolean;
  words: RegExp;
}

const HINTS: Hint[] = [
  { categoryId: 'groceries', sure: true, words: /\b(LOBLAWS?|NO ?FRILLS|METRO|SOBEYS|FRESHCO|FOOD BASICS|FARM BOY|LONGO'?S|T ?& ?T SUPERMARKET|WHOLE FOODS|COSTCO WHOLESALE|REAL CDN SUPERSTORE|SUPERSTORE|FORTINOS|ZEHRS|VALU-?MART|INDEPENDENT GROCER|IQBAL|ADONIS|NATIONS FRESH)\b/ },
  { categoryId: 'groceries', sure: false, words: /\b(GROCER|SUPERMARKET|MARKET|FOODS|BUTCHER|BAKERY|PRODUCE|FRUIT)/ },

  { categoryId: 'dining', sure: true, words: /\b(TIM HORTONS|STARBUCKS|MCDONALD'?S|SUBWAY|A&W|WENDY'?S|BURGER KING|POPEYES|KFC|PIZZA PIZZA|DOMINO'?S|PIZZA HUT|SWISS CHALET|HARVEY'?S|CHIPOTLE|FIVE GUYS|UBER ?EATS|DOORDASH|SKIPTHEDISHES|SKIP THE DISHES|SECOND CUP|MARY BROWN'?S|OSMOW'?S|BOOSTER JUICE)\b/ },
  { categoryId: 'dining', sure: false, words: /\b(RESTAURANT|BISTRO|CAFE|COFFEE|GRILL|KITCHEN|PIZZA|SUSHI|BURGER|SHAWARMA|DINER|EATERY|TAVERN|PUB|BAR|BREW|TACO|NOODLE|RAMEN|PHO|BBQ|WINGS|DELI|BUBBLE TEA)\b/ },

  { categoryId: 'transport', sure: true, words: /\b(PETRO-?CANADA|PETRO CAN|ESSO|SHELL|ULTRAMAR|PIONEER|CANADIAN TIRE GAS|COSTCO GAS|PRESTO|TTC|GO TRANSIT|UBER(?! ?EATS)|LYFT|407 ?ETR|GREEN P|IMPARK)\b/ },
  { categoryId: 'transport', sure: false, words: /\b(GAS|FUEL|PARKING|TRANSIT|TAXI|CAR WASH|AUTO|TIRE|MECHANIC|OIL CHANGE)\b/ },

  { categoryId: 'car-insurance', sure: false, words: /\b(INSURANCE|ASSURANCE|INTACT|AVIVA|BELAIR|DESJARDINS INS|TD INS|ALLSTATE|ECONOMICAL|CAA INS)\b/ },
  { categoryId: 'car-loan', sure: false, words: /\b(AUTO FINANCE|CAR LOAN|TOYOTA FIN|HONDA FIN|FORD CREDIT|VW CREDIT|HYUNDAI CAPITAL|KIA FINANCE)\b/ },

  { categoryId: 'phone-internet', sure: true, words: /\b(ROGERS|BELL CANADA|BELL MOBILITY|TELUS|FIDO|KOODO|VIRGIN PLUS|FREEDOM MOBILE|PUBLIC MOBILE|TEKSAVVY|CHATR|LUCKY MOBILE|FIZZ)\b/ },

  { categoryId: 'subscriptions', sure: true, words: /\b(NETFLIX|SPOTIFY|DISNEY ?PLUS|DISNEY\+|CRAVE|APPLE\.COM\/BILL|AMAZON PRIME|PRIME VIDEO|YOUTUBE ?PREMIUM|ICLOUD|GOOGLE ONE|AUDIBLE|DROPBOX|PATREON|NYTIMES|CHATGPT|OPENAI|CLAUDE\.AI|ANTHROPIC)\b/ },
  { categoryId: 'subscriptions', sure: false, words: /\b(SUBSCRIPTION|MEMBERSHIP|MONTHLY)\b/ },

  { categoryId: 'utilities', sure: true, words: /\b(TORONTO HYDRO|HYDRO ONE|ENBRIDGE|ALECTRA|ENERCARE|RELIANCE HOME|TORONTO WATER)\b/ },
  { categoryId: 'utilities', sure: false, words: /\b(HYDRO|UTILIT|WATER BILL|ELECTRIC)\b/ },

  { categoryId: 'health', sure: true, words: /\b(SHOPPERS DRUG MART|REXALL|PHARMASAVE|GUARDIAN PHARM|IDA PHARM)\b/ },
  { categoryId: 'health', sure: false, words: /\b(PHARMAC|DRUG|DENTAL|DENTIST|CLINIC|MEDICAL|OPTICAL|OPTOMETR|PHYSIO|CHIROPRACT|MASSAGE THERAPY|HOSPITAL|VET|LIFELABS)/ },

  { categoryId: 'vices', sure: true, words: /\b(LCBO|BEER STORE|WINE RACK|OLG|LOTTO|PLAYNOW)\b/ },
  { categoryId: 'vices', sure: false, words: /\b(VAPE|VAPOR|SMOKE|TOBACCO|CANNABIS|LIQUOR|WINE|BREWERY|LOTTERY|CASINO)/ },

  { categoryId: 'kids', sure: false, words: /\b(KIDS?|TOYS? ?R ?US|MASTERMIND|CHILDREN|SCHOOL|SWIM|GYMNASTICS|SOCCER|HOCKEY|DANCE|KUMON|CAMP|PLAY|SPROUTS|CARTER'?S|OSHKOSH)\b/ },
  { categoryId: 'daycare', sure: false, words: /\b(DAYCARE|DAY CARE|CHILD ?CARE|MONTESSORI|PRESCHOOL|NURSERY)\b/ },

  { categoryId: 'travel', sure: true, words: /\b(AIR CANADA|WESTJET|PORTER AIR|FLAIR AIR|AIRBNB|EXPEDIA|BOOKING\.COM|VIA RAIL|MARRIOTT|HILTON|HYATT)\b/ },
  { categoryId: 'travel', sure: false, words: /\b(HOTEL|MOTEL|INN|AIRLINE|AIRWAYS|AIRPORT|RESORT|CAR RENTAL|HERTZ|AVIS|ENTERPRISE RENT)\b/ },

  { categoryId: 'shopping', sure: true, words: /\b(AMAZON|AMZN|WALMART|WAL-MART|CANADIAN TIRE|DOLLARAMA|IKEA|HOME DEPOT|WINNERS|HOMESENSE|MARSHALLS|BEST BUY|STAPLES|RONA|LOWE'?S|OLD NAVY|H&M|ZARA|UNIQLO|INDIGO|GIANT TIGER)\b/ },

  { categoryId: 'fun', sure: true, words: /\b(CINEPLEX|TICKETMASTER|STEAM|PLAYSTATION|NINTENDO|XBOX)\b/ },
  { categoryId: 'fun', sure: false, words: /\b(CINEMA|THEATRE|THEATER|BOWLING|ARCADE|MUSEUM|ZOO|CONCERT|GOLF|ESCAPE)\b/ },

  { categoryId: 'rent', sure: false, words: /\b(RENT|PROPERTY MGMT|PROPERTY MANAGEMENT|LANDLORD|REALTY)\b/ },
  { categoryId: 'family-support', sure: false, words: /\b(REMITLY|WESTERN UNION|WISE|WORLDREMIT|MONEYGRAM)\b/ },
  { categoryId: NOT_SPENDING, sure: false, words: /\b(TRANSFER|E-?TRANSFER|WITHDRAWAL|ATM)\b/ },
];

// Offered when nothing in the merchant name gives a clue.
const FALLBACK_ORDER = ['shopping', 'groceries', 'dining', OTHER, 'fun', 'kids', 'health'];

export interface Guess {
  /** Set only when a well-known name matched. */
  sureCategoryId: string | null;
  /** Category ids to offer first, best match first. */
  suggestions: string[];
}

/** Local keyword matching only. Nothing leaves the device. */
export function guessCategory(key: string, categories: Category[]): Guess {
  const exists = new Set(categories.map((c) => c.id));
  const matched: string[] = [];
  let sure: string | null = null;
  for (const hint of HINTS) {
    if (!exists.has(hint.categoryId) || !hint.words.test(key)) continue;
    if (hint.sure && !sure) sure = hint.categoryId;
    if (!matched.includes(hint.categoryId)) matched.push(hint.categoryId);
  }
  const suggestions = [...matched];
  for (const id of FALLBACK_ORDER) {
    if (suggestions.length >= 4) break;
    if (exists.has(id) && !suggestions.includes(id)) suggestions.push(id);
  }
  return { sureCategoryId: sure, suggestions: suggestions.slice(0, 4) };
}
