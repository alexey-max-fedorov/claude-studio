const DEBUG = process.env.NODE_ENV === "development" || process.env.PLASMO_PUBLIC_DEBUG === "true"
export const debug = (...args: unknown[]): void => { if (DEBUG) console.log(...args) }
