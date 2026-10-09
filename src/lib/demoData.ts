import type { Repo } from './repo';
import { dayKey } from './format';
import { DEFAULT_CHECKLIST } from './constants';
import { sessionForDate } from './metrics';
import type { DailyNoteInput, TradeInput } from './types';
import { round2 } from './utils';

/**
 * Jeu de données d’exemple (mode démo uniquement) : deux comptes, une quinzaine de jours
 * de trades et quelques notes. Généré de façon déterministe, avec des dates récentes.
 */
const TZ = 'Indian/Antananarivo';
const DAY_MS = 86_400_000;

const INSTRUMENTS = ['EURUSD', 'NQ', 'XAUUSD', 'GBPJPY'];
const SETUPS = ['Cassure de range', 'Pullback 1h', 'Faux breakout', 'Retour à la moyenne'];
const EMOTIONS = ['Calme', 'Confiance', 'Patience', 'Doute', 'Peur', 'Euphorie', 'Frustration'];
const MISTAKES = ['Entrée sans setup', 'Sortie trop tôt', 'Stop déplacé', 'Overtrading'];
/** Résultats exprimés en multiples du risque (R) */
const OUTCOMES_R = [-1, -1, -0.5, 0.5, 1, 1.5, 2, -1, 1, -1];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function loadDemoData(repo: Repo): Promise<void> {
  const rand = seeded(20261009);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const now = Date.now();

  const challenge = await repo.createAccount({
    name: 'FTMO 100k · Phase 1',
    kind: 'evaluation',
    status: 'active',
    firm: 'FTMO',
    platform: 'MetaTrader 5',
    currency: 'USD',
    initial_balance: 100000,
    day_timezone: TZ,
    daily_loss_amount: null,
    daily_loss_pct: 5,
    max_loss_amount: null,
    max_loss_pct: 10,
    drawdown_type: 'trailing',
    profit_target_amount: null,
    profit_target_pct: 10,
    min_trading_days: 4,
    consistency_pct: 90,
  });

  const personal = await repo.createAccount({
    name: 'Compte perso',
    kind: 'personal',
    status: 'active',
    firm: null,
    platform: 'TradingView',
    currency: 'USD',
    initial_balance: 5000,
    day_timezone: TZ,
    daily_loss_amount: null,
    daily_loss_pct: null,
    max_loss_amount: null,
    max_loss_pct: null,
    drawdown_type: 'static',
    profit_target_amount: null,
    profit_target_pct: null,
    min_trading_days: 0,
    consistency_pct: null,
  });

  // Les 14 derniers jours, sans week-end
  const startOfWindow = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() - 13);
  const inputs: TradeInput[] = [];

  for (let day = 0; day < 14; day++) {
    const dayStart = startOfWindow + day * DAY_MS;
    const weekday = new Date(dayStart).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const perDay = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < perDay; k++) {
      const onChallenge = rand() < 0.7;
      const risk = onChallenge ? 450 : 90;
      const opened = new Date(dayStart + (7 + rand() * 10) * 3_600_000);
      const closed = new Date(opened.getTime() + (12 + rand() * 180) * 60_000);
      const r = pick(OUTCOMES_R);
      const gross = round2(r * risk + (rand() - 0.5) * risk * 0.15);
      const fees = round2(onChallenge ? 4 + rand() * 4 : 1 + rand() * 1.5);
      const planRespected = rand() < 0.72;

      inputs.push({
        account_id: onChallenge ? challenge.id : personal.id,
        instrument: pick(INSTRUMENTS),
        direction: rand() < 0.5 ? 'long' : 'short',
        opened_at: opened.toISOString(),
        closed_at: closed.toISOString(),
        entry_price: null,
        exit_price: null,
        stop_loss: null,
        take_profit: null,
        size: round2(0.5 + rand() * 2),
        risk_amount: risk,
        gross_pnl: gross,
        fees,
        session: sessionForDate(opened.toISOString()),
        setup: pick(SETUPS),
        timeframe: pick(['M5', 'M15', 'H1']),
        emotions_before: [pick(EMOTIONS)],
        emotions_after: [gross >= 0 ? 'Calme' : pick(['Frustration', 'Doute'])],
        plan_respected: planRespected,
        mistakes: gross < 0 && rand() < 0.45 ? [pick(MISTAKES)] : [],
        checklist_done: planRespected ? DEFAULT_CHECKLIST.slice(0, 4) : [],
        notes: null,
        tags: [],
        source: 'manual',
        external_id: null,
        import_batch_id: null,
      });
    }
  }

  await repo.insertTrades(inputs);

  const notes: DailyNoteInput[] = [
    {
      date: dayKey(new Date(now - DAY_MS), TZ),
      mood: 4,
      rating: 4,
      plan: 'Biais haussier sur l’indice, pas de trade avant 10 h.',
      review: 'Une seule entrée propre, sortie au plan.',
      lessons: 'Attendre la confirmation avant d’entrer.',
    },
    {
      date: dayKey(new Date(now - 3 * DAY_MS), TZ),
      mood: 2,
      rating: 2,
      plan: null,
      review: 'Deux trades pris par impatience après une perte.',
      lessons: 'Stopper après deux pertes consécutives.',
    },
    {
      date: dayKey(new Date(now - 6 * DAY_MS), TZ),
      mood: 3,
      rating: 3,
      plan: 'Limiter à trois trades.',
      review: null,
      lessons: null,
    },
  ];
  for (const note of notes) {
    await repo.upsertDailyNote(note);
  }
}
