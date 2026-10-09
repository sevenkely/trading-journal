import { useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Brain, Check, ShieldCheck, Upload, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage, useToast } from '../components/Toast';
import { Button, Card, EASE, Field, Input } from '../components/ui';

/** Courbe d’équité décorative (tracée à l’affichage). */
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

export default function LoginPage() {
  const { signInWithEmail } = useAuth();
  const toast = useToast();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (err) {
      const message = errorMessage(err);
      // Supabase refuse les connexions d'adresses non invitées quand les inscriptions sont fermées
      toast.show(
        /signups? not allowed/i.test(message) ? 'Accès réservé aux personnes invitées. Demande une invitation.' : message,
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-glow relative grid min-h-dvh lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex flex-col gap-12 px-6 py-10 md:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-ink shadow-lg shadow-accent/25">
            <svg
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 17l5.5-5.5 4 4L21 6.5" />
              <path d="M15 6.5h6v6" />
            </svg>
          </span>
          <span className="font-serif text-[22px] text-fg">Trading Journal</span>
        </div>

        <div className="max-w-3xl">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className="font-serif text-6xl leading-[0.98] tracking-tight text-fg md:text-7xl"
          >
            Chaque trade laisse une trace.
          </motion.h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
            Statistiques, règles de ta prop firm, psychologie et revue visuelle, dans un journal privé qui ne voit que toi.
          </p>

          <svg viewBox="0 0 640 300" className="mt-10 hidden w-full max-w-xl sm:block" aria-hidden>
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

          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.6, ease: EASE }}
                className="space-y-3"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-line-2 bg-surface-2 text-accent">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-sm leading-relaxed text-fg-2">{text}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 pb-12 lg:px-12">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
          className="w-full max-w-md"
        >
          <Card className="p-7 md:p-8">
            {sent ? (
              <div className="space-y-4 text-center">
                <motion.div
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gain/12 text-gain"
                >
                  <Check className="h-7 w-7" aria-hidden />
                </motion.div>
                <h2 className="font-serif text-3xl text-fg">Vérifie ta boîte mail</h2>
                <p className="text-sm leading-relaxed text-muted">
                  Un lien de connexion a été envoyé à <span className="text-fg-2">{email}</span>. Clique dessus pour ouvrir ton
                  journal. Pense à vérifier les spams.
                </p>
                <Button variant="ghost" onClick={() => setSent(false)} className="mx-auto">
                  Utiliser une autre adresse
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <h2 className="font-serif text-3xl text-fg">Connexion</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Entre ton email : tu reçois un lien unique, sans mot de passe.
                  </p>
                </div>
                <Field label="Adresse email">
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="toi@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="primary" className="w-full" loading={busy}>
                  Recevoir mon lien de connexion
                </Button>
                <p className="text-center text-xs text-muted">Accès sur invitation uniquement.</p>
              </form>
            )}
          </Card>
        </motion.div>
      </section>
    </div>
  );
}
