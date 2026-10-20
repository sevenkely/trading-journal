import type { ImportSource } from './types';

export const DEFAULT_TIMEZONE = 'Indian/Antananarivo';
export const DEFAULT_CURRENCY = 'USD';

export const ACCOUNT_KINDS = [
  { value: 'personal', label: 'Compte personnel' },
  { value: 'evaluation', label: 'Challenge / évaluation' },
  { value: 'funded', label: 'Compte financé' },
] as const;

export const ACCOUNT_STATUSES = [
  { value: 'active', label: 'Actif' },
  { value: 'passed', label: 'Validé' },
  { value: 'failed', label: 'Échoué' },
  { value: 'archived', label: 'Archivé' },
] as const;

export const PROP_FIRMS = ['FTMO', 'Topstep', 'Apex Trader Funding', 'The5ers', 'FundedNext', 'MyFundedFX', 'E8 Funding'];
export const PLATFORMS = ['MetaTrader 5', 'MetaTrader 4', 'cTrader', 'NinjaTrader', 'Tradovate', 'TradingView'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'MGA'];
export const TIMEZONES = [
  'Indian/Antananarivo',
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'Europe/Athens',
  'America/New_York',
  'America/Chicago',
  'Asia/Tokyo',
];

export const SESSIONS = ['Asie', 'Londres', 'Londres/New York', 'New York', 'Hors session'];
export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'Autre'];

export const EMOTIONS = [
  'Calme',
  'Confiance',
  'Patience',
  'Doute',
  'Peur',
  'Avidité',
  'FOMO',
  'Frustration',
  'Revanche',
  'Euphorie',
  'Fatigue',
  'Ennui',
];

export const MISTAKES = [
  'Entrée sans setup',
  'Sortie trop tôt',
  'Stop non respecté',
  'Stop déplacé',
  'Taille trop grande',
  'Overtrading',
  'Contre-tendance',
  'Revenge trade',
  'Règle prop firm ignorée',
  'Trade pendant une news',
];

/** Ce qui a confirmé l'entrée. Coché sur le trade, mesuré ensuite par l'analyse. */
export const CONFLUENCES = [
  'Biais HTF aligné',
  'Zone HTF (FVG, order block)',
  'Niveau clé (PDH/PDL, chiffre rond)',
  'Sweep de liquidité',
  'BOS / CHoCH',
  'Retest accepté',
  'Volume au niveau',
  'Session active (ouverture NY / Londres)',
  'Trigger LTF net',
  'News écartée',
];

export const DEFAULT_CHECKLIST = [
  'Biais directionnel défini (HTF)',
  'Setup conforme à mon plan',
  'Stop-loss défini avant l’entrée',
  'Risque dans ma limite par trade',
  'Pas de news à fort impact proche',
  'État émotionnel calme',
];

export const MOOD_LABELS: Record<number, string> = {
  1: 'Très mauvais',
  2: 'Mauvais',
  3: 'Neutre',
  4: 'Bon',
  5: 'Très bon',
};

export const IMPORT_SOURCES: Record<
  ImportSource,
  { label: string; accept: string; timezone: string; dateOrder: 'auto' | 'dmy' | 'mdy' | 'ymd'; help: string }
> = {
  mt5: {
    label: 'MetaTrader 5 (rapport HTML)',
    accept: '.html,.htm',
    timezone: 'Europe/Athens',
    dateOrder: 'ymd',
    help: 'Exporte l’historique du compte depuis MT5 en rapport HTML (onglet Historique → clic droit → Enregistrer comme rapport). Les heures sont celles du serveur du broker : vérifie le fuseau.',
  },
  ninjatrader: {
    label: 'NinjaTrader / Tradovate (CSV)',
    accept: '.csv,.txt',
    timezone: 'America/New_York',
    dateOrder: 'mdy',
    help: 'Fichier CSV exporté depuis la plateforme. Vérifie le mapping des colonnes avant d’importer.',
  },
  tradingview: {
    label: 'TradingView (CSV)',
    accept: '.csv,.txt',
    timezone: 'UTC',
    dateOrder: 'auto',
    help: 'Fichier CSV d’historique de trades exporté depuis TradingView. Vérifie le mapping des colonnes avant d’importer.',
  },
  csv: {
    label: 'CSV générique',
    accept: '.csv,.txt',
    timezone: 'UTC',
    dateOrder: 'auto',
    help: 'Pour tout autre fichier CSV : associe chaque colonne au bon champ.',
  },
};
