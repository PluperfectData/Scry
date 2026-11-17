import { createBrowserRouter } from 'react-router'
import { Layout, RequireSession } from './components/Layout'
import { RequireInstall } from './components/RequireInstall'
import { RequireEditor, WorkspaceLayout } from './components/WorkspaceLayout'
import { AccountPage } from './pages/AccountPage'
import { DashboardPage } from './pages/DashboardPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { DocsPage } from './pages/DocsPage'
import { HomePage } from './pages/HomePage'
import { InstallPage } from './pages/InstallPage'
import { LinkPage } from './pages/LinkPage'
import { PushApiDocsPage } from './pages/PushApiDocsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SignInPage } from './pages/SignInPage'
import { SourcesPage } from './pages/SourcesPage'
import { UsersPage } from './pages/UsersPage'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage'
import { WorkspacesPage } from './pages/WorkspacesPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { path: 'install', element: <InstallPage /> },
      {
        element: <RequireInstall />,
        children: [
          { path: 'sign-in', element: <SignInPage /> },
          { path: 'sign-in/link', element: <LinkPage /> },
          {
            element: <RequireSession />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'workspaces', element: <WorkspacesPage /> },
              {
                path: 'workspaces/:workspaceId',
                element: <WorkspaceLayout />,
                children: [
                  { index: true, element: <DashboardsPage openLanding /> },
                  { path: 'dashboards', element: <DashboardsPage /> },
                  { path: 'dashboards/:id', element: <DashboardPage /> },
                  {
                    element: <RequireEditor />,
                    children: [
                      { path: 'sources', element: <SourcesPage /> },
                      { path: 'settings', element: <WorkspaceSettingsPage /> },
                    ],
                  },
                ],
              },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'account', element: <AccountPage /> },
              { path: 'docs', element: <DocsPage /> },
              { path: 'docs/push-api', element: <PushApiDocsPage /> },
              { path: '*', element: <p className="page muted">There is no page here.</p> },
            ],
          },
        ],
      },
    ],
  },
])
