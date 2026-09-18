// Vstupní bod pro právní podstránky (/gdpr, /cookies) — jen styly a cookie lišta,
// žádná kalkulačka ani formuláře.

import './style.css'
import { inicializujAnalytiku } from './lib/analytics'
import { inicializujCookieListu } from './lib/cookie-lista'

inicializujAnalytiku()
inicializujCookieListu()
