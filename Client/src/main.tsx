import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { NoticeProvider } from './NoticeProvider'
import { router } from './router'
import { ThemeProvider } from './ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <NoticeProvider>
        <RouterProvider router={router} />
      </NoticeProvider>
    </ThemeProvider>
  </StrictMode>,
)
