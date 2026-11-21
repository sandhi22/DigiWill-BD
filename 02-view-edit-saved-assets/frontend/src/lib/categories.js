import {
  BankIcon,
  ChartIncreaseIcon,
  CloudIcon,
  Mail01Icon,
  Note01Icon,
  UserGroupIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons';

/** Asset categories, with provider suggestions common in Bangladesh. */
export const CATEGORIES = [
  {
    key: 'mobile_banking',
    icon: Wallet01Icon,
    providers: ['bKash', 'Nagad', 'Rocket', 'Upay', 'mCash', 'Tap'],
  },
  {
    key: 'bank',
    icon: BankIcon,
    providers: ['Sonali Bank', 'Dutch-Bangla Bank', 'BRAC Bank', 'Islami Bank', 'City Bank', 'Eastern Bank', 'Janata Bank', 'Prime Bank'],
  },
  {
    key: 'email',
    icon: Mail01Icon,
    providers: ['Gmail', 'Outlook', 'Yahoo Mail', 'Proton Mail'],
  },
  {
    key: 'social',
    icon: UserGroupIcon,
    providers: ['Facebook', 'WhatsApp', 'Instagram', 'imo', 'YouTube', 'LinkedIn', 'X (Twitter)', 'TikTok'],
  },
  {
    key: 'cloud',
    icon: CloudIcon,
    providers: ['Google Drive', 'Google Photos', 'iCloud', 'OneDrive', 'Dropbox'],
  },
  {
    key: 'investment',
    icon: ChartIncreaseIcon,
    providers: ['BO account (CDBL)', 'Sanchayapatra', 'DPS', 'FDR', 'Life insurance', 'Provident fund'],
  },
  {
    key: 'other',
    icon: Note01Icon,
    providers: [],
  },
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const EMPTY_ASSET = { title: '', provider: '', identifier: '', secret: '', instructions: '' };

/** Show only the tail of an account number / email so a list can be read over a shoulder. */
export function maskIdentifier(value = '') {
  if (!value) return '';
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  return value.length <= 4 ? value : `•••• ${value.slice(-4)}`;
}
