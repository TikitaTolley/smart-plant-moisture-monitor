type ReadingStatus = 'moist' | 'getting-dry' | 'dry'

interface ReadingPayload {
  deviceId: string
  sequence: number
  raw: number
  moisturePercent: number
  status: ReadingStatus
  rssi: number | null
  firmwareVersion: string
}

interface WorkerEnv {
  DB: D1Database
  DEVICE_KEY: string
  LATEST_RATE_LIMITER: RateLimit
  HISTORY_RATE_LIMITER: RateLimit
  UPLOAD_RATE_LIMITER: RateLimit
}

interface ReadingRow {
  id: number
  device_id: string
  sequence: number
  raw: number
  moisture_percent: number
  status: ReadingStatus
  rssi: number | null
  firmware_version: string
  received_at: string
}

const defaultHistoryLimit = 48
const maximumHistoryLimit = 288

function secureApiResponse(response: Response): Response {
  const headers = new Headers(response.headers)

  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function apiTimestamp(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
    return `${timestamp.replace(' ', 'T')}Z`
  }

  return timestamp
}

function readingResponse(row: ReadingRow): ReadingPayload & {
  receivedAt: string
} {
  return {
    deviceId: row.device_id,
    sequence: row.sequence,
    raw: row.raw,
    moisturePercent: row.moisture_percent,
    status: row.status,
    rssi: row.rssi,
    firmwareVersion: row.firmware_version,
    receivedAt: apiTimestamp(row.received_at),
  }
}

function requestedDeviceId(url: URL): string | null {
  const deviceId = url.searchParams.get('deviceId')

  if (!deviceId || deviceId.length > 64) {
    return null
  }

  return deviceId
}

function requestedHistoryLimit(url: URL): number | null {
  const value = url.searchParams.get('limit')

  if (value === null) {
    return defaultHistoryLimit
  }

  if (!/^\d+$/.test(value)) {
    return null
  }

  const limit = Number(value)

  if (limit < 1 || limit > maximumHistoryLimit) {
    return null
  }

  return limit
}

function clientRateLimitKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local'
}

function rateLimitResponse(): Response {
  return Response.json(
    { error: 'Too many requests. Please try again shortly.' },
    {
      status: 429,
      headers: { 'Retry-After': '60' },
    }
  )
}

function expectedStatus(percent: number): ReadingStatus {
  if (percent <= 25) {
    return 'dry'
  }

  if (percent <= 45) {
    return 'getting-dry'
  }

  return 'moist'
}

function isReadingPayload(value: unknown): value is ReadingPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const reading = value as Record<string, unknown>

  const validRssi =
    reading.rssi === null ||
    (
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
    reading.moisturePercent >= 0 &&
    reading.moisturePercent <= 100 &&
    typeof reading.status === 'string' &&
    ['moist', 'getting-dry', 'dry'].includes(reading.status) &&
    validRssi &&
    typeof reading.firmwareVersion === 'string' &&
    reading.firmwareVersion.length >= 1 &&
    reading.firmwareVersion.length <= 32
  )
}

async function createReading(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const authorization = request.headers.get('Authorization')

  if (
    !env.DEVICE_KEY ||
    authorization !== `Bearer ${env.DEVICE_KEY}`
  ) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  if (!isReadingPayload(payload)) {
    return Response.json(
      { error: 'Invalid reading' },
      { status: 400 }
    )
  }

  if (payload.status !== expectedStatus(payload.moisturePercent)) {
    return Response.json(
      { error: 'Status does not match moisture percentage' },
      { status: 400 }
    )
  }

  const rateLimit = await env.UPLOAD_RATE_LIMITER.limit({
    key: payload.deviceId,
  })

  if (!rateLimit.success) {
    return rateLimitResponse()
  }

  const result = await env.DB.prepare(`
    INSERT OR IGNORE INTO readings (
      device_id,
      sequence,
      raw,
      moisture_percent,
      status,
      rssi,
      firmware_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      payload.deviceId,
      payload.sequence,
      payload.raw,
      payload.moisturePercent,
      payload.status,
      payload.rssi,
      payload.firmwareVersion
    )
    .run()

  const duplicate = result.meta.changes === 0

  return Response.json(
    {
      ok: true,
      duplicate,
      sequence: payload.sequence,
    },
    { status: duplicate ? 200 : 201 }
  )
}

async function getLatestReading(
  request: Request,
  url: URL,
  env: WorkerEnv
): Promise<Response> {
  const deviceId = requestedDeviceId(url)

  if (!deviceId) {
    return Response.json(
      { error: 'A valid deviceId query parameter is required' },
      { status: 400 }
    )
  }

  const rateLimit = await env.LATEST_RATE_LIMITER.limit({
    key: clientRateLimitKey(request),
  })

  if (!rateLimit.success) {
    return rateLimitResponse()
  }

  const reading = await env.DB.prepare(`
    SELECT
      id,
      device_id,
      sequence,
      raw,
      moisture_percent,
      status,
      rssi,
      firmware_version,
      received_at
    FROM readings
    WHERE device_id = ?
    ORDER BY received_at DESC, id DESC
    LIMIT 1
  `)
    .bind(deviceId)
    .first<ReadingRow>()

  if (!reading) {
    return Response.json(
      { error: 'No readings found for this device' },
      { status: 404 }
    )
  }

  return Response.json(
    { reading: readingResponse(reading) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

async function getReadingHistory(
  request: Request,
  url: URL,
  env: WorkerEnv
): Promise<Response> {
  const deviceId = requestedDeviceId(url)
  const limit = requestedHistoryLimit(url)

  if (!deviceId) {
    return Response.json(
      { error: 'A valid deviceId query parameter is required' },
      { status: 400 }
    )
  }

  if (limit === null) {
    return Response.json(
      {
        error: `limit must be an integer from 1 to ${maximumHistoryLimit}`,
      },
      { status: 400 }
    )
  }

  const rateLimit = await env.HISTORY_RATE_LIMITER.limit({
    key: clientRateLimitKey(request),
  })

  if (!rateLimit.success) {
    return rateLimitResponse()
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      device_id,
      sequence,
      raw,
      moisture_percent,
      status,
      rssi,
      firmware_version,
      received_at
    FROM readings
    WHERE device_id = ?
    ORDER BY received_at DESC, id DESC
    LIMIT ?
  `)
    .bind(deviceId, limit)
    .all<ReadingRow>()

  const readings = result.results
    .map(readingResponse)
    .reverse()

  return Response.json(
    {
      deviceId,
      count: readings.length,
      readings,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (
      request.method === 'POST' &&
      url.pathname === '/api/v1/readings/'
    ) {
      return secureApiResponse(await createReading(request, env))
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/api/v1/readings/latest/'
    ) {
      return secureApiResponse(await getLatestReading(request, url, env))
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/api/v1/readings/history/'
    ) {
      return secureApiResponse(await getReadingHistory(request, url, env))
    }

    if (url.pathname.startsWith('/api/')) {
      return secureApiResponse(
        Response.json(
          { error: 'Not found' },
          { status: 404 }
        )
      )
    }

    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<WorkerEnv>
