import type { Gauge, Level, RuleReport } from './rules';
import { formatMoney, formatPercent } from './format';

/**
 * Alertes sortantes de règles : notification du navigateur et/ou webhook.
 *
 * Le déclenchement est *à front* : une alerte ne part que lorsque le niveau d'une jauge
 * **monte** (50 % → 80 % → 100 %). Ce qui a déjà été notifié est mémorisé pour la journée,
 * et remis à zéro le lendemain. Sans cette mémoire, l'application renverrait la même alerte
 * à chaque rendu.
 *
 * Une alerte n'est émise que si l'application est ouverte : pour un envoi permanent,
 * il faut un service côté serveur (Edge Function et planification).
 */

export const ALERT_SETTINGS_KEY = 'tj-alerts-settings';
export const ALERT_STATE_KEY = 'tj-alerts-state';

export const RANK: Record<Level, number> = { ok: 0, warning: 1, danger: 2, breached: 3 };

export const ALERT_LEVELS = ['warning', 'danger', 'breached'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  warning: 'Attention (50 %)',
  danger: 'Danger (80 %)',
  breached: 'Règle enfreinte (100 %)',
};

export interface AlertSettings {
  /** Notification du navigateur (autorisation demandée au moment de l'activation) */
  browser: boolean;
  /** URL appelée en POST JSON, par exemple un bot Telegram ou un relais maison. Vide = désactivé. */
  webhookUrl: string;
  /** Niveau à partir duquel une alerte sort */
  minLevel: AlertLevel;
  /** Identifiants de comptes à ne pas surveiller */
  muted: string[];
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  browser: false,
  webhookUrl: '',
  minLevel: 'danger',
  muted: [],
};

function isAlertLevel(value: unknown): value is AlertLevel {
  return typeof value === 'string' && (ALERT_LEVELS as readonly string[]).includes(value);
}

/** Lit les réglages enregistrés ; toute valeur douteuse retombe sur le défaut. */
export function parseAlertSettings(raw: string | null): AlertSettings {
  if (!raw) return DEFAULT_ALERT_SETTINGS;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return DEFAULT_ALERT_SETTINGS;
    const record = value as Record<string, unknown>;
    return {
      browser: record.browser === true,
      webhookUrl: typeof record.webhookUrl === 'string' ? record.webhookUrl.trim() : '',
      minLevel: isAlertLevel(record.minLevel) ? record.minLevel : DEFAULT_ALERT_SETTINGS.minLevel,
      muted: Array.isArray(record.muted) ? record.muted.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return DEFAULT_ALERT_SETTINGS;
  }
}

export function serializeAlertSettings(settings: AlertSettings): string {
  return JSON.stringify(settings);
}

/** Mémoire des alertes déjà émises : clé `jour|compte|jauge` → niveau notifié. */
export type AlertState = Record<string, Level>;

export function parseAlertState(raw: string | null): AlertState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return {};
    const state: AlertState = {};
    for (const [key, level] of Object.entries(value as Record<string, unknown>)) {
      if (typeof level === 'string' && level in RANK) state[key] = level as Level;
    }
    return state;
  } catch {
    return {};
  }
}

/** Ne garde que les entrées du jour : la mémoire repart de zéro chaque journée de trading. */
export function pruneAlertState(state: AlertState, day: string): AlertState {
  const prefix = `${day}|`;
  return Object.fromEntries(Object.entries(state).filter(([key]) => key.startsWith(prefix)));
}

export function alertKey(day: string, accountId: string, gauge: string): string {
  return `${day}|${accountId}|${gauge}`;
}

export interface AlertPayload {
  accountId: string;
  accountName: string;
  level: Level;
  gauge: string;
  title: string;
  body: string;
}

/** Phrase d'une jauge : marge restante d'un côté, seuil de l'autre. */
export function alertBody(gauge: Gauge, currency: string): string {
  const used = gauge.unit === 'money' ? formatMoney(gauge.value, currency) : formatPercent(gauge.value);
  const limit = gauge.unit === 'money' ? formatMoney(gauge.limit, currency) : formatPercent(gauge.limit);
  if (gauge.kind === 'progress') return `Objectif atteint : ${used} sur ${limit}.`;
  if (gauge.remaining === null) return `Utilisé ${used} sur ${limit}.`;
  if (gauge.remaining >= 0) return `Utilisé ${used} sur ${limit} · marge restante ${formatMoney(gauge.remaining, currency)}.`;
  return `Dépassé de ${formatMoney(-gauge.remaining, currency)} (utilisé ${used} sur ${limit}).`;
}

export interface AccountReport {
  accountId: string;
  accountName: string;
  currency: string;
  report: RuleReport;
}

/**
 * Alertes à émettre maintenant, et mémoire mise à jour.
 * Une jauge ne déclenche qu'une fois par niveau et par jour, et seulement si son niveau monte.
 */
export function pendingAlerts(
  entries: AccountReport[],
  day: string,
  settings: AlertSettings,
  state: AlertState,
): { alerts: AlertPayload[]; state: AlertState } {
  const min = RANK[settings.minLevel];
  const next: AlertState = { ...pruneAlertState(state, day) };
  const alerts: AlertPayload[] = [];

  for (const { accountId, accountName, currency, report } of entries) {
    if (settings.muted.includes(accountId)) continue;
    for (const gauge of report.gauges) {
      if (RANK[gauge.level] < min) continue;
      const key = alertKey(day, accountId, gauge.key);
      const already = next[key];
      if (already && RANK[already] >= RANK[gauge.level]) continue;
      next[key] = gauge.level;
      alerts.push({
        accountId,
        accountName,
        level: gauge.level,
        gauge: gauge.key,
        title: `${accountName} · ${gauge.label}`,
        body: alertBody(gauge, currency),
      });
    }
    if (RANK[report.overall] >= min) {
      const key = alertKey(day, accountId, 'overall');
      const already = next[key];
      if (!already || RANK[already] < RANK[report.overall]) {
        next[key] = report.overall;
        alerts.push({
          accountId,
          accountName,
          level: report.overall,
          gauge: 'overall',
          title: `${accountName} · ${report.alerts[0] ?? 'Une règle demande ton attention'}`,
          body: report.alerts.slice(0, 3).join(' · ') || 'Ouvre le tableau de bord pour le détail.',
        });
      }
    }
  }

  return { alerts, state: next };
}

/** Corps JSON envoyé au webhook : plat, sans secret, pour rester lisible dans un relais. */
export function webhookBody(alert: AlertPayload, day: string): string {
  return JSON.stringify({
    type: 'trading-journal.rule-alert',
    day,
    account: alert.accountName,
    gauge: alert.gauge,
    level: alert.level,
    title: alert.title,
    message: alert.body,
  });
}
