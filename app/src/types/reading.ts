export type ReadingStatus =
  | 'moist'
  | 'getting-dry'
  | 'dry'

export interface Reading {
  deviceId: string
  sequence: number
  raw: number
  moisturePercent: number
  status: ReadingStatus
  rssi: number | null
  firmwareVersion: string
  receivedAt: string
}

export interface LatestReadingResponse {
  reading: Reading
}
