import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';

// Chaque page est chargée à la demande (Recharts ne charge que sur le tableau de bord)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const AccountFormPage = lazy(() => import('./pages/AccountFormPage'));
const TradesPage = lazy(() => import('./pages/TradesPage'));
const TradeFormPage = lazy(() => import('./pages/TradeFormPage'));
const JournalPage = lazy(() => import('./pages/JournalPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  const { loading, userId } = useAuth();

  if (loading) return <Loading label="Connexion…" />;
  if (!userId) return <LoginPage />;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="comptes" element={<AccountsPage />} />
          <Route path="comptes/nouveau" element={<AccountFormPage />} />
          <Route path="comptes/:id" element={<AccountFormPage />} />
          <Route path="trades" element={<TradesPage />} />
          <Route path="trades/nouveau" element={<TradeFormPage />} />
          <Route path="trades/:id" element={<TradeFormPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="analyse" element={<AnalysisPage />} />
          <Route path="bilan" element={<ReportPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
