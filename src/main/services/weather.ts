/** 天气服务：Open-Meteo（免费、无需 API Key）；城市经 geocoding 接口解析并记忆 */
import type { WeatherNow } from '@shared/types'
import { getConfig, setConfig } from './appconfig'

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

interface GeoResult {
  results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>
}

export async function getWeather(cityInput?: string): Promise<WeatherNow> {
  const cfg = getConfig()
  const city = (cityInput ?? '').trim() || cfg.weather.city || '北京'
  try {
    const geoResp = await fetch(
      `${GEO_URL}?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!geoResp.ok) throw new Error(`地理编码 HTTP ${geoResp.status}`)
    const geo = (await geoResp.json()) as GeoResult
    const hit = geo.results?.[0]
    if (!hit) throw new Error(`没找到城市「${city}」`)

    const resp = await fetch(
      `${FORECAST_URL}?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=1`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!resp.ok) throw new Error(`天气接口 HTTP ${resp.status}`)
    const data = (await resp.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; weather_code?: number; wind_speed_10m?: number }
      daily?: {
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_probability_max?: number[]
      }
    }
    // 记忆本次城市
    const name = hit.name || city
    if (name !== cfg.weather.city) setConfig({ weather: { city: name } })

    return {
      ok: true,
      city: name,
      temp: data.current?.temperature_2m,
      humidity: data.current?.relative_humidity_2m,
      wind: data.current?.wind_speed_10m,
      code: data.current?.weather_code,
      tmax: data.daily?.temperature_2m_max?.[0],
      tmin: data.daily?.temperature_2m_min?.[0],
      pop: data.daily?.precipitation_probability_max?.[0]
    }
  } catch (e) {
    return { ok: false, city, error: e instanceof Error ? e.message : String(e) }
  }
}
