// Kontrola jména, telefonu a e-mailu. Zprávy jsou psané tak, aby uživateli
// řekly, co má udělat, ne jen že je něco špatně.

export interface VysledekValidace {
  platne: boolean
  /** Když je platne === true, může tu být jen upozornění (např. návrh opravy překlepu). */
  chyba?: string
  /** Navrhovaná oprava e-mailové domény. */
  navrh?: string
}

export function validujJmeno(hodnota: string): VysledekValidace {
  const jmeno = hodnota.trim().replace(/\s+/g, ' ')
  if (jmeno.length === 0) return { platne: false, chyba: 'Vyplňte prosím své jméno.' }
  if (jmeno.length < 3) return { platne: false, chyba: 'Jméno je příliš krátké.' }
  if (!/[\p{L}]/u.test(jmeno)) return { platne: false, chyba: 'Jméno musí obsahovat písmena.' }
  return { platne: true }
}

/**
 * Normalizace českého/slovenského čísla na tvar +420XXXXXXXXX.
 * Vrací null, pokud číslo nejde takto přečíst.
 */
export function normalizujTelefon(hodnota: string): string | null {
  const ocistene = hodnota.replace(/[\s()\-./]/g, '')

  if (/^\+42[01]\d{9}$/.test(ocistene)) return ocistene
  if (/^0042[01]\d{9}$/.test(ocistene)) return `+${ocistene.slice(2)}`
  if (/^42[01]\d{9}$/.test(ocistene)) return `+${ocistene}`
  // Devítimístné číslo bez předvolby bereme jako české.
  if (/^\d{9}$/.test(ocistene)) return `+420${ocistene}`

  return null
}

export function validujTelefon(hodnota: string): VysledekValidace {
  if (hodnota.trim().length === 0) return { platne: false, chyba: 'Vyplňte prosím telefon.' }

  const normalizovany = normalizujTelefon(hodnota)
  if (!normalizovany) {
    return { platne: false, chyba: 'Zadejte telefon ve tvaru 777 123 456 nebo +420 777 123 456.' }
  }
  return { platne: true }
}

// Nejčastější překlepy v doménách — nabídneme opravu, ale nikdy nevalidujeme jako chybu.
const PREKLEPY_DOMEN: Record<string, string> = {
  'gmail.cz': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gnail.com': 'gmail.com',
  'seznam.com': 'seznam.cz',
  'seznam.c': 'seznam.cz',
  'sezam.cz': 'seznam.cz',
  'seznma.cz': 'seznam.cz',
  'centrum.com': 'centrum.cz',
  'email.com': 'email.cz',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'icloud.cz': 'icloud.com',
}

export function validujEmail(hodnota: string): VysledekValidace {
  const email = hodnota.trim()
  if (email.length === 0) return { platne: false, chyba: 'Vyplňte prosím e-mail.' }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { platne: false, chyba: 'E-mail nevypadá správně — zkontrolujte ho prosím.' }
  }

  const domena = email.split('@')[1]?.toLowerCase()
  const opravena = domena ? PREKLEPY_DOMEN[domena] : undefined
  if (domena && opravena) {
    const navrh = `${email.split('@')[0]}@${opravena}`
    return { platne: true, chyba: `Nechtěli jste napsat ${opravena}?`, navrh }
  }

  return { platne: true }
}
