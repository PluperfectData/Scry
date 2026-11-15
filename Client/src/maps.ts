import type { GeometryCollection, Topology } from 'topojson-specification'
import usaUrl from 'us-atlas/states-albers-10m.json?url'
import worldUrl from 'world-atlas/countries-110m.json?url'
import { cutAtAntimeridian } from './antimeridian'
import { PROJECTED_MAPS, type MapName } from './dashboard'
import { echartsWith } from './echartsLoader'

// The boundary files ship as separate assets, fetched the first time a chart needs one.
const SOURCES: Record<MapName, { url: string; object: string }> = {
  world: { url: worldUrl, object: 'countries' },
  usa: { url: usaUrl, object: 'states' },
}

const loading = new Map<MapName, Promise<void>>()

async function register(name: MapName): Promise<void> {
  const [{ feature }, echarts, response] = await Promise.all([
    import('topojson-client'),
    // registerMap silently does nothing until the geo component is installed.
    echartsWith(['geo']),
    fetch(SOURCES[name].url),
  ])
  if (!response.ok) throw new Error(`The ${name} map's boundaries did not load.`)
  const topology = (await response.json()) as Topology
  const regions = feature(topology, topology.objects[SOURCES[name].object] as GeometryCollection)
  echarts.registerMap(name, (PROJECTED_MAPS.includes(name) ? regions : cutAtAntimeridian(regions)) as never)
}

/** Registers a map's boundaries with ECharts under its name, once. */
export function loadMap(name: MapName): Promise<void> {
  let pending = loading.get(name)
  if (!pending) {
    pending = register(name)
    pending.catch(() => loading.delete(name))
    loading.set(name, pending)
  }
  return pending
}
