import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Brain, Clock, Info, Lock, Mail, MailCheck, ShieldCheck, Upload, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../components/Toast';
import { Badge, Button, Card, EASE, Input, PnlAmount } from '../components/ui';
import { Logo } from '../components/Logo';

/** Délai avant de pouvoir demander un nouveau lien (en secondes). */
const RESEND_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = ['Ouvre le message de connexion', 'Clique sur le lien', 'Tu arrives directement dans ton journal'];

/** Courbe d’équité décorative de l’aperçu (données d’exemple, tracée à l’affichage). */
const LINE = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  const wave = Math.sin(i * 1.45) * 0.07 * (1 - t * 0.5) + Math.cos(i * 2.9) * 0.025;
  const y = (0.78 - 0.56 * t + wave) * 300;
  return `${i === 0 ? 'M' : 'L'}${(t * 640).toFixed(1)} ${y.toFixed(1)}`;
}).join(' ');
const AREA = `${LINE} L640 300 L0 300 Z`;

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: ShieldCheck, text: 'Règles de ta firme suivies à chaque trade : perte journalière, drawdown, objectif.' },
  { icon: Brain, text: 'Checklist et état émotionnel avant l’entrée, pour repérer tes erreurs.' },
  { icon: Upload, text: 'Import depuis MetaTrader 5, NinjaTrader, TradingView ou un fichier CSV.' },
];

/** Message clair pour les erreurs de connexion les plus fréquentes. */
function friendlyError(error: unknown): string {
  const message = errorMessage(error);
  if (/signups? not allowed/i.test(message)) return 'Accès réservé aux personnes invitées. Demande une invitation.';
  if (/rate limit|too many|security purposes|seconds/i.test(message)) {
    return 'Trop de demandes d’affilée. Attends une minute avant de demander un nouveau lien.';
  }
  if (/invalid.*mail|mail.*invalid/i.test(message)) return 'Cette adresse e-mail ne semble pas valide.';
  if (/failed to fetch|network/i.test(message)) return 'Connexion impossible. Vérifie ta connexion internet et réessaie.';
  return message;
}

/** 60 → « 1:00 », 42 → « 0:42 ». */
function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function LoginPage() {
  const { signInWithEmail } = useAuth();
  const reduce = useReducedMotion();
  const emailId = useId();
  const hintId = useId();
  const errorId = useId();
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Compte à rebours avant un nouvel envoi
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Après l’envoi, le focus passe au titre de l’écran suivant (lecteurs d’écran compris)
  useEffect(() => {
    if (sentTo) sentHeadingRef.current?.focus();
  }, [sentTo]);

  const send = async (address: string) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(address);
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError('Entre une adresse e-mail valide, par exemple toi@exemple.com.');
      return;
    }
    void send(address);
  };

  const useAnotherAddress = () => {
    setSentTo(null);
    setCooldown(0);
    setError(null);
  };

  const card = sentTo ? (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gain/12 text-gain"
        >
          <MailCheck className="h-6 w-6" aria-hidden />
        </motion.span>
        <div className="min-w-0">
          <h2 ref={sentHeadingRef} tabIndex={-1} className="font-serif text-3xl text-fg focus:outline-none">
            Vérifie ta boîte mail
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Un lien de connexion a été envoyé à <span className="break-all font-medium text-fg-2">{sentTo}</span>.
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-3 text-sm text-fg-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-2 bg-surface-2 text-xs font-semibold tabular-nums text-accent">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="flex gap-3 rounded-xl border border-line bg-surface-2/50 p-4 text-sm leading-relaxed text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
        <p>Rien reçu ? Vérifie les spams avant de demander un nouveau lien.</p>
      </div>

      <div className="space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          disabled={cooldown > 0}
          loading={busy}
          onClick={() => void send(sentTo)}
        >
          {cooldown > 0 && <Clock className="h-4 w-4" aria-hidden />}
          {cooldown > 0 ? `Renvoyer le lien dans ${formatCountdown(cooldown)}` : 'Renvoyer le lien'}
        </Button>
        {error && (
          <p role="alert" className="text-center text-xs leading-relaxed text-loss">
            {error}
          </p>
        )}
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={useAnotherAddress}>
            Utiliser une autre adresse
          </Button>
        </div>
      </div>

      <PrivacyLine />
    </div>
  ) : (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div>
        <h2 className="font-serif text-3xl text-fg">Connexion</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Pas de mot de passe : tu reçois un lien unique par e-mail.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={emailId} className="block text-[13px] font-medium text-fg-2">
          Adresse e-mail
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="toi@exemple.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className="pl-10"
          />
        </div>
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          Utilise l’adresse à laquelle tu as été invité.
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-xs leading-relaxed text-loss">
            {error}
          </p>
        )}
      </div>

      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        {busy ? 'Envoi du lien…' : 'Recevoir mon lien de connexion'}
        {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
      </Button>

      <p className="text-center text-xs text-muted">Pas encore invité ? Demande une invitation.</p>

      <PrivacyLine />
    </form>
  );

  return (
    <div className="app-glow flex min-h-dvh flex-col px-5 pb-12 pt-8 md:px-12 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:py-14">
      <header className="lg:col-start-1 lg:row-start-1 lg:self-start">
        <Logo size="lg" animate />

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="mt-10 font-serif text-5xl leading-[1.02] tracking-tight text-fg md:text-6xl lg:mt-14 lg:text-7xl"
        >
          Chaque trade laisse une trace.
        </motion.h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
          Statistiques, règles de ta prop firm, psychologie et revue visuelle, dans un journal privé qui ne voit que toi.
        </p>
      </header>

      <section aria-label="Connexion" className="mt-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
          className="mx-auto w-full max-w-md"
        >
          <Card className="p-6 md:p-8">{card}</Card>
        </motion.div>
      </section>

      <section className="mt-12 space-y-8 lg:col-start-1 lg:row-start-2 lg:mt-12">
        <LoginPreview />
        <ul className="grid gap-5 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, text }, index) => (
            <motion.li
              key={text}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.6, ease: EASE }}
              className="space-y-3"
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-line-2 bg-surface-2 text-accent">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-fg-2">{text}</p>
            </motion.li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Aperçu du produit avec des données d’exemple, étiquetées comme telles. */
function LoginPreview() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">P&amp;L net · aperçu</p>
          <PnlAmount value={2362.85} currency="USD" className="mt-1 block text-4xl font-semibold tracking-tight md:text-5xl" />
        </div>
        <Badge>Données d’exemple</Badge>
      </div>

      <svg viewBox="0 0 640 300" className="mt-5 w-full" role="img" aria-label="Courbe d’équité d’exemple, en progression">
        <defs>
          <linearGradient id="loginFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2b84b" stopOpacity="0.22" />
            <stop offset="1" stopColor="#f2b84b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[75, 150, 225].map((y) => (
          <line key={y} x1="0" x2="640" y1={y} y2={y} stroke="#1b2433" strokeDasharray="2 6" />
        ))}
        <motion.path
          d={AREA}
          fill="url(#loginFill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
        />
        <motion.path
          d={LINE}
          fill="none"
          stroke="#f2b84b"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.2, ease: EASE, delay: 0.3 }}
        />
      </svg>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line border-t border-line pt-4">
        <PreviewStat label="Réussite" value="57 %" />
        <PreviewStat label="Respect du plan" value="76 %" />
        <PreviewStat label="Perte du jour" value={'0,00\u00a0$'} sub={'limite 5\u00a0000\u00a0$'} />
      </dl>
    </div>
  );
}

function PreviewStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <dt className="text-xs leading-snug text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-fg">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function PrivacyLine() {
  return (
    <div className="flex items-center gap-2.5 border-t border-line pt-5 text-xs text-muted">
      <Lock className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span>Tes données sont privées : toi seul peux les consulter.</span>
    </div>
  );
}
