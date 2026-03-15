#!/usr/bin/env npx tsx
/**
 * Zone extraction script — calls Claude vision API for each floor plan image
 * and generates public/data/building.json
 *
 * Usage: npx tsx scripts/extract-zones.ts
 * Requires: ANTHROPIC_API_KEY env var
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const client = new Anthropic()

interface ExtractedZone {
  id: string
  name: string
  sqft?: number
  polygon: [number, number][]
}

interface FloorInput {
  id: string
  label: string
  imagePath: string
  imageFile: string
  repeats: number
}

const FLOORS: FloorInput[] = [
  { id: 'basement', label: 'Basement', imagePath: '/floorplans/basement.png', imageFile: 'basement.png', repeats: 1 },
  { id: 'ground', label: 'Ground', imagePath: '/floorplans/0.png', imageFile: '0.png', repeats: 1 },
  { id: 'first', label: 'First', imagePath: '/floorplans/1.png', imageFile: '1.png', repeats: 1 },
  { id: 'second', label: 'Second', imagePath: '/floorplans/2.png', imageFile: '2.png', repeats: 1 },
  { id: 'third', label: 'Third–Sixth', imagePath: '/floorplans/3-6.png', imageFile: '3-6.png', repeats: 4 },
  { id: 'seventh', label: 'Seventh', imagePath: '/floorplans/7.png', imageFile: '7.png', repeats: 1 },
  { id: 'eighth', label: 'Eighth–Eleventh', imagePath: '/floorplans/8-11.png', imageFile: '8-11.png', repeats: 4 },
]

const PROMPT = `This is an architectural floor plan image. Your task is to identify ALL distinct spaces, rooms, zones, and areas visible in this plan.

IMPORTANT:
- Include EVERY space: rooms, corridors, hallways, lift shafts, stairwells, toilets, plant rooms, car parking spaces/bays, external walkways, reception areas, open plan areas — everything.
- Pre-colored or shaded areas in the image are just visual guides. Do NOT limit yourself to only those areas.
- For each zone, approximate a polygon using percentage coordinates (0–100) relative to the full image width and height, where (0,0) is top-left and (100,100) is bottom-right.
- Use at least 4 vertices per polygon. More vertices for irregular shapes.
- If a sqft figure is labeled in the image for that space, include it; otherwise omit it.
- Infer sensible names from context (e.g., "Lift Core", "WC", "Car Park Bay", "Main Office", "Corridor", "Reception").

Return ONLY a valid JSON array (no markdown, no explanation) in this exact format:
[
  {
    "name": "Main Office Area",
    "sqft": 11138,
    "polygon": [[5, 10], [90, 10], [90, 85], [5, 85]]
  },
  ...
]`

async function extractZones(floor: FloorInput): Promise<ExtractedZone[]> {
  const imagePath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../public/floorplans',
    floor.imageFile
  )

  const imageData = fs.readFileSync(imagePath)
  const base64 = imageData.toString('base64')

  console.log(`Extracting zones for ${floor.label}...`)

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64,
            },
          },
          {
            type: 'text',
            text: PROMPT,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  let rawZones: Array<{ name: string; sqft?: number; polygon: number[][] }>
  try {
    rawZones = JSON.parse(cleaned)
  } catch (e) {
    console.error(`Failed to parse response for ${floor.label}:`, text)
    throw e
  }

  return rawZones.map((z, i) => ({
    id: `zone-${floor.id}-${i + 1}`,
    name: z.name,
    sqft: z.sqft,
    // Normalize from 0–100 to 0–1
    polygon: z.polygon.map(([x, y]) => [x / 100, y / 100] as [number, number]),
  }))
}

async function main() {
  const floors = []

  for (const floor of FLOORS) {
    try {
      const zones = await extractZones(floor)
      console.log(`  → ${zones.length} zones extracted`)
      floors.push({
        id: floor.id,
        label: floor.label,
        imagePath: floor.imagePath,
        repeats: floor.repeats,
        zones,
      })
    } catch (e) {
      console.error(`Error processing ${floor.label}:`, e)
      // Add floor with empty zones so structure is intact
      floors.push({
        id: floor.id,
        label: floor.label,
        imagePath: floor.imagePath,
        repeats: floor.repeats,
        zones: [],
      })
    }
  }

  const outputPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../public/data/building.json'
  )

  fs.writeFileSync(outputPath, JSON.stringify({ floors }, null, 2))
  console.log(`\nBuilding data written to ${outputPath}`)

  const totalZones = floors.reduce((sum, f) => sum + f.zones.length, 0)
  console.log(`Total: ${floors.length} floors, ${totalZones} zones`)
}

main().catch(console.error)
