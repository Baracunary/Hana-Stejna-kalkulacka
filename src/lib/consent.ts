// Stav cookie souhlasu — tři úrovně dle cookie lišty (Jen nezbytné / Nastavit / Přijmout vše).
// Marketingové a analytické skripty se načítají výhradně po udělení příslušného souhlasu.

export interface Souhlas {
  nezbytne: true
  analytika: boolean
  marketing: boolean
  /** ISO čas udělení — kvůli doložitelnosti. */
  cas: string
}

const KLIC = 'hanka_souhlas'

type Posluchac = (souhlas: Souhlas) => void
const posluchaci: Posluchac[] = []

export function ziskejSouhlas(): Souhlas | null {
  try {
    const ulozeny = localStorage.getItem(KLIC)
    if (!ulozeny) return null
    const data = JSON.parse(ulozeny) as Partial<Souhlas>
    if (typeof data.analytika !== 'boolean' || typeof data.marketing !== 'boolean') return null
    return { nezbytne: true, analytika: data.analytika, marketing: data.marketing, cas: data.cas ?? '' }
  } catch {
    return null
  }
}

export function ulozSouhlas(volba: { analytika: boolean; marketing: boolean }): Souhlas {
  const souhlas: Souhlas = {
    nezbytne: true,
    analytika: volba.analytika,
    marketing: volba.marketing,
    cas: new Date().toISOString(),
  }

  try {
    localStorage.setItem(KLIC, JSON.stringify(souhlas))
  } catch {
    /* zablokované úložiště — souhlas platí aspoň pro tuhle návštěvu */
  }

  posluchaci.forEach((fn) => fn(souhlas))
  return souhlas
}

export function naZmenuSouhlasu(fn: Posluchac): void {
  posluchaci.push(fn)
}
