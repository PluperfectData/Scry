import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { RequireInstall } from './components/RequireInstall'
import { DashboardPage } from './pages/DashboardPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { DocsPage } from './pages/DocsPage'
import { InstallPage } from './pages/InstallPage'
import { PushApiDocsPage } from './pages/PushApiDocsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SourcesPage } from './pages/SourcesPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { path: 'install', element: <InstallPage /> },
      {
        element: <RequireInstall />,
        children: [
          { index: true, element: <DashboardsPage openLanding /> },
          { path: 'dashboards', element: <DashboardsPage /> },
          { path: 'dashboards/:id', element: <DashboardPage /> },
          { path: 'sources', element: <SourcesPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'docs', element: <DocsPage /> },
          { path: 'docs/push-api', element: <PushApiDocsPage /> },
          { path: '*', element: <p className="page muted">There is no page here.</p> },
        ],
      },
    ],
  },
])
