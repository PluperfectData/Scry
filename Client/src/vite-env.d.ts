/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

// ECharts ships types only for its bundled entry points; each per-part file exports one installer.
declare module 'echarts/lib/*' {
  export const install: Exclude<Parameters<typeof import('echarts/core').use>[0], unknown[]>
}
