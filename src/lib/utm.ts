// Čtení UTM parametrů a fbclid z URL a uložení do sessionStorage, aby přežily
// scroll/reload v rámci návštěvy a šlo je přilepit k odeslanému leadu.
// Bez toho by se u vícekrokové kalkulačky zdroj návštěvy ztratil.

export interface UtmData {
  source: string
  medium: string
  campaign: string
  content: string
  term: string
}

const KLIC_UTM = 'hanka_utm'
const KLIC_FBCLID = 'hanka_fbclid'

const PRAZDNE: UtmData = { source: '', medium: '', campaign: '', content: '', term: '' }

function bezpecneCti(klic: string): string | null {
  try {
    return sessionStorage.getItem(klic)
  } catch {
    return null
  }
}

function bezpecneZapis(klic: string, hodnota: string): void {
  try {
    sessionStorage.setItem(klic, hodnota)
  } catch {
    /* privátní režim / zablokované úložiště — tracking zdroje prostě nebude */
  }
}

/** Zavolat jednou při startu. Parametry z URL mají přednost před dříve uloženými. */
export function inicializujUtm(): void {
  const params = new URLSearchParams(window.location.search)

  const zUrl: UtmData = {
    source: params.get('utm_source') ?? '',
    medium: params.get('utm_medium') ?? '',
    campaign: params.get('utm_campaign') ?? '',
    content: params.get('utm_content') ?? '',
    term: params.get('utm_term') ?? '',
  }

  if (Object.values(zUrl).some((v) => v !== '')) {
    bezpecneZapis(KLIC_UTM, JSON.stringify(zUrl))
  }

  const fbclid = params.get('fbclid')
  if (fbclid) bezpecneZapis(KLIC_FBCLID, fbclid)
}

export function ziskejUtm(): UtmData {
  const ulozene = bezpecneCti(KLIC_UTM)
  if (!ulozene) return { ...PRAZDNE }

  try {
    const data = JSON.parse(ulozene) as Partial<UtmData>
    return { ...PRAZDNE, ...data }
  } catch {
    return { ...PRAZDNE }
  }
}

export function ziskejFbclid(): string {
  return bezpecneCti(KLIC_FBCLID) ?? ''
}
