import { useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { getInstall } from '../api'

/** Sends a visitor to the installer while the instance is not set up, and shows the page once it is. */
export function RequireInstall() {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let live = true
    getInstall()
      .then((view) => {
        if (!live) return
        if (view.installed) setChecked(true)
        else navigate('/install', { replace: true })
      })
      // An API that does not answer leaves each page to say so.
      .catch(() => live && setChecked(true))
    return () => {
      live = false
    }
  }, [navigate])

  return checked ? <Outlet /> : null
}
