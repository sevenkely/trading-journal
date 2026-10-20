import { useConfirm } from '../components/ConfirmDialog';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useProfile, useRefresh, useRepo, useSetups } from '../data/hooks';
import { buildBackup, parseBackup, planRestore, restoreBackup, type BackupFile, type RestorePlan } from '../lib/backup';
import { loadDemoData } from '../lib/demoData';
import { dayKey, formatDateTime } from '../lib/format';
import { CURRENCIES, DEFAULT_CHECKLIST, TIMEZONES } from '../lib/constants';
import { normalizeSetupName } from '../lib/setups';
import type { Profile, SetupInput } from '../lib/types';
import { errorMessage, useToast } from '../components/Toast';
import { usePalette } from '../components/PaletteContext';
import { PALETTE_LABELS, PALETTE_NAMES } from '../lib/palette';
import { applyDisplayPrefs, readDisplayPrefs, safeStorage, writeDisplayPrefs, type DisplayPrefs } from '../lib/display';
import {
  ALERT_LEVELS,
  ALERT_LEVEL_LABELS,
  ALERT_SETTINGS_KEY,
  parseAlertSettings,
  serializeAlertSettings,
  webhookBody,
  type AlertPayload,
  type AlertSettings,
} from '../lib/alerts';
import { postAlert } from '../components/useRuleAlerts';
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Segmented, Select, SectionTitle } from '../components/ui';

export default function SettingsPage() {
  const { data: profile, isLoading } = useProfile();
  if (isLoading || !profile) return <Loading />;
  return <SettingsForm key={profile.id} profile={profile} />;
}

function SettingsForm({ profile }: { profile: Profile }) {
  const palette = usePalette();
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const { mode, email, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [timezone, setTimezone] = useState(profile.default_timezone);
  const [currency, setCurrency] = useState(profile.default_currency);
  const [checklist, setChecklist] = useState<string[]>(profile.checklist);
  const [newItem, setNewItem] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<{ backup: BackupFile; plan: RestorePlan } | null>(null);

  const download = useMutation({
    mutationFn: async () => {
      const [accounts, trades, notes] = await Promise.all([repo.listAccounts(), repo.listTrades(), repo.listDailyNotes()]);
      return buildBackup(accounts, trades, notes);
    },
    onSuccess: (backup) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `trading-journal-sauvegarde-${dayKey(new Date(), profile.default_timezone)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.show(
        `Sauvegarde téléchargée : ${backup.accounts.length} compte(s), ${backup.trades.length} trade(s), ${backup.notes.length} note(s)`,
      );
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  /** Lit le fichier choisi et calcule l’aperçu ; rien n’est écrit tant que l’utilisateur ne confirme pas. */
  const readFile = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const [accounts, trades, notes] = await Promise.all([repo.listAccounts(), repo.listTrades(), repo.listDailyNotes()]);
      setPlan({ backup, plan: planRestore(backup, accounts, trades, notes) });
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  const restore = useMutation({
    // Le plan est recalculé à la confirmation : les données ont pu changer depuis l’aperçu.
    mutationFn: async (backup: BackupFile) => {
      const [accounts, trades, notes] = await Promise.all([repo.listAccounts(), repo.listTrades(), repo.listDailyNotes()]);
      return restoreBackup(repo, planRestore(backup, accounts, trades, notes));
    },
    onSuccess: async (result) => {
      setPlan(null);
      await refresh();
      toast.show(
        `Restauration terminée : ${result.accountsCreated} compte(s) créé(s), ${result.tradesAdded} trade(s) ajouté(s), ${result.notesRestored} note(s) restaurée(s)`,
      );
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const createdAccounts = plan ? plan.plan.accounts.filter((a) => !a.existingId).length : 0;
  const reusedAccounts = plan ? plan.plan.accounts.length - createdAccounts : 0;
  const nothingToAdd =
    plan !== null && createdAccounts === 0 && plan.plan.trades.length === 0 && plan.plan.notes.length === 0;

  const save = useMutation({
    mutationFn: () =>
      repo.updateProfile({
        display_name: displayName.trim() || null,
        default_timezone: timezone,
        default_currency: currency,
        checklist,
      }),
    onSuccess: async () => {
      await refresh();
      toast.show('Paramètres enregistrés');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const sample = useMutation({
    mutationFn: () => loadDemoData(repo),
    onSuccess: async () => {
      await refresh();
      toast.show('Données d’exemple chargées');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const addItem = () => {
    const value = newItem.trim();
    if (!value || checklist.includes(value)) return;
    setChecklist([...checklist, value]);
    setNewItem('');
  };

  const loadSample = async () => {
    const ok = await confirm({
      title: 'Ajouter des données d’exemple ?',
      description: 'Deux comptes, des trades sur deux semaines et des notes.',
      confirmLabel: 'Ajouter',
    });
    if (ok) sample.mutate();
  };

  const resetDemo = async () => {
    const ok = await confirm({
      title: 'Effacer les données du mode démo ?',
      description: 'Tout ce qui est enregistré sur ce navigateur sera supprimé.',
      confirmLabel: 'Tout effacer',
      danger: true,
    });
    if (!ok) return;
    Object.keys(localStorage)
      .filter((k) => k.startsWith('tj-demo:'))
      .forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <>
      <PageHeader title="Paramètres" description="Préférences, checklist pré-trade et gestion des données." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-6">
          <SectionTitle title="Profil & préférences" />
          <Field label="Nom affiché">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ton prénom ou pseudo" />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Fuseau par défaut" hint="Utilisé pour découper les journées (les comptes peuvent avoir le leur).">
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {[...new Set([timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Devise par défaut" hint="Pour les nouveaux comptes.">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {[...new Set([currency, ...CURRENCIES])].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="space-y-2">
            <div className="text-[13px] text-muted">Couleurs des gains et des pertes</div>
            <Segmented
              id="palette"
              label="Couleurs des gains et des pertes"
              options={PALETTE_NAMES.map((name) => ({ value: name, label: PALETTE_LABELS[name] }))}
              value={palette.name}
              onChange={palette.setName}
            />
            <p className="text-xs leading-relaxed text-muted">
              Enregistré sur cet appareil. Le bleu et l’orange restent distinguables avec un daltonisme rouge-vert.
            </p>
          </div>
          <DisplayControls />
          <AlertControls />
          <div className="flex justify-end">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Enregistrer
            </Button>
          </div>
        </Card>

        <Card className="space-y-6">
          <SectionTitle
            title="Checklist pré-trade"
            description="Les points à valider avant chaque entrée. Ils apparaissent dans le formulaire de trade."
            action={
              <Button size="sm" variant="ghost" onClick={() => setChecklist([...DEFAULT_CHECKLIST])}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Par défaut
              </Button>
            }
          />
          {checklist.length === 0 ? (
            <p className="text-sm text-muted">Aucun point. Ajoute tes critères ci-dessous.</p>
          ) : (
            <ul className="space-y-2">
              {checklist.map((item, i) => (
                <li
                  key={`${item}-${i}`}
                  className="flex items-center gap-2 rounded-xl border border-line-2 bg-surface-2/50 px-3.5 py-2.5 text-sm text-fg-2"
                >
                  <span className="flex-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-loss"
                    aria-label={`Retirer « ${item} »`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }}
          >
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Nouveau critère…"
              aria-label="Nouveau critère de la checklist"
            />
            <Button type="submit" disabled={!newItem.trim()}>
              <Plus className="h-4 w-4" aria-hidden />
              Ajouter
            </Button>
          </form>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Enregistre la checklist après modification.</p>
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
              Enregistrer la checklist
            </Button>
          </div>
        </Card>

        <Card className="space-y-5">
          <SectionTitle title="Compte & accès" />
          {mode === 'supabase' ? (
            <>
              <p className="text-sm leading-relaxed text-muted">
                Connecté en tant que <span className="text-fg-2">{email}</span>. Tes données sont privées : aucun autre utilisateur
                ne peut les lire.
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Les inscriptions sont réservées aux personnes invitées (inscriptions publiques désactivées dans Supabase).
              </p>
              <div>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Se déconnecter
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Mode démo : les données sont stockées uniquement dans ce navigateur. Configure Supabase pour un compte réel et une
              synchronisation entre appareils.
            </p>
          )}
        </Card>

        <SetupsCard />

        <Card className="space-y-6 lg:col-span-2">
          <SectionTitle title="Données" description="Sauvegarde, restauration et jeu d’exemple." />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-fg">Sauvegarde</h3>
              <p className="text-sm leading-relaxed text-muted">
                Un fichier JSON avec tes comptes, tes trades et tes notes. Les captures d’écran ne sont pas incluses.
              </p>
              <Button variant="secondary" loading={download.isPending} onClick={() => download.mutate()}>
                <Download className="h-4 w-4" aria-hidden />
                Télécharger une sauvegarde
              </Button>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-fg">Restauration</h3>
              <p className="text-sm leading-relaxed text-muted">
                Importe un fichier de sauvegarde. Les comptes sont reconnus par leur nom, les trades déjà présents ne sont pas ajoutés
                une seconde fois, et les notes d’un jour déjà renseigné ne sont jamais écrasées. Rien n’est supprimé.
              </p>
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden />
                Choisir un fichier…
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                aria-label="Fichier de sauvegarde à restaurer"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void readFile(file);
                }}
              />
            </div>
          </div>

          {plan && (
            <div className="rounded-2xl border border-accent/25 bg-accent/[0.05] p-5">
              <div className="text-sm font-medium text-fg">Aperçu de la restauration</div>
              <p className="mt-1 text-xs text-muted">
                Sauvegarde du {plan.backup.exportedAt ? formatDateTime(plan.backup.exportedAt) : 'date inconnue'}.
              </p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted">Comptes</dt>
                  <dd className="mt-1 text-sm text-fg-2">
                    {createdAccounts} à créer · {reusedAccounts} reconnu(s)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Trades</dt>
                  <dd className="mt-1 text-sm text-fg-2">
                    {plan.plan.trades.length} à ajouter · {plan.plan.skippedTrades} déjà présent(s)
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Notes</dt>
                  <dd className="mt-1 text-sm text-fg-2">
                    {plan.plan.notes.length} à restaurer · {plan.plan.skippedNotes} déjà renseignée(s)
                  </dd>
                </div>
              </dl>
              {nothingToAdd && (
                <p className="mt-4 text-xs text-muted">Rien de nouveau : cette sauvegarde est déjà dans le journal.</p>
              )}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button onClick={() => setPlan(null)}>Annuler</Button>
                <Button
                  variant="primary"
                  loading={restore.isPending}
                  disabled={nothingToAdd}
                  onClick={() => restore.mutate(plan.backup)}
                >
                  Restaurer
                </Button>
              </div>
            </div>
          )}

          {mode === 'local' ? (
            <div className="space-y-3 border-t border-line pt-6">
              <h3 className="text-sm font-medium text-fg">Mode démo</h3>
              <p className="text-sm leading-relaxed text-muted">
                Charge un jeu d’exemple pour découvrir l’application : deux comptes, une quinzaine de jours de trades et des notes.
                Tu peux l’effacer ensuite.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={sample.isPending} onClick={loadSample}>
                  Charger des données d’exemple
                </Button>
                <Button variant="danger" onClick={resetDemo}>
                  Réinitialiser le mode démo
                </Button>
              </div>
            </div>
          ) : (
            <p className="border-t border-line pt-6 text-xs leading-relaxed text-muted">
              Tes données sont stockées dans ton projet Supabase et ne sont lisibles que par toi.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

/** Densité des tableaux et thème : enregistrés sur cet appareil et appliqués tout de suite. */
function DisplayControls() {
  const [prefs, setPrefs] = useState<DisplayPrefs>(() => readDisplayPrefs(safeStorage()));
  const update = (next: DisplayPrefs) => {
    setPrefs(next);
    writeDisplayPrefs(next, safeStorage());
    applyDisplayPrefs(next, document.documentElement);
  };
  return (
    <>
      <div className="space-y-2">
        <div className="text-[13px] text-muted">Densité des tableaux</div>
        <Segmented
          id="density"
          label="Densité des tableaux"
          options={[
            { value: 'confortable', label: 'Confortable' },
            { value: 'compact', label: 'Compact' },
          ]}
          value={prefs.density}
          onChange={(density) => update({ ...prefs, density })}
        />
      </div>
      <div className="space-y-2">
        <div className="text-[13px] text-muted">Thème</div>
        <Segmented
          id="theme"
          label="Thème"
          options={[
            { value: 'sombre', label: 'Sombre' },
            { value: 'clair', label: 'Clair' },
          ]}
          value={prefs.theme}
          onChange={(theme) => update({ ...prefs, theme })}
        />
        <p className="text-xs leading-relaxed text-muted">Enregistré sur cet appareil.</p>
      </div>
    </>
  );
}

/** Alertes de règles : notification du navigateur et webhook, réglés sur cet appareil. */
function AlertControls() {
  const storage = safeStorage();
  const [settings, setSettings] = useState<AlertSettings>(() =>
    parseAlertSettings(storage?.getItem(ALERT_SETTINGS_KEY) ?? null),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const update = (next: AlertSettings) => {
    setSettings(next);
    try {
      storage?.setItem(ALERT_SETTINGS_KEY, serializeAlertSettings(next));
    } catch {
      // Stockage indisponible : le réglage vaut pour cette session.
    }
  };

  const setBrowser = async (value: string) => {
    setMessage(null);
    if (value === 'off') {
      update({ ...settings, browser: false });
      return;
    }
    if (typeof Notification === 'undefined') {
      setMessage('Ce navigateur ne gère pas les notifications.');
      return;
    }
    const granted = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
    if (granted) update({ ...settings, browser: true });
    else setMessage('Autorisation refusée : les alertes du navigateur restent désactivées.');
  };

  const testWebhook = async () => {
    setTesting(true);
    const payload: AlertPayload = {
      accountId: 'test',
      accountName: 'Test',
      level: 'danger',
      gauge: 'overall',
      title: 'Test d’alerte',
      body: 'Si tu lis ceci, le webhook est bien branché.',
    };
    const ok = await postAlert(settings.webhookUrl, webhookBody(payload, dayKey(new Date(), 'UTC')));
    setTesting(false);
    setMessage(ok ? 'Webhook joignable.' : 'Le webhook n’a pas répondu correctement. Vérifie l’URL.');
  };

  return (
    <div className="space-y-4 border-t border-line pt-5">
      <div>
        <div className="text-sm font-medium text-fg">Alertes de règles</div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Préviens-moi quand une limite approche. Une alerte ne sort qu’une fois par seuil et par jour, et
          seulement quand l’application est ouverte.
        </p>
      </div>
      <div className="space-y-2">
        <div className="text-[13px] text-muted">Notification du navigateur</div>
        <Segmented
          id="alerts-browser"
          label="Notification du navigateur"
          options={[
            { value: 'off', label: 'Désactivées' },
            { value: 'on', label: 'Activées' },
          ]}
          value={settings.browser ? 'on' : 'off'}
          onChange={(value) => void setBrowser(value)}
        />
      </div>
      <Field label="Webhook" hint="POST JSON à chaque alerte (bot Telegram, relais maison…). Vide = désactivé.">
        <div className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            placeholder="https://…"
            aria-label="URL du webhook"
            value={settings.webhookUrl}
            onChange={(e) => update({ ...settings, webhookUrl: e.target.value })}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!settings.webhookUrl}
            loading={testing}
            onClick={() => void testWebhook()}
          >
            Tester
          </Button>
        </div>
      </Field>
      <div className="space-y-2">
        <div className="text-[13px] text-muted">Niveau minimal</div>
        <Segmented
          id="alerts-level"
          label="Niveau minimal d’alerte"
          options={ALERT_LEVELS.map((level) => ({ value: level, label: ALERT_LEVEL_LABELS[level] }))}
          value={settings.minLevel}
          onChange={(minLevel) => update({ ...settings, minLevel })}
        />
      </div>
      {message && <p className="text-xs leading-relaxed text-accent-hi">{message}</p>}
    </div>
  );
}

/**
 * Bibliothèque de setups : le même motif écrit une fois. Un setup supprimé ne touche pas
 * l’historique : les trades gardent leur libellé, seul le lien disparaît.
 */
function SetupsCard() {
  const repo = useRepo();
  const refresh = useRefresh();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useSetups();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: (input: SetupInput) => repo.createSetup(input),
    onSuccess: async (created) => {
      setName('');
      await refresh();
      toast.show(`Setup « ${created.name} » ajouté à la bibliothèque`);
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => repo.deleteSetup(id),
    onSuccess: async () => {
      await refresh();
      toast.show('Setup retiré de la bibliothèque');
    },
    onError: (e) => toast.show(errorMessage(e), 'error'),
  });

  const setups = data ?? [];
  const valid = normalizeSetupName(name);

  return (
    <Card className="space-y-5 lg:col-span-2">
      <SectionTitle
        title="Bibliothèque de setups"
        description="Un motif écrit une fois, puis mesuré sur tous les trades qui le suivent."
        action={<Badge tone={setups.length > 0 ? 'accent' : 'neutral'}>{setups.length} setup{setups.length > 1 ? 's' : ''}</Badge>}
      />

      {isLoading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : setups.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Aucun setup pour l’instant. Crée le premier ci-dessous, ou directement depuis un trade : le champ Setup propose
          « ＋ Nouveau setup… ».
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {setups.map((setup) => (
            <li key={setup.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{setup.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {setup.htf ?? setup.description ?? 'Aucun contexte décrit'}
                  {setup.checklist.length > 0 ? ` · ${setup.checklist.length} point(s) de checklist` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                className="shrink-0 text-loss hover:text-loss"
                aria-label={`Supprimer le setup ${setup.name}`}
                onClick={async () => {
                  const ok = await confirm({
                    title: `Supprimer « ${setup.name} » ?`,
                    description:
                      'Les trades gardent leur libellé : seul le lien vers la bibliothèque disparaît. Rien d’autre n’est supprimé.',
                    confirmLabel: 'Supprimer le setup',
                    danger: true,
                  });
                  if (ok) remove.mutate(setup.id);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-2 border-t border-line pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          create.mutate({ name: valid, description: null, htf: null, invalidation: null, checklist: [] });
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="Nouveau setup">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex. Sweep de liquidité + FVG"
            />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={create.isPending} disabled={!valid}>
          <Plus className="h-4 w-4" aria-hidden />
          Ajouter
        </Button>
      </form>
    </Card>
  );
}
