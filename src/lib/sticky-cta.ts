// Sticky CTA lišta na mobilu — objeví se, jakmile hero sekce zmizí z viewportu,
// a zase zmizí, když je vidět kalkulačka (aby nepřekrývala vlastní formulář).

export function inicializujStickyCta(): void {
  const lista = document.getElementById('sticky-cta')
  const hero = document.getElementById('hero')
  const kalkulacka = document.getElementById('kalkulacka')
  const diky = document.getElementById('kalkulacka-diky')

  if (!lista || !hero || !('IntersectionObserver' in window)) return

  let heroViditelny = true
  let kalkulackaViditelna = false

  function prekresli(): void {
    // Po odeslání už nemá smysl pobízet ke kalkulačce.
    const hotovo = diky ? !diky.hidden : false
    lista!.hidden = hotovo || heroViditelny || kalkulackaViditelna
  }

  new IntersectionObserver(
    ([zaznam]) => {
      heroViditelny = zaznam?.isIntersecting ?? false
      prekresli()
    },
    { threshold: 0 },
  ).observe(hero)

  if (kalkulacka) {
    new IntersectionObserver(
      ([zaznam]) => {
        kalkulackaViditelna = zaznam?.isIntersecting ?? false
        prekresli()
      },
      { threshold: 0.15 },
    ).observe(kalkulacka)
  }

  prekresli()
}
