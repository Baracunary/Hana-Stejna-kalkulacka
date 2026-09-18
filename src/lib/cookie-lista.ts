// Cookie lišta — tři tlačítka (Jen nezbytné / Nastavit / Přijmout vše).
// Nesmí překrývat CTA na mobilu ani být fullscreen; sedí dole a je nízká.

import { ziskejSouhlas, ulozSouhlas } from './consent'

export function inicializujCookieListu(): void {
  const lista = document.getElementById('cookie-lista')
  if (!lista) return

  // Souhlas už dřív udělen → lištu vůbec nezobrazovat.
  if (ziskejSouhlas()) {
    lista.remove()
    return
  }

  const nastaveni = lista.querySelector<HTMLElement>('[data-role="cookie-nastaveni"]')
  const prepinacAnalytika = lista.querySelector<HTMLInputElement>('[data-cookie="analytika"]')
  const prepinacMarketing = lista.querySelector<HTMLInputElement>('[data-cookie="marketing"]')

  lista.hidden = false

  function zavri(): void {
    lista!.hidden = true
    lista!.remove()
  }

  lista.querySelector('[data-akce="cookie-vse"]')?.addEventListener('click', () => {
    ulozSouhlas({ analytika: true, marketing: true })
    zavri()
  })

  lista.querySelector('[data-akce="cookie-nezbytne"]')?.addEventListener('click', () => {
    ulozSouhlas({ analytika: false, marketing: false })
    zavri()
  })

  lista.querySelector('[data-akce="cookie-nastavit"]')?.addEventListener('click', (e) => {
    if (!nastaveni) return
    nastaveni.hidden = !nastaveni.hidden
    ;(e.currentTarget as HTMLButtonElement).setAttribute('aria-expanded', String(!nastaveni.hidden))
  })

  lista.querySelector('[data-akce="cookie-ulozit"]')?.addEventListener('click', () => {
    ulozSouhlas({
      analytika: prepinacAnalytika?.checked ?? false,
      marketing: prepinacMarketing?.checked ?? false,
    })
    zavri()
  })
}
