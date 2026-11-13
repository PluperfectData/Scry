// A stand-in for react-router in unit tests: Jest cannot load its ES-module-only build.
import type { ReactNode } from 'react'

export const navigate = jest.fn()
export const routerState = { params: {} as Record<string, string>, pathname: '/' }

type LinkProps = { to: string; children: ReactNode; className?: string | ((state: { isActive: boolean }) => string) }

const link = ({ to, children, className }: LinkProps) => (
  <a href={to} className={typeof className === 'function' ? className({ isActive: routerState.pathname === to }) : className}>
    {children}
  </a>
)

export const reactRouterMock = () => ({
  Link: link,
  NavLink: link,
  Outlet: () => null,
  useNavigate: () => navigate,
  useParams: () => routerState.params,
  useLocation: () => ({ pathname: routerState.pathname, hash: '', state: null }),
})
