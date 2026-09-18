// Lead formulář (poslední krok kalkulačky): honeypot, time-trap, validace, odeslání na /api/lead.
// Pole se hledají přes data-pole atributy uvnitř konkrétního <form>, ne přes globální ID,
// aby šlo mít na stránce víc instancí formuláře.

import { validujJmeno, validujTelefon, validujEmail, normalizujTelefon } from './validace'
import { ziskejUtm, ziskejFbclid } from './utm'
import { trackLead, vygenerujEventId } from './analytics'
import type { Kalkulacka } from './kalkulacka'

const CAS_NACTENI = Date.now()
const MIN_CAS_PRED_ODESLANIM_MS = 3000

const TELEFON_HANKA = '+420 774 431 977'

function pole<T extends HTMLElement = HTMLElement>(form: HTMLFormElement, nazev: string): T | null {
  return form.querySelector<T>(`[data-pole="${nazev}"]`)
}

function nastavChybu(form: HTMLFormElement, nazev: string, vstup: HTMLElement | null, zprava: string | null): void {
  const chybaEl = form.querySelector<HTMLElement>(`[data-chyba="${nazev}"]`)
  if (chybaEl) chybaEl.textContent = zprava ?? ''
  vstup?.setAttribute('aria-invalid', String(Boolean(zprava)))
}

function sestavPayload(
  udaje: { jmeno: string; telefon: string; email: string; poznamka: string; souhlasCas: string },
  eventId: string,
  kalkulacka: Kalkulacka,
) {
  const stav = kalkulacka.ziskejStav()
  const odhad = kalkulacka.ziskejOdhad()

  return {
    jmeno: udaje.jmeno,
    telefon: udaje.telefon,
    email: udaje.email,
    poznamka: udaje.poznamka,
    souhlas: true,
    souhlas_cas: udaje.souhlasCas,
    event_id: eventId,
    kalkulacka: stav,
    // Vnitřní odhad pro Hanku — na webu se nikde nezobrazuje.
    odhad,
    utm: ziskejUtm(),
    fbclid: ziskejFbclid(),
    url: window.location.href,
    user_agent: navigator.userAgent,
  }
}

export interface VolbyFormulare {
  kalkulacka: Kalkulacka
  onUspech: () => void
}

export function inicializujFormular(form: HTMLFormElement, volby: VolbyFormulare): void {
  const vstupJmeno = pole<HTMLInputElement>(form, 'jmeno')
  const vstupTelefon = pole<HTMLInputElement>(form, 'telefon')
  const vstupEmail = pole<HTMLInputElement>(form, 'email')
  const vstupPoznamka = pole<HTMLTextAreaElement>(form, 'poznamka')
  const vstupSouhlas = pole<HTMLInputElement>(form, 'souhlas')
  const vstupHoneypot = pole<HTMLInputElement>(form, 'honeypot')
  const tlacitkoOdeslat = form.querySelector<HTMLButtonElement>('[data-role="btn-odeslat"]')
  const chybaObecna = form.querySelector<HTMLElement>('[data-role="chyba-obecna"]')
  const opravaEmailu = form.querySelector<HTMLButtonElement>('[data-role="oprava-emailu"]')

  if (!vstupJmeno || !vstupTelefon || !vstupEmail || !vstupSouhlas || !tlacitkoOdeslat) {
    console.error('Formulář nemá všechna povinná pole — odeslání nebude fungovat.')
    return
  }

  const puvodniTextTlacitka = tlacitkoOdeslat.textContent?.trim() ?? 'Odeslat'

  // Našeptávač překlepu v doméně e-mailu — reaguje hned po opuštění pole, ne až při odeslání.
  vstupEmail.addEventListener('blur', () => {
    if (vstupEmail.value.trim() === '') return
    const vysledek = validujEmail(vstupEmail.value)
    nastavChybu(form, 'email', vstupEmail, vysledek.platne ? (vysledek.chyba ?? null) : vysledek.chyba!)

    if (!opravaEmailu) return
    if (vysledek.platne && vysledek.navrh) {
      opravaEmailu.hidden = false
      opravaEmailu.textContent = `Použít ${vysledek.navrh}`
      opravaEmailu.onclick = () => {
        vstupEmail.value = vysledek.navrh!
        nastavChybu(form, 'email', vstupEmail, null)
        opravaEmailu.hidden = true
      }
    } else {
      opravaEmailu.hidden = true
    }
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()

    // Honeypot — bot pole vyplní, člověk ho nikdy nevidí. Tiše zahodíme, žádná chyba.
    if (vstupHoneypot && vstupHoneypot.value.trim() !== '') return

    // Time-trap — odeslání rychlejší než 3 s od načtení stránky je skoro jistě bot.
    if (Date.now() - CAS_NACTENI < MIN_CAS_PRED_ODESLANIM_MS) return

    const jmeno = validujJmeno(vstupJmeno.value)
    nastavChybu(form, 'jmeno', vstupJmeno, jmeno.platne ? null : jmeno.chyba!)

    const telefon = validujTelefon(vstupTelefon.value)
    nastavChybu(form, 'telefon', vstupTelefon, telefon.platne ? null : telefon.chyba!)

    const email = validujEmail(vstupEmail.value)
    // U e-mailu může být "chyba" jen návrh opravy překlepu — pole zůstává platné.
    nastavChybu(form, 'email', vstupEmail, !email.platne ? email.chyba! : (email.chyba ?? null))

    const souhlasZaskrtnut = vstupSouhlas.checked
    nastavChybu(
      form,
      'souhlas',
      vstupSouhlas,
      souhlasZaskrtnut ? null : 'Pro odeslání je potřeba souhlas se zpracováním údajů.',
    )

    if (!jmeno.platne || !telefon.platne || !email.platne || !souhlasZaskrtnut) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    tlacitkoOdeslat.disabled = true
    tlacitkoOdeslat.textContent = 'Odesílám…'
    if (chybaObecna) chybaObecna.hidden = true

    const eventId = vygenerujEventId()
    const payload = sestavPayload(
      {
        jmeno: vstupJmeno.value.trim(),
        telefon: normalizujTelefon(vstupTelefon.value)!,
        email: vstupEmail.value.trim(),
        poznamka: vstupPoznamka?.value.trim() ?? '',
        souhlasCas: new Date().toISOString(),
      },
      eventId,
      volby.kalkulacka,
    )

    try {
      const odpoved = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!odpoved.ok) throw new Error(`Server vrátil ${odpoved.status}`)

      // Lead se posílá až tady — po potvrzení serverem, nikdy dřív.
      trackLead(eventId)
      volby.onUspech()
    } catch {
      tlacitkoOdeslat.disabled = false
      tlacitkoOdeslat.textContent = puvodniTextTlacitka
      if (chybaObecna) {
        chybaObecna.hidden = false
        chybaObecna.textContent = `Odeslání se teď nepovedlo, vaše údaje jsou ale vyplněné správně. Zkuste to prosím znovu, nebo zavolejte na ${TELEFON_HANKA}.`
      }
    }
  })
}
