import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from './components/layout';

import CasesPage from './pages/cases';
import DashboardPage from './pages/dashboard';
import DemoPage from './pages/demo';
import EvidencePage from './pages/evidence';
import HistoryPage from './pages/history';
import SessionPage from './pages/session';
import VerdictPage from './pages/verdict';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Layout><CasesPage /></Layout>
      </Route>
      <Route path="/dashboard">
        <Layout><DashboardPage /></Layout>
      </Route>
      <Route path="/history">
        <Layout><HistoryPage /></Layout>
      </Route>
      <Route path="/evidence">
        <Layout><EvidencePage /></Layout>
      </Route>
      {/* Recorded run. Its own route, never a mode on /sessions/:id, so a
          replay cannot be mistaken for a live hearing. */}
      <Route path="/recorded">
        <Layout><DemoPage /></Layout>
      </Route>
      <Route path="/sessions/:id">
        {params => <Layout><SessionPage id={params.id} /></Layout>}
      </Route>
      <Route path="/sessions/:id/verdict">
        {params => <Layout><VerdictPage /></Layout>}
      </Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
