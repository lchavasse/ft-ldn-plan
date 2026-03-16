import { Redis } from '@upstash/redis'
import building from '../public/data/building.json'
import scenarios from '../public/data/scenarios.json'

const redis = Redis.fromEnv()

async function seed() {
  await redis.set('building', building)
  await redis.set('scenarios', scenarios)
  console.log('Seeded successfully.')
}
seed().catch(console.error)
