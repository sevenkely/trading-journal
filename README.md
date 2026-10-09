# Trading Journal

Journal de trading personnel et prop firm : statistiques, règles de la firme, discipline et revue visuelle.
Stack : **React + TypeScript**, **Vite**, **Tailwind CSS**, **Supabase** (Postgres, Auth par lien magique, RLS, Storage) et **Vercel**.

## Fonctionnalités

- **Comptes** : personnel, challenge (évaluation) ou compte financé, avec firme, plateforme et devise (USD par défaut, configurable par compte).
- **Trades** : saisie manuelle, ou import depuis MetaTrader 5, NinjaTrader / Tradovate et TradingView. Les doublons sont ignorés, et un import peut être annulé.
- **Statistiques** : P&L net, taux de réussite, profit factor, espérance, R multiple, drawdown réalisé, courbe d’équité, respect du plan.
- **Règles prop firm** (par compte) : perte journalière, drawdown maximum (statique ou trailing), objectif de profit, jours de trading minimum, règle de cohérence. Alertes à 50 %, 80 % et 100 % de chaque limite.
- **Psychologie** : émotions avant et après le trade, erreurs commises, plan respecté, checklist pré-trade personnalisable, notes et tags.
- **Revue visuelle** : captures d’écran par trade (stockage privé Supabase).
- **Journal** : calendrier mensuel des journées, humeur, discipline du jour, plan, bilan et leçons.
- **Analyse** : performance par session, jour de la semaine, instrument, setup, timeframe, émotions et erreurs ; régularité (séries de gains et de pertes), comportements repérés (revanche, surtrading) et carte jour × heure d’entrée.
- **Bilan de la semaine** : semaine du lundi au dimanche (fuseau du profil), P&L par jour, signaux de comportement, prévision indicative d’atteinte de l’objectif, impression ou PDF.
- **Recherche rapide** : ⌘K sur Mac, Ctrl K ailleurs, pour aller à une page, un compte ou un trade.
- **Sauvegarde** : export JSON des comptes, trades et notes depuis Paramètres. La restauration ne rajoute jamais un trade déjà présent, n’écrase jamais une note et ne supprime rien.
- **Accessibilité** : palette bleu / orange en option (Paramètres), symboles ▲ / ▼ sur les gains et pertes, hachures sur les pertes de la carte jour × heure, et audit automatisé des pages (axe-core, WCAG 2.2 A et AA).
- **Accès** : données privées (RLS sur chaque table), connexion par lien magique, inscriptions sur invitation.

## Démarrage local

Prérequis : **Node.js 22.12 ou plus récent** (voir `.nvmrc`).

```bash
npm install
npm run dev
```

Sans variables Supabase, l’application démarre en **mode démo** : les données restent dans le navigateur (localStorage) et les captures d’écran sont désactivées. Pour découvrir l’application, le bouton « Charger des données d’exemple » (tableau de bord vide ou page Paramètres) ajoute deux comptes, des trades sur deux semaines et quelques notes ; le bouton « Réinitialiser le mode démo » efface tout.

## Configuration Supabase

1. **Créer le projet** sur [supabase.com](https://supabase.com).
2. **Créer le schéma** : dans *SQL Editor*, colle le contenu de `supabase/migrations/0001_init.sql` puis clique sur *Run*. Le script crée les tables, les règles RLS, le trigger de création de profil et le bucket privé `trade-screenshots`.
3. **Activer la connexion par email** : *Authentication → Sign In / Providers → Email* (lien magique activé).
4. **Passer en invitation uniquement** : dans les réglages d’authentification, désactive **« Allow new users to sign up »**. Personne ne peut plus créer de compte seul.
5. **Définir les URL** : *Authentication → URL Configuration*.
   - *Site URL* : l’URL de production Vercel (ex. `https://trading-journal.vercel.app`).
   - *Redirect URLs* : ajoute aussi `http://localhost:5173` pour le développement local.
6. **Inviter les traders** : *Authentication → Users → Invite user* (saisis leur email). Ils reçoivent un lien, puis se connectent ensuite avec un lien magique.
7. **Récupérer les clés** : *Project Settings → API*. Crée un fichier `.env.local` à la racine (modèle : `.env.example`) :

```bash
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ta-cle-anon-publique
```

La clé `anon` est publique par conception : la sécurité repose sur la RLS. Ne mets jamais la clé `service_role` dans le front.

## Déploiement sur Vercel

1. Pousse le dépôt sur GitHub, puis crée un projet Vercel à partir de ce dépôt. Vercel détecte Vite grâce à `vercel.json` (build `npm run build`, dossier `dist`, réécriture SPA).
2. Dans *Project Settings → Node.js Version*, choisis **22.x**.
3. Dans *Project Settings → Environment Variables*, ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (environnements Production et Preview).
4. Lance le déploiement, puis reporte l’URL obtenue dans *Site URL* et *Redirect URLs* côté Supabase.

## Import des trades

| Source | Fichier à fournir | Points à vérifier |
|---|---|---|
| **MetaTrader 5** | Rapport HTML : Terminal → Historique → clic droit → *Rapport* → HTML | Fuseau du serveur du broker (par défaut `Europe/Athens`). Seules les positions achat/vente sont importées. MT4 (*Account History*) est aussi reconnu. |
| **NinjaTrader / Tradovate** | Export CSV de l’historique des trades | Mapping des colonnes, format de date (par défaut mois/jour/année) et fuseau (par défaut `America/New_York`). |
| **TradingView** | Export CSV de l’historique des trades | Mapping des colonnes et fuseau (par défaut UTC). |
| **CSV générique** | Tout CSV avec date, instrument, sens et P&L | Mapping manuel. Une case indique si le P&L est déjà net de frais. |

Avant chaque import, l’aperçu affiche les trades à importer, les doublons ignorés et les lignes en erreur. Rien n’est enregistré tant que tu ne valides pas. Chaque import est tracé, et l’annuler supprime les trades qu’il a créés.

> Les parseurs NinjaTrader, Tradovate et TradingView ont été écrits sans fichier d’exemple réel. Teste-les avec tes propres exports : le mapping automatique des colonnes peut demander un ajustement.

## Règles de calcul

- **P&L net** = P&L brut − frais (commissions, swap). Seul le P&L **réalisé** est pris en compte ; le P&L flottant n’est pas inclus.
- **Journées** : découpées selon le fuseau du compte (par défaut `Indian/Antananarivo`).
- **Perte journalière** : perte réalisée du jour courant, comparée à la limite.
- **Drawdown statique** : seuil fixe = solde initial − drawdown maximum.
- **Drawdown trailing** : le seuil suit le plus haut de l’équité réalisée, sans jamais dépasser le solde initial. C’est une approximation calculée sur les trades clôturés.
- **Objectif de profit** : P&L net cumulé ≥ objectif.
- **Jours de trading** : nombre de journées avec au moins un trade clôturé.
- **Cohérence** : part du meilleur jour dans le profit total (contrôlée uniquement lorsque le profit est positif).
- **Revanche** : trade ouvert moins de 15 min après la clôture d’un trade perdant, tous comptes confondus. C’est un indice à vérifier, pas un verdict.
- **Surtrading** : plus de 4 trades par jour sur un même compte, dans le fuseau de ce compte.
- **Prévision d’objectif** : reste à atteindre ÷ P&L moyen par jour de trading sur les 30 derniers jours, converti en jours ouvrés (lundi à vendredi, sans calendrier de jours fériés). Elle suppose que le rythme récent se maintient.
- **Bilan** : la semaine va du lundi au dimanche, et chaque trade compte dans la journée de son propre compte.
- Les heures sont saisies et affichées dans le fuseau du navigateur, puis stockées en UTC.

## Scripts

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement (0.0.0.0:5173) |
| `npm run build` | Vérification TypeScript puis build de production |
| `npm run preview` | Prévisualisation du build |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm test` | Tests unitaires (calculs, règles, comportements, prévision, sauvegarde, fuseaux, CSV, MT5, palette), test de fumée et audit d’accessibilité (axe-core) |

## Structure

```
src/
  lib/          types, calculs (metrics, rules, timezone, patterns, behavior, forecast), sauvegarde (backup),
                imports (csv, mt5), accès aux données
                repo.ts (contrat), supabaseRepo.ts (Supabase), localRepo.ts (mode démo)
  auth/         AuthContext (session, lien magique, mode démo)
  data/         hooks React Query
  components/   interface (ui, Layout, Toast, RuleCard)
  pages/        une page par écran
  test/         jeux de données et test de fumée
supabase/migrations/0001_init.sql   schéma, RLS, trigger et bucket de captures
```

## Limites connues

- Pas de P&L flottant : les règles journalières et de drawdown ne voient que les trades clôturés.
- Le drawdown trailing est une approximation sur les trades clôturés, pas le calcul exact de la firme.
- Les captures d’écran ne sont disponibles qu’avec Supabase connecté.
- Les imports NinjaTrader, Tradovate et TradingView doivent être validés avec de vrais fichiers.
- La prévision d’objectif est indicative : elle ignore les drawdowns et les changements de rythme.
- Pas de conversion de devise : un total multi-devises additionne les montants bruts, avec un avertissement sur le tableau de bord.
