// Jemný fade-in při scrollu pro dekorativní prvky mimo kalkulačku
// (ta má vlastní krok-vstup animaci). Respektuje prefers-reduced-motion přes CSS.

export function inicializujFadeIn(): void {
  const prvky = document.querySelectorAll<HTMLElement>('[data-fade-in]')
  if (prvky.length === 0) return

  if (!('IntersectionObserver' in window)) {
    prvky.forEach((el) => el.classList.add('je-viditelny'))
    return
  }

  const pozorovatel = new IntersectionObserver(
    (zaznamy) => {
      zaznamy.forEach((zaznam) => {
        if (!zaznam.isIntersecting) return
        zaznam.target.classList.add('je-viditelny')
        pozorovatel.unobserve(zaznam.target)
      })
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  )

  prvky.forEach((el) => pozorovatel.observe(el))
}
