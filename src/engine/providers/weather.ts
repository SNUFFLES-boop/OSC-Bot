import { ETemperatureUnit } from '../../shared/config';
import { EProviderState, type ProviderStatus, type WeatherState } from '../../shared/protocol';

const REFRESH_MS = 15 * 60 * 1000;

type Fetch = typeof fetch;

export type WeatherProvider = ReturnType<typeof createWeatherProvider>;

/** Current weather from Open-Meteo (free, no API key): geocode the city once, then poll. */
export function createWeatherProvider({ onChange, fetchImpl = fetch }: { onChange: () => void; fetchImpl?: Fetch }) {
    let timer: ReturnType<typeof setInterval> | null = null;
    let city = '';
    let unit = ETemperatureUnit.Celsius;
    let place: { name: string; latitude: number; longitude: number } | null = null;
    let weather: WeatherState | null = null;
    let status: ProviderStatus = { state: EProviderState.Off, detail: null };
    let generation = 0;

    async function refresh() {
        const current = ++generation;
        if (!city) {
            status = { state: EProviderState.Error, detail: 'Enter a city.' };
            onChange();
            return;
        }
        try {
            if (!place) {
                const geo = await getJson(
                    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(city)}`,
                );
                const hit = geo?.results?.[0];
                if (!hit) throw new Error(`No place called "${city}".`);
                place = {
                    name: [hit.name, hit.country_code].filter(Boolean).join(', '),
                    latitude: hit.latitude,
                    longitude: hit.longitude,
                };
            }
            const data = await getJson(
                `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
                    `&current=temperature_2m,weather_code,is_day&temperature_unit=${unit === ETemperatureUnit.Fahrenheit ? 'fahrenheit' : 'celsius'}`,
            );
            if (current !== generation) return;
            const code = Number(data?.current?.weather_code);
            const [icon, label] = describeWeather(code, data?.current?.is_day !== 0);
            weather = {
                place: place.name,
                temperature: Number(data?.current?.temperature_2m),
                unit,
                icon,
                label,
                updatedAt: Date.now(),
            };
            status = { state: EProviderState.Ok, detail: null };
        } catch (error) {
            if (current !== generation) return;
            status = { state: EProviderState.Error, detail: error instanceof Error ? error.message : String(error) };
        }
        onChange();
    }

    async function getJson(url: string) {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Weather service answered ${response.status}.`);
        return response.json();
    }

    return {
        start(nextCity: string, nextUnit: ETemperatureUnit) {
            const changedPlace = nextCity.trim().toLowerCase() !== city.toLowerCase();
            if (timer && !changedPlace && nextUnit === unit) return;
            if (changedPlace) place = null;
            city = nextCity.trim();
            unit = nextUnit;
            if (!timer) {
                timer = setInterval(() => void refresh(), REFRESH_MS);
                timer.unref?.();
            }
            status = { state: EProviderState.Starting, detail: null };
            void refresh();
        },
        refresh: () => void refresh(),
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
            generation++;
            weather = null;
            status = { state: EProviderState.Off, detail: null };
        },
        get weather() {
            return weather;
        },
        get status() {
            return status;
        },
    };
}

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function describeWeather(code: number, day = true): [string, string] {
    if (code === 0) return day ? ['☀', 'Clear'] : ['☾', 'Clear'];
    if (code <= 2) return day ? ['⛅', 'Partly cloudy'] : ['☁', 'Partly cloudy'];
    if (code === 3) return ['☁', 'Overcast'];
    if (code === 45 || code === 48) return ['🌫', 'Fog'];
    if (code >= 51 && code <= 57) return ['🌦', 'Drizzle'];
    if (code >= 61 && code <= 67) return ['🌧', 'Rain'];
    if (code >= 71 && code <= 77) return ['❄', 'Snow'];
    if (code >= 80 && code <= 82) return ['🌦', 'Showers'];
    if (code === 85 || code === 86) return ['🌨', 'Snow showers'];
    if (code >= 95) return ['⛈', 'Thunderstorm'];
    return ['🌡', 'Weather'];
}
