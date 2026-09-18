// Vstupní bod — propojí všechny části dohromady.

import './style.css'

import { inicializujUtm } from './lib/utm'
import { inicializujAnalytiku } from './lib/analytics'
import { inicializujCookieListu } from './lib/cookie-lista'
import { inicializujKalkulacku } from './lib/kalkulacka'
import { inicializujFormular } from './lib/formular'
import { inicializujAccordion } from './lib/accordion'
import { inicializujStickyCta } from './lib/sticky-cta'

function start(): void {
  // UTM musí být první — zdroj návštěvy se čte z URL hned při načtení.
  inicializujUtm()
  inicializujAnalytiku()
  inicializujCookieListu()
  inicializujAccordion()

  const kalkulacka = inicializujKalkulacku()

  if (kalkulacka) {
    const form = document.getElementById('lead-form')
    if (form instanceof HTMLFormElement) {
      inicializujFormular(form, {
        kalkulacka,
        onUspech: () => kalkulacka.zobrazPodekovani(),
      })
    }

    // Všechna CTA na stránce vedou ke kalkulačce.
    document.querySelectorAll<HTMLAnchorElement>('[data-cta-kalkulacka]').forEach((odkaz) => {
      odkaz.addEventListener('click', (e) => {
        e.preventDefault()
        kalkulacka.prejdiNaKalkulacku()
      })
    })
  }

  inicializujStickyCta()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
