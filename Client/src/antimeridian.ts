import type { FeatureCollection, Geometry, Position } from 'geojson'

type Ring = Position[]
type Polygon = Ring[]

const crossings = (ring: Ring) => ring.filter((point, i) => i > 0 && Math.abs(point[0] - ring[i - 1][0]) > 180).length

const shift = (ring: Ring, by: number): Ring => ring.map(([lon, lat]) => [lon + by, lat])

/** Removes each jump between 180° and -180°, so the ring runs on past 180° instead. */
function unwrap(ring: Ring, from = ring[0][0]): Ring {
  let offset = Math.round((from - ring[0][0]) / 360) * 360
  return ring.map(([lon, lat], i) => {
    if (i > 0) {
      const step = lon - ring[i - 1][0]
      if (step > 180) offset -= 360
      else if (step < -180) offset += 360
    }
    return [lon + offset, lat]
  })
}

/** The part of a closed ring east or west of a meridian, by Sutherland-Hodgman clipping against that one line. */
function clip(ring: Ring, meridian: number, east: boolean): Ring {
  const inside = ([lon]: Position) => (east ? lon >= meridian : lon <= meridian)
  const kept: Ring = []
  for (let i = 0; i < ring.length - 1; i++) {
    const [a, b] = [ring[i], ring[i + 1]]
    if (inside(a)) kept.push(a)
    if (inside(a) !== inside(b)) {
      const t = (meridian - a[0]) / (b[0] - a[0])
      kept.push([meridian, a[1] + t * (b[1] - a[1])])
    }
  }
  return kept.length >= 3 ? [...kept, kept[0]] : []
}

/** A polygon crossing 180°, split into the piece either side of it. */
function cut([outer, ...holes]: Polygon): Polygon[] {
  const count = crossings(outer)
  // An odd count circles a pole, as Antarctica does, and its one jump is the bottom edge, which draws correctly.
  if (count === 0 || count % 2 === 1) return [[outer, ...holes]]

  const rings = [unwrap(outer), ...holes.map((hole) => unwrap(hole, outer[0][0]))]
  const meridian = Math.max(...rings[0].map(([lon]) => lon)) > 180 ? 180 : -180
  const near = rings.map((ring) => clip(ring, meridian, meridian < 0))
  const far = rings.map((ring) => shift(clip(ring, meridian, meridian > 0), -2 * meridian))
  return [near, far].filter(([shell]) => shell.length > 0).map((piece) => piece.filter((ring) => ring.length > 0))
}

function cutGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    const pieces = cut(geometry.coordinates)
    return pieces.length === 1 ? geometry : { type: 'MultiPolygon', coordinates: pieces }
  }
  if (geometry.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geometry.coordinates.flatMap(cut) }
  return geometry
}

/**
 * Cuts every polygon that crosses 180° at that line. Boundary files are made for a globe, where a coast may step from
 * 179.9° to -179.9°, and drawn flat that step becomes a band across the whole map.
 */
export function cutAtAntimeridian<P>(regions: FeatureCollection<Geometry, P>): FeatureCollection<Geometry, P> {
  return {
    ...regions,
    features: regions.features.map((region) => ({ ...region, geometry: cutGeometry(region.geometry) })),
  }
}
