// Meta Pixel (client-side) + volitelná Plausible analytika.
// Skripty se načtou až po udělení příslušného souhlasu (marketing / analytika).
// event_id se generuje na klientovi a posílá i na server (api/lead.ts) kvůli
// deduplikaci Pixel ↔ Conversions API.
//
// PRAVIDLO: Lead se posílá VÝHRADNĚ po úspěšné odpovědi serveru (HTTP 200).
// Žádná událost se nesmí odpálit "dopředu" ani spekulativně.

import { ziskejSouhlas, naZmenuSouhlasu } from './consent'

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
  }
}

const PIXEL_ID = import.meta.env.PUBLIC_META_PIXEL_ID as string | undefined
const PLAUSIBLE_DOMAIN = import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN as string | undefined

let pixelNacten = false
let analytikaNactena = false

// Každá událost jen jednou za návštěvu — jinak by se v Ads Manageru nafoukly počty.
const odeslaneUdalosti = new Set<string>()

function nactiMetaPixel(): void {
  if (pixelNacten || !PIXEL_ID) return
  pixelNacten = true

  /* eslint-disable */
  ;(function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return
    const n: any = (f.fbq = function (...args: unknown[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args)
    })
    if (!f._fbq) f._fbq = n
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    const t = b.createElement(e) as HTMLScriptElement
    t.async = true
    t.src = v
    const s = b.getElementsByTagName(e)[0]
    if (s) s.parentNode?.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */

  window.fbq?.('init', PIXEL_ID)
  window.fbq?.('track', 'PageView')
}

function nactiPlausible(): void {
  if (analytikaNactena || !PLAUSIBLE_DOMAIN) return
  analytikaNactena = true

  const skript = document.createElement('script')
  skript.defer = true
  skript.dataset.domain = PLAUSIBLE_DOMAIN
  skript.src = 'https://plausible.io/js/script.js'
  document.head.appendChild(skript)
}

/** Zavolat jednou při startu — zohlední už dřív uložený souhlas a poslouchá změny. */
export function inicializujAnalytiku(): void {
  const soucasny = ziskejSouhlas()
  if (soucasny?.marketing) nactiMetaPixel()
  if (soucasny?.analytika) nactiPlausible()

  naZmenuSouhlasu((souhlas) => {
    if (souhlas.marketing) nactiMetaPixel()
    if (souhlas.analytika) nactiPlausible()
  })
}

/**
 * ViewContent — návštěvník se reálně dostal ke kalkulačce (proscrolloval k ní).
 * Signál skutečného zájmu, ne pouhé načtení stránky.
 */
export function trackViewContent(): void {
  if (odeslaneUdalosti.has('ViewContent')) return
  odeslaneUdalosti.add('ViewContent')
  window.fbq?.('track', 'ViewContent')
}

/**
 * CustomizeProduct — návštěvník zahájil kalkulačku (odpověděl na první otázku).
 * Nejdůležitější mikro-konverze pro optimalizaci kampaně.
 */
export function trackZahajeniKalkulacky(zamer: string): void {
  if (odeslaneUdalosti.has('CustomizeProduct')) return
  odeslaneUdalosti.add('CustomizeProduct')
  window.fbq?.('track', 'CustomizeProduct', { content_category: zamer })
}

/**
 * Vlastní událost za každý dokončený krok — umožní v Ads Manageru vidět,
 * kde lidé z kalkulačky odpadávají. Každý krok se posílá nejvýš jednou.
 */
export function trackKrokKalkulacky(cislo: number, nazev: string): void {
  const klic = `krok-${cislo}`
  if (odeslaneUdalosti.has(klic)) return
  odeslaneUdalosti.add(klic)
  window.fbq?.('trackCustom', 'KalkulackaKrok', { krok: cislo, nazev })
}

/**
 * Vlastní událost — návštěvníkovi se zobrazil okamžitý orientační odhad, ještě
 * před kontaktním formulářem. Užitečný mezikrokový signál pro optimalizaci
 * kampaně: hodnota (odpověď na "kolik mi banka půjčí?") byla doručena, i když
 * kontakt třeba ještě neodeslal.
 */
export function trackOrientacniVysledek(): void {
  if (odeslaneUdalosti.has('OrientacniVysledek')) return
  odeslaneUdalosti.add('OrientacniVysledek')
  window.fbq?.('trackCustom', 'OrientacniVysledek')
}

/** InitiateCheckout — návštěvník došel na krok s kontaktními údaji. */
export function trackZahajeniKontaktu(): void {
  if (odeslaneUdalosti.has('InitiateCheckout')) return
  odeslaneUdalosti.add('InitiateCheckout')
  window.fbq?.('track', 'InitiateCheckout')
}

/** Vygeneruje event_id sdílený mezi Pixel Lead eventem a serverovým CAPI voláním. */
export function vygenerujEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `lead-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Lead — volat VÝHRADNĚ po úspěšném uložení na serveru. */
export function trackLead(eventId: string): void {
  window.fbq?.('track', 'Lead', {}, { eventID: eventId })
}
