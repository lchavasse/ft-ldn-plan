import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

const DATA_PATH = path.join(process.cwd(), 'public/data/scenarios.json')

export async function GET() {
  try {
    const data = fs.readFileSync(DATA_PATH, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    fs.writeFileSync(DATA_PATH, JSON.stringify(body, null, 2))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
