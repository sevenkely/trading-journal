import { useEffect, useRef } from 'react';
import {
  ALERT_SETTINGS_KEY,
  ALERT_STATE_KEY,
  parseAlertSettings,
  parseAlertState,
  pendingAlerts,
  webhookBody,
  type AccountReport,
  type AlertState,
} from '../lib/alerts';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la mémoire des alertes vaut pour cette session seulement.
  }
}

/** Envoie une alerte au webhook configuré. Un échec réseau ne doit jamais casser la page. */
export async function postAlert(webhookUrl: string, body: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Émet les alertes de règles qui viennent de franchir un seuil (notification du navigateur
 * et/ou webhook). À appeler une seule fois par rendu d'application, avec tous les comptes.
 */
export function useRuleAlerts(entries: AccountReport[], day: string): void {
  const latest = useRef(entries);
  latest.current = entries;
  const state = useRef<AlertState>(parseAlertState(readStorage(ALERT_STATE_KEY)));

  // Signature stable : l'effet ne se relance que quand un niveau change, pas à chaque rendu.
  const signature = entries
    .map((e) => `${e.accountId}:${e.report.overall}:${e.report.gauges.map((g) => `${g.key}=${g.level}`).join(',')}`)
    .join('|');

  useEffect(() => {
    const settings = parseAlertSettings(readStorage(ALERT_SETTINGS_KEY));
    const result = pendingAlerts(latest.current, day, settings, state.current);
    state.current = result.state;
    writeStorage(ALERT_STATE_KEY, JSON.stringify(result.state));
    if (result.alerts.length === 0) return;

    const canNotify =
      settings.browser && typeof Notification !== 'undefined' && Notification.permission === 'granted';

    for (const alert of result.alerts) {
      if (canNotify) {
        new Notification(alert.title, { body: alert.body, tag: `${alert.accountId}-${alert.gauge}` });
      }
      if (settings.webhookUrl) void postAlert(settings.webhookUrl, webhookBody(alert, day));
    }
  }, [day, signature]);
}
