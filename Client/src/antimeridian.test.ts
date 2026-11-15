import { readFileSync } from 'node:fs'
import type { FeatureCollection, Geometry, Position } from 'geojson'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { cutAtAntimeridian } from './antimeridian'

const collection = (coordinates: Position[][]): FeatureCollection<Geometry, null> => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: null, geometry: { type: 'Polygon', coordinates } }],
})

const geometryOf = (regions: FeatureCollection<Geometry, unknown>) => regions.features[0].geometry

it('cuts a polygon that steps east across 180° into one piece either side', () => {
  const square = [[170, 0], [-170, 0], [-170, 10], [170, 10], [170, 0]]

  expect(geometryOf(cutAtAntimeridian(collection([square])))).toEqual({
    type: 'MultiPolygon',
    coordinates: [
      [[[170, 0], [180, 0], [180, 10], [170, 10], [170, 0]]],
      [[[-180, 0], [-170, 0], [-170, 10], [-180, 10], [-180, 0]]],
    ],
  })
})

it('cuts a polygon that steps west across 180° the same way', () => {
  const square = [[-175, 0], [175, 0], [175, 10], [-175, 10], [-175, 0]]

  expect(geometryOf(cutAtAntimeridian(collection([square])))).toEqual({
    type: 'MultiPolygon',
    coordinates: [
      [[[-175, 0], [-180, 0], [-180, 10], [-175, 10], [-175, 0]]],
      [[[180, 0], [175, 0], [175, 10], [180, 10], [180, 0]]],
    ],
  })
})

it('leaves a polygon that does not cross 180° alone', () => {
  const square = [[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]

  expect(geometryOf(cutAtAntimeridian(collection([square])))).toEqual({ type: 'Polygon', coordinates: [square] })
})

it('leaves no band across the world map but the bottom edge of Antarctica', () => {
  const path = require.resolve('world-atlas/countries-110m.json')
  const topology = JSON.parse(readFileSync(path, 'utf8')) as Topology
  const countries = topology.objects.countries as GeometryCollection<{ name: string }>
  const world = cutAtAntimeridian(feature(topology, countries))

  const banded = world.features.filter(({ geometry }) => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
    return polygons.flat().some((ring) => ring.some(([lon], i) => i > 0 && Math.abs(lon - ring[i - 1][0]) > 180))
  })
  expect(banded.map(({ properties }) => properties?.name)).toEqual(['Antarctica'])
})
