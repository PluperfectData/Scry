import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { DashboardsPage } from './pages/DashboardsPage'
import { SourcesPage } from './pages/SourcesPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardsPage /> },
      { path: 'dashboards/:id', element: <DashboardPage /> },
      { path: 'sources', element: <SourcesPage /> },
      { path: '*', element: <p className="muted">There is no page here.</p> },
    ],
  },
])
