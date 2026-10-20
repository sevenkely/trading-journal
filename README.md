# Seven Journal

Journal de trading personnel et prop firm : statistiques, règles de la firme, discipline et revue visuelle.
Stack : **React + TypeScript**, **Vite**, **Tailwind CSS**, **Supabase** (Postgres, Auth par lien magique, RLS, Storage) et **Vercel**.

## Fonctionnalités

- **Comptes** : personnel, challenge (évaluation) ou compte financé, avec firme, plateforme et devise (USD par défaut, configurable par compte).
- **Trades** : saisie manuelle, ou import depuis MetaTrader 5, NinjaTrader / Tradovate et TradingView. Les doublons sont ignorés, et un import peut être annulé.
- **Statistiques** : P&L net, taux de réussite, profit factor, espérance, R multiple, drawdown réalisé, courbe d’équité, respect du plan. Seul le **réalisé** compte : une position encore ouverte n’entre ni dans les statistiques, ni dans la courbe, ni dans le calendrier.
- **Positions ouvertes & P&L flottant** : un trade sans date de clôture est une position ouverte. Son P&L flottant s’affiche sur le tableau de bord (panneau « Positions ouvertes ») et **compte dans les limites de risque** — perte journalière et drawdown — pour une lecture prudente.
- **Règles prop firm** (par compte) : perte journalière, drawdown maximum (statique ou trailing), objectif de profit, jours de trading minimum, règle de cohérence. Alertes à 50 %, 80 % et 100 % de chaque limite.
- **Dossier de trade — la raison d’entrer** : chaque trade peut porter une **thèse** (ce que tu attends du marché, écrit avant d’entrer), son **invalidation** (ce qui te prouve que tu as tort), les **confluences** cochées, et un **verdict** après coup (joué comme prévu, sorti trop tôt, setup invalidé…). Le tiroir relit cet ensemble avant la position et la psychologie.
- **Bibliothèque de setups** : un setup se crée une fois (nom, contexte attendu, invalidation, checklist) et se choisit ensuite dans le formulaire. Le libellé reste recopié sur le trade pour les tableaux et les filtres, et le lien permet de mesurer un motif à travers les trades.
- **Revue visuelle typée** : les images sont rangées par rôle — **contexte HTF**, **déclencheur LTF**, **résultat** — avec une légende. Une image déposée prend la place libre suivante ; le dossier indique ce qui manque. Stockage privé Supabase.
- **Journal** : calendrier mensuel des journées, humeur, discipline du jour, plan, bilan et leçons.
- **Analyse** : performance par session, jour de la semaine, instrument, setup, timeframe, émotions et erreurs ; régularité (séries de gains et de pertes), comportements repérés (revanche, surtrading) et carte jour × heure d’entrée.
- **Comparaison** : deux fenêtres consécutives de même durée (30 jours contre les 30 jours précédents) ou deux comptes, côte à côte et indicateur par indicateur, avec l’écart et son sens de lecture. Un écart n’est affiché que si les deux côtés ont des trades.
- **Bilan** : au choix **semaine** (du lundi au dimanche, fuseau du profil), **mois** (du 1er au dernier jour, découpé en semaines civiles ; le mois en cours s’arrête à aujourd’hui pour ne pas compter les jours à venir comme des jours sans trade) ou **12 mois** (douze mois glissants : une barre de P&L par mois, la ligne du cumul, le meilleur et le pire mois, le tableau mois par mois). Chaque vue donne les trades, la réussite, les jours (ou mois) tradés, les signaux de comportement, la prévision indicative d’atteinte de l’objectif, et s’imprime ou s’exporte en PDF. Le tableau de bord en affiche un résumé du mois sous la courbe d’équité.
- **Panneau « Aujourd’hui »** : P&L et flottant du jour, marge restante avant la limite journalière, checklist pré-trade et plan du jour, en tête du tableau de bord. Le reste de la page se lit en trois sections : **Performance**, **Risque & discipline**, **Rythme**.
- **Alertes de règles** : au franchissement des seuils (50 %, 80 %, 100 %), une notification du navigateur et/ou un POST JSON vers un webhook (bot Telegram, relais maison). Une alerte ne part qu’une fois par seuil et par jour.
- **Risque de ruine** : simulation de Monte-Carlo qui rejoue ta distribution de R sur des milliers de séquences et compare la probabilité de toucher le seuil de perte à celle d’atteindre l’objectif. Le risque par trade est ajustable.
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
2. **Créer le schéma** : dans *SQL Editor*, colle le contenu de `supabase/migrations/0001_init.sql` puis clique sur *Run*. Le script crée les tables, les règles RLS, le trigger de création de profil et le bucket privé `trade-screenshots`. Lance ensuite, dans l’ordre :
   - `supabase/migrations/0002_screenshots_limits.sql` : limite le bucket aux images de 10 Mo et chaque trade à 4 images ;
   - `supabase/migrations/0003_trade_story.sql` : bibliothèque de setups, images typées (contexte, déclencheur, résultat), thèse, invalidation, verdict et confluences. La migration reprend les captures existantes dans l’ordre (1<sup>re</sup> = contexte, 2<sup>e</sup> = déclencheur, suivantes = résultat) puis retire l’ancienne galerie plate.
3. **Activer la connexion par email** : *Authentication → Sign In / Providers → Email* (lien magique activé).
4. **Passer en invitation uniquement** : dans les réglages d’authentification, désactive **« Allow new users to sign up »**. Personne ne peut plus créer de compte seul.
5. **Définir les URL** : *Authentication → URL Configuration*.
   - *Site URL* : l’URL de production Vercel (ex. `https://seven-journal.vercel.app`).
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
- **Position ouverte** : un trade sans `closed_at`. Son P&L est flottant : il ne compte dans aucune statistique de performance.
- **Perte journalière** : perte réalisée du jour courant **plus le P&L flottant de toutes les positions ouvertes**, comparée à la limite. Toute exposition ouverte est comptée dans la journée en cours, même si la position a été ouverte la veille : c’est la lecture prudente.
- **Drawdown** : mesuré sur l’équité **avec** le flottant (`équité réalisée + P&L flottant`), contre un seuil calculé sur le plus haut d’équité **réalisée**.
- **Drawdown statique** : seuil fixe = solde initial − drawdown maximum.
- **Drawdown trailing** : le seuil suit le plus haut de l’équité réalisée, sans jamais dépasser le solde initial. C’est une approximation calculée sur les trades clôturés.
- **Objectif de profit** : P&L net cumulé ≥ objectif.
- **Jours de trading** : nombre de journées avec au moins un trade clôturé.
- **Cohérence** : part du meilleur jour dans le profit total (contrôlée uniquement lorsque le profit est positif).
- **Revanche** : trade ouvert moins de 15 min après la clôture d’un trade perdant, tous comptes confondus. C’est un indice à vérifier, pas un verdict.
- **Surtrading** : plus de 4 trades par jour sur un même compte, dans le fuseau de ce compte.
- **Prévision d’objectif** : reste à atteindre ÷ P&L moyen par jour de trading sur les 30 derniers jours, converti en jours ouvrés (lundi à vendredi, sans calendrier de jours fériés). Elle suppose que le rythme récent se maintient.
- **Bilan** : la semaine va du lundi au dimanche, le mois se découpe en semaines civiles du lundi au dimanche (tronquées au début et à la fin du mois), et chaque trade compte dans la journée de son propre compte.
- **Futures** : le calcul ne se fait ni en lots ni en pips mais **par contrat**, avec les constantes du marché (`src/lib/futures.ts`). Pour chaque contrat : `valeurdutick / tailletick` donne la valeur d'un point (NQ : 5 / 0,25 = 20 $ ; ES : 12,50 / 0,25 = 50 $ ; GC : 10 / 0,10 = 100 $ ; CL : 10 / 0,01 = 1 000 $).
  - **P&L brut** = mouvement en points × sens du trade × valeur du point × nombre de contrats (le mouvement en ticks s'affiche à côté).
  - **Taille** : `contrats = arrondi_bas(risque visé ÷ (distance au stop traduite en ticks × valeur du tick))`. Un contrat ne se fractionne pas : 0,5 contrat n'existe pas, et on n'arrondit jamais au-dessus du risque visé.
  - **Micro** : quand le risque visé ne couvre pas un contrat plein, le repli sur le micro est proposé (MES, MNQ, MGC, SIL, MCL…), au prorata du même stop.
  - **Symboles** : racine seule (`NQ`), échéance (`NQH6`, `NQZ2026`, `NQ 03-26`) ou contrat continu (`@NQ1!`, `NQ=F`). « SILVER » ou « BTCUSD » ne sont pas confondus avec des contrats.
  - Les valeurs de tick sont celles des contrats américains (CME, CBOT, COMEX, NYMEX), libellées en USD : à recouper avec la fiche de ton broker si elle diffère.
- Les heures sont saisies et affichées dans le fuseau du navigateur, puis stockées en UTC.

## Scripts

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement (0.0.0.0:5173) |
| `npm run build` | Vérification TypeScript puis build de production |
| `npm run preview` | Prévisualisation du build |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm test` | Tests unitaires (calculs, règles, flottant, comportements, prévision, risque de ruine, alertes, sauvegarde, fuseaux, CSV, MT5, palette, futures, dossier de trade, setups), test de fumée et audit d’accessibilité (axe-core) |

L’intégration continue (`.github/workflows/ci.yml`) lance le build et les tests sur chaque envoi et chaque pull request.

> Les tests forcent le mode démo (`vite.config.ts`) : le `.env` local ne les fait pas basculer en mode Supabase, sinon ils auditeraient l’écran de connexion.

## Structure

```
src/
  lib/          types, calculs (metrics, rules, timezone, patterns, behavior, forecast, ruin, futures), sauvegarde (backup),
                dossier de trade (story, setups), alertes (alerts), imports (csv, mt5), accès aux données
                repo.ts (contrat), supabaseRepo.ts (Supabase), localRepo.ts (mode démo)
  auth/         AuthContext (session, lien magique, mode démo)
  data/         hooks React Query
  components/   interface (ui, Layout, Toast, RuleCard)
  pages/        une page par écran
  test/         jeux de données et test de fumée
supabase/migrations/0001_init.sql   schéma, RLS, trigger et bucket de captures
supabase/migrations/0002_screenshots_limits.sql   limites du bucket (taille, types) et 4 images par trade
supabase/migrations/0003_trade_story.sql   setups, images typées, thèse, invalidation, verdict, confluences
```

## Limites connues

- Le P&L flottant est celui que **tu saisis** (comme sur ta plateforme) : il n’y a pas de flux de cotations, donc pas de recalcul automatique entre deux mises à jour.
- Les alertes ne partent que si l’application est ouverte : un envoi permanent demande un service côté serveur (Edge Function et planification).
- Le risque de ruine est une estimation : elle suppose que les R passés représentent les R futurs, un risque fixe par trade et des trades indépendants. Elle ignore les frais et les corrélations entre positions.
- La page Trades charge les 5 000 trades les plus récents : au-delà, filtres et totaux ne portent que sur cette fenêtre (l’application le signale). Les pages d’agrégat, elles, lisent tout l’historique.
- Le drawdown trailing est une approximation sur les trades clôturés, pas le calcul exact de la firme.
- Les images ne sont disponibles qu’avec Supabase connecté : le mode démo enregistre les rôles et les légendes, pas les fichiers.
- La sauvegarde JSON n’inclut ni les images ni la bibliothèque de setups ; restaurer ailleurs garde le libellé du setup mais pas son lien.
- Les imports NinjaTrader, Tradovate et TradingView doivent être validés avec de vrais fichiers.
- La prévision d’objectif est indicative : elle ignore les drawdowns et les changements de rythme.
- Pas de conversion de devise : un total multi-devises additionne les montants bruts, avec un avertissement sur le tableau de bord.
