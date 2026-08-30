import { useEffect, useState } from 'react'
import happyCharacter from './assets/characters/happy.png'
import sadCharacter from './assets/characters/sad.png'
import sleepingCharacter from './assets/characters/sleeping.png'
import worriedCharacter from './assets/characters/worried.png'
import type {
  LatestReadingResponse,
  Reading,
} from './types/reading'
import './App.css'

const deviceId = import.meta.env.DEV
  ? 'lemon-lime-dracaena-01-simulator'
  : 'lemon-lime-dracaena-01'
const refreshIntervalMs = 5 * 60 * 1000
const staleReadingAfterMs = 12 * 60 * 1000
const savedReadingKey = 'plant-monitor:last-reading:v1'

type CharacterState = 'happy' | 'worried' | 'sad' | 'sleeping'

interface CharacterDetails {
  image: string
  label: string
}

interface SavedReading {
  reading: Reading
  savedAt: string
}

const statusLabels: Record<Reading['status'], string> = {
  moist: 'Moist',
  'getting-dry': 'Getting dry',
  dry: 'Dry',
}

const characterByStatus: Record<Reading['status'], CharacterState> = {
  moist: 'happy',
  'getting-dry': 'worried',
  dry: 'sad',
}

const characters: Record<CharacterState, CharacterDetails> = {
  happy: {
    image: happyCharacter,
    label: 'Happy plant',
  },
  worried: {
    image: worriedCharacter,
    label: 'Worried plant',
  },
  sad: {
    image: sadCharacter,
    label: 'Sad plant',
  },
  sleeping: {
    image: sleepingCharacter,
    label: 'Sleeping until contact returns',
  },
}

function isReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const reading = value as Record<string, unknown>
  const validRssi = reading.rssi === null || (
    typeof reading.rssi === 'number' &&
    Number.isInteger(reading.rssi) &&
    reading.rssi >= -127 &&
    reading.rssi <= 0
  )

  return (
    typeof reading.deviceId === 'string' &&
    reading.deviceId.length >= 1 &&
    reading.deviceId.length <= 64 &&
    typeof reading.sequence === 'number' &&
    Number.isInteger(reading.sequence) &&
    reading.sequence >= 1 &&
    typeof reading.raw === 'number' &&
    Number.isInteger(reading.raw) &&
    reading.raw >= 0 &&
    reading.raw <= 4095 &&
    typeof reading.moisturePercent === 'number' &&
    Number.isFinite(reading.moisturePercent) &&
    reading.moisturePercent >= 0 &&
    reading.moisturePercent <= 100 &&
    typeof reading.status === 'string' &&
    ['moist', 'getting-dry', 'dry'].includes(reading.status) &&
    validRssi &&
    typeof reading.firmwareVersion === 'string' &&
    reading.firmwareVersion.length >= 1 &&
    reading.firmwareVersion.length <= 32 &&
    typeof reading.receivedAt === 'string' &&
    !Number.isNaN(new Date(reading.receivedAt).getTime())
  )
}

function loadSavedReading(): Reading | null {
  try {
    const storedValue = localStorage.getItem(savedReadingKey)

    if (!storedValue) {
      return null
    }

    const value = JSON.parse(storedValue) as unknown

    if (typeof value !== 'object' || value === null) {
      return null
    }

    const savedReading = value as Partial<SavedReading>

    if (
      typeof savedReading.savedAt !== 'string' ||
      Number.isNaN(new Date(savedReading.savedAt).getTime()) ||
      !isReading(savedReading.reading)
    ) {
      return null
    }

    return savedReading.reading
  } catch {
    return null
  }
}

function saveReading(reading: Reading): void {
  const savedReading: SavedReading = {
    reading,
    savedAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(savedReadingKey, JSON.stringify(savedReading))
  } catch {
    // Storage can be unavailable without preventing live monitoring.
  }
}

function readingIsFresh(timestamp: string, now: number): boolean {
  const receivedAt = new Date(timestamp).getTime()

  if (Number.isNaN(receivedAt)) {
    return false
  }

  return now - receivedAt <= staleReadingAfterMs
}

function formatReadingTime(timestamp: string): string {
  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function wifiStrength(rssi: number | null): string {
  if (rssi === null) {
    return 'Unavailable'
  }

  if (rssi >= -55) {
    return `Excellent (${rssi} dBm)`
  }

  if (rssi >= -65) {
    return `Good (${rssi} dBm)`
  }

  if (rssi >= -75) {
    return `Fair (${rssi} dBm)`
  }

  return `Weak (${rssi} dBm)`
}

function App() {
  const [reading, setReading] = useState<Reading | null>(loadSavedReading)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isBrowserOnline, setIsBrowserOnline] = useState(
    () => navigator.onLine
  )
  const [now, setNow] = useState(() => Date.now())

  const hasCurrentConnection = isBrowserOnline && error === null
  const hasFreshReading = reading !== null && readingIsFresh(
    reading.receivedAt,
    now
  )
  const readingIsCurrent = hasCurrentConnection && hasFreshReading
  const characterState = readingIsCurrent && reading
    ? characterByStatus[reading.status]
    : 'sleeping'
  const character = characters[characterState]

  useEffect(() => {
    function handleOnline(): void {
      setIsBrowserOnline(true)
    }

    function handleOffline(): void {
      setIsBrowserOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let requestInFlight = false
    let initialRequestComplete = false

    async function loadLatestReading(): Promise<void> {
      if (requestInFlight) {
        return
      }

      requestInFlight = true

      try {
        const url = new URL(
          '/api/v1/readings/latest/',
          window.location.origin
        )
        url.searchParams.set('deviceId', deviceId)

        const response = await fetch(url, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Request failed with HTTP ${response.status}`)
        }

        const data = await response.json() as LatestReadingResponse

        if (!isReading(data.reading)) {
          throw new Error('Latest reading response was invalid')
        }

        setReading(data.reading)
        saveReading(data.reading)
        setError(null)
      } catch (requestError: unknown) {
        if (controller.signal.aborted) {
          return
        }

        const message = requestError instanceof Error
          ? requestError.message
          : 'Unable to load plant data'

        setError(message)
      } finally {
        setNow(Date.now())
        requestInFlight = false

        if (!initialRequestComplete && !controller.signal.aborted) {
          initialRequestComplete = true
          setIsLoading(false)
        }
      }
    }

    void loadLatestReading()

    const intervalId = window.setInterval(() => {
      void loadLatestReading()
    }, refreshIntervalMs)

    function handleOnline(): void {
      void loadLatestReading()
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        void loadLatestReading()
      }
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      controller.abort()
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="monitor-layout" aria-labelledby="app-title">
        <header className="monitor-header">
          <div className="datasheet-line">
            <span>Plant monitor</span>
            <span>{readingIsCurrent ? 'Live telemetry' : 'Last known telemetry'}</span>
          </div>
          <h1 id="app-title">Smart Plant Monitor</h1>
          <p className="plant-name">Lemon-lime dracaena</p>
        </header>

        {isLoading && (
          <>
            <p className="request-status" role="status" aria-live="polite">
              Loading plant data...
            </p>
            <div className="character-stage character-offline">
              <img
                src={characters.sleeping.image}
                alt="Sleeping plant"
              />
              <span>Waiting for plant data</span>
            </div>
          </>
        )}

        {!isLoading && !reading && (
          <>
            <p className="request-status request-error" role="alert">
              {error
                ? 'Unable to load plant data. No saved reading is available.'
                : 'No plant reading is available.'}
            </p>
            <div className="character-stage character-offline">
              <img src={character.image} alt={character.label} />
              <span>{character.label}</span>
            </div>
          </>
        )}

        {!isLoading && reading && (
          <>
            {!readingIsCurrent && (
              <p className="refresh-warning" role="status">
                {!isBrowserOnline
                  ? 'App offline. Showing the last known reading.'
                  : error
                    ? 'Unable to refresh. Showing the last known reading.'
                    : 'Monitor offline. This reading is stale.'}
              </p>
            )}

            <section className="reading-overview" aria-label="Current reading">
              <div>
                <span className="data-label">
                  {readingIsCurrent ? 'Soil moisture' : 'Last known moisture'}
                </span>
                <strong>{reading.moisturePercent}%</strong>
              </div>
              <span className={`status-indicator ${
                readingIsCurrent
                  ? `status-${reading.status}`
                  : 'status-offline'
              }`}>
                {readingIsCurrent ? statusLabels[reading.status] : 'Offline'}
              </span>
            </section>

            <div className={`character-stage ${
              readingIsCurrent ? '' : 'character-offline'
            }`}>
              <img src={character.image} alt={character.label} />
              <span>{character.label}</span>
            </div>

            <div className="telemetry-line">
              <span>Telemetry notes</span>
              <span>Seq {reading.sequence}</span>
            </div>

            <dl className="reading-details">
              <div>
                <dt>Raw</dt>
                <dd>{reading.raw}</dd>
              </div>
              <div>
                <dt>Last</dt>
                <dd>{formatReadingTime(reading.receivedAt)}</dd>
              </div>
              <div>
                <dt>Wi-Fi</dt>
                <dd>{wifiStrength(reading.rssi)}</dd>
              </div>
              <div>
                <dt>FW</dt>
                <dd>{reading.firmwareVersion}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  )
}

export default App
