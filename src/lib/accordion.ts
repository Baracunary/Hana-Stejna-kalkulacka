// FAQ accordion — přístupný přes native <details>/<summary>, JS jen doplňuje
// "zavřít ostatní při otevření" chování pro přehlednost na mobilu.

export function inicializujAccordion(): void {
  const polozky = Array.from(document.querySelectorAll<HTMLDetailsElement>('[data-faq] details'))
  if (polozky.length === 0) return

  polozky.forEach((polozka) => {
    polozka.addEventListener('toggle', () => {
      if (!polozka.open) return
      polozky.forEach((ostatni) => {
        if (ostatni !== polozka) ostatni.open = false
      })
    })
  })
}
