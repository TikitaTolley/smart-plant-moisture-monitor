import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type Mode = 'local' | 'remote'
type ReadingStatus = 'moist' | 'getting-dry' | 'dry'

interface LatestReadingResponse {
  reading: {
    sequence: number
  }
}

const simulatorDeviceId = 'lemon-lime-dracaena-01-simulator'
const simulatorFirmwareVersion = 'simulator-0.1.0'
const localApiOrigin = 'http://127.0.0.1:5713'
const remoteApiOrigin =
  'https://smart-plant-monitor.daeda-technologies.workers.dev'
const readingCount = 8
const defaultIntervalMs = 15000
const dryRaw = 3450
const wetRaw = 2633
const moistureSeries = [62, 55, 48, 44, 39, 32, 26, 22]

function requestedMode(): Mode {
  const mode = process.argv[2]

  if (mode === 'local' || mode === 'remote') {
    return mode
  }

  throw new Error(
    'Choose a mode: bun run simulate:local or bun run simulate:remote'
  )
}

function readLocalDeviceKey(): string {
  const devVarsPath = fileURLToPath(
    new URL('../.dev.vars', import.meta.url)
  )
  const contents = readFileSync(devVarsPath, 'utf8')
  const match = contents.match(
    /^DEVICE_KEY\s*=\s*["']?([^\r\n"']+)["']?\s*$/m
  )
  const deviceKey = match?.[1]?.trim()

  if (!deviceKey) {
    throw new Error('DEVICE_KEY is missing from .dev.vars')
  }

  return deviceKey
}

function productionDeviceKey(): string {
  const deviceKey = process.env.DEVICE_KEY?.trim()

  if (!deviceKey) {
    throw new Error(
      'Remote mode requires DEVICE_KEY in the environment'
    )
  }

  return deviceKey
}

function requestedInterval(): number {
  const value = process.env.SIMULATOR_INTERVAL_MS

  if (!value) {
    return defaultIntervalMs
  }

  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error('SIMULATOR_INTERVAL_MS must be a positive integer')
  }

  return Number(value)
}

function moistureStatus(percent: number): ReadingStatus {
  if (percent <= 25) {
    return 'dry'
  }

  if (percent <= 45) {
    return 'getting-dry'
  }

  return 'moist'
}

function rawForPercent(percent: number): number {
  return Math.round(dryRaw - (percent / 100) * (dryRaw - wetRaw))
}

async function nextSequence(apiOrigin: string): Promise<number> {
  const url = new URL('/api/v1/readings/latest/', apiOrigin)
  url.searchParams.set('deviceId', simulatorDeviceId)

  const response = await fetch(url)

  if (response.status === 404) {
    return 1
  }

  if (!response.ok) {
    throw new Error(
      `Could not read the latest sequence: HTTP ${response.status}`
    )
  }

  const latest = await response.json() as LatestReadingResponse

  if (!Number.isInteger(latest.reading?.sequence)) {
    throw new Error('Latest-reading response did not contain a sequence')
  }

  return latest.reading.sequence + 1
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function run(): Promise<void> {
  const mode = requestedMode()
  const apiOrigin = mode === 'local' ? localApiOrigin : remoteApiOrigin
  const deviceKey = mode === 'local'
    ? readLocalDeviceKey()
    : productionDeviceKey()
  const intervalMs = requestedInterval()
  const firstSequence = await nextSequence(apiOrigin)

  console.log(`Starting ${mode} simulation`)
  console.log(`Device: ${simulatorDeviceId}`)
  console.log(`Readings: ${readingCount}, interval: ${intervalMs} ms`)

  for (let index = 0; index < readingCount; index += 1) {
    const sequence = firstSequence + index
    const moisturePercent = moistureSeries[index]
    const payload = {
      deviceId: simulatorDeviceId,
      sequence,
      raw: rawForPercent(moisturePercent),
      moisturePercent,
      status: moistureStatus(moisturePercent),
      rssi: -50 - index,
      firmwareVersion: simulatorFirmwareVersion,
    }

    const response = await fetch(
      new URL('/api/v1/readings/', apiOrigin),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(
        `Sequence ${sequence} failed: HTTP ${response.status}`
      )
    }

    console.log(
      `Accepted ${index + 1}/${readingCount}: ` +
      `sequence ${sequence}, moisture ${moisturePercent}%`
    )

    if (index < readingCount - 1) {
      await wait(intervalMs)
    }
  }

  console.log(`Simulation complete: ${readingCount} readings sent`)
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Simulation stopped: ${message}`)
  process.exitCode = 1
})
