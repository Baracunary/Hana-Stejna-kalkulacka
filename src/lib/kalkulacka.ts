// Orchestrace vícekrokové kalkulačky.
//
// Kroky jsou v index.html jako <section data-krok="N">, pole se hledají přes
// data-pole atributy. Modul drží stav, validuje krok po kroku, řídí progres
// a na konci předá stav formuláři (formular.ts), který ho odešle na /api/lead.
//
// Návštěvníkovi se ŽÁDNÝ vypočítaný limit nezobrazuje — výsledek z limit.ts jde
// jen do e-mailu Hance jako podklad. Viz komentář v limit.ts.

import type { TypPrijmu, Ucel, VstupLimitu, VysledekLimitu, Zamer } from './limit'
import { vypocitejLimit, vypocitejOrientacniRozpeti, formatujKc, formatujCislo } from './limit'
import {
  trackViewContent,
  trackZahajeniKalkulacky,
  trackKrokKalkulacky,
  trackOrientacniVysledek,
  trackZahajeniKontaktu,
} from './analytics'

export interface KalkulackaStav {
  zamer: Zamer | null
  ucel: Ucel
  typNemovitosti: string
  hodnotaZajisteni: number
  potrebnaCastka: number
  vlastniZdroje: number
  vek: number
  prijemHlavni: number
  typPrijmuHlavni: TypPrijmu
  maSpoluzadatele: boolean
  prijemSpoluzadatel: number
  typPrijmuSpoluzadatel: TypPrijmu | null
  stavajiciSplatky: number
  kreditniLimity: number
  pocetDospelych: number
  pocetDeti: number
}

const POCET_KROKU = 6

/** Popisky kroků pro tracking a pro text nad progres pruhem. */
const NAZVY_KROKU: Record<number, string> = {
  1: 'Co řešíte',
  2: 'Nemovitost',
  3: 'Vlastní zdroje',
  4: 'Příjmy',
  5: 'Závazky a domácnost',
  6: 'Orientační výsledek a kontakt',
}

function vychoziStav(): KalkulackaStav {
  return {
    zamer: null,
    ucel: 'vlastni_bydleni',
    typNemovitosti: '',
    hodnotaZajisteni: 0,
    potrebnaCastka: 0,
    vlastniZdroje: 0,
    vek: 0,
    prijemHlavni: 0,
    typPrijmuHlavni: 'zamestnanec',
    maSpoluzadatele: false,
    prijemSpoluzadatel: 0,
    typPrijmuSpoluzadatel: null,
    stavajiciSplatky: 0,
    kreditniLimity: 0,
    pocetDospelych: 1,
    pocetDeti: 0,
  }
}

/* -------------------------------------------------------------------------
   Pomocníci pro DOM
   ------------------------------------------------------------------------- */

function cislo(hodnota: string): number {
  // Uživatelé píšou "4 500 000", "4.500.000" i "4500000" — sjednotíme na číslo.
  const ocistene = hodnota.replace(/[\s  .]/g, '').replace(',', '.')
  const n = Number(ocistene)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Živé formátování částky s mezerami po tisících, se zachováním pozice kurzoru na konci. */
function pripojFormatovaniCastky(vstup: HTMLInputElement): void {
  const preformatuj = () => {
    const naKonci = vstup.selectionStart === vstup.value.length
    const hodnota = cislo(vstup.value)
    vstup.value = hodnota > 0 ? hodnota.toLocaleString('cs-CZ').replace(/[  ]/g, ' ') : ''
    if (naKonci) {
      const konec = vstup.value.length
      vstup.setSelectionRange(konec, konec)
    }
  }
  vstup.addEventListener('input', preformatuj)
  vstup.addEventListener('blur', preformatuj)
}

function nastavChybuKroku(krok: HTMLElement, zprava: string | null): void {
  const el = krok.querySelector<HTMLElement>('[data-role="chyba-kroku"]')
  if (!el) return
  el.textContent = zprava ?? ''
  el.hidden = !zprava
}

function oznacNeplatne(el: HTMLElement | null, neplatne: boolean): void {
  el?.setAttribute('aria-invalid', String(neplatne))
}

/* -------------------------------------------------------------------------
   Kalkulačka
   ------------------------------------------------------------------------- */

export interface Kalkulacka {
  ziskejStav: () => KalkulackaStav
  /** Vnitřní odhad limitu — přiloží se k leadu pro Hanku, uživateli se nezobrazuje. */
  ziskejOdhad: () => ReturnType<typeof vypocitejLimit> | null
  /** Přepne na děkovnou obrazovku. */
  zobrazPodekovani: () => void
  /** Skočí na kalkulačku a případně rovnou otevře první krok. */
  prejdiNaKalkulacku: () => void
}

export function inicializujKalkulacku(): Kalkulacka | null {
  const obalNalezeny = document.getElementById('kalkulacka')
  if (!obalNalezeny) return null
  // Explicitní přetypování na non-null: díky němu narrow platí i uvnitř
  // vnořených `function` deklarací níže (precti, zobrazKrok), kde by TS
  // jinak typ obal znovu rozšířil na HTMLElement | null.
  const obal: HTMLElement = obalNalezeny

  const stav = vychoziStav()
  let aktualniKrok = 1

  const kroky = new Map<number, HTMLElement>()
  obal.querySelectorAll<HTMLElement>('[data-krok]').forEach((el) => {
    kroky.set(Number(el.dataset.krok), el)
  })

  const progresVypln = obal.querySelector<HTMLElement>('[data-role="progres-vypln"]')
  const progresText = obal.querySelector<HTMLElement>('[data-role="progres-text"]')
  const progresObal = obal.querySelector<HTMLElement>('[data-role="progres"]')
  const podekovani = document.getElementById('kalkulacka-diky')

  /* --- ViewContent: návštěvník se reálně doscrolloval ke kalkulačce --- */
  if ('IntersectionObserver' in window) {
    const pozorovatel = new IntersectionObserver(
      (zaznamy) => {
        if (zaznamy.some((z) => z.isIntersecting)) {
          trackViewContent()
          pozorovatel.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    pozorovatel.observe(obal)
  } else {
    trackViewContent()
  }

  /** Sestaví VstupLimitu z aktuálního stavu a spočítá odhad. Sdílené pro krok
   *  s orientačním výsledkem i pro finální odhad přiložený k odeslanému leadu. */
  function spocitejOdhad(): VysledekLimitu | null {
    if (!stav.zamer) return null
    const vstupLimitu: VstupLimitu = {
      zamer: stav.zamer,
      ucel: stav.ucel,
      hodnotaZajisteni: stav.hodnotaZajisteni,
      potrebnaCastka: stav.potrebnaCastka,
      vlastniZdroje: stav.vlastniZdroje,
      vek: stav.vek,
      prijemHlavni: stav.prijemHlavni,
      typPrijmuHlavni: stav.typPrijmuHlavni,
      prijemSpoluzadatel: stav.prijemSpoluzadatel,
      typPrijmuSpoluzadatel: stav.typPrijmuSpoluzadatel,
      stavajiciSplatky: stav.stavajiciSplatky,
      kreditniLimity: stav.kreditniLimity,
      pocetDospelych: stav.pocetDospelych,
      pocetDeti: stav.pocetDeti,
    }
    return vypocitejLimit(vstupLimitu)
  }

  /** Vykreslí okamžitý orientační rozsah do kroku 6 — hrubší číslo než finální
   *  odhad, schválně motivující k odeslání kontaktu (viz limit.ts). */
  function vykresliVysledek(): void {
    const krok6 = kroky.get(6)
    if (!krok6) return

    const elRozpeti = krok6.querySelector<HTMLElement>('[data-role="vysledek-rozpeti"]')
    const elPopis = krok6.querySelector<HTMLElement>('[data-role="vysledek-popis"]')
    if (!elRozpeti || !elPopis) return

    const vysledek = spocitejOdhad()
    const rozpeti = vysledek ? vypocitejOrientacniRozpeti(vysledek) : null

    if (!rozpeti) {
      elRozpeti.textContent = 'Individuální posouzení'
      elPopis.textContent =
        'Podle zadaných údajů to bude potřeba probrat osobně — pojďme se na vaši situaci podívat společně.'
      return
    }

    // Rozdělené na dva <span> s whitespace-nowrap, ať se na mobilu případné
    // zalomení stane u pomlčky mezi částkami, ne uprostřed čísla.
    // Bezpečné i bez escapování — obsah je vždy jen naformátované číslo, nikdy vstup od uživatele.
    elRozpeti.replaceChildren()
    const spanDolni = document.createElement('span')
    spanDolni.className = 'whitespace-nowrap'
    spanDolni.textContent = formatujCislo(rozpeti.dolni)
    const spanHorni = document.createElement('span')
    spanHorni.className = 'whitespace-nowrap'
    spanHorni.textContent = formatujKc(rozpeti.horni)
    elRozpeti.append(spanDolni, ' – ', spanHorni)

    elPopis.textContent = 'Odhad vašeho maximálního hypotečního limitu podle zadaných údajů.'
  }

  /* --- vykreslení kroku --- */
  function zobrazKrok(cisloKroku: number, posunout = true): void {
    aktualniKrok = cisloKroku

    kroky.forEach((el, n) => {
      const aktivni = n === cisloKroku
      el.hidden = !aktivni
      if (aktivni) {
        el.classList.remove('krok-vstup')
        // Vynucený reflow, aby se animace spustila i při rychlém překliknutí.
        void el.offsetWidth
        el.classList.add('krok-vstup')
      }
    })

    const procenta = Math.round(((cisloKroku - 1) / POCET_KROKU) * 100)
    if (progresVypln) progresVypln.style.width = `${Math.max(procenta, 4)}%`
    if (progresText) progresText.textContent = `Krok ${cisloKroku} z ${POCET_KROKU} · ${NAZVY_KROKU[cisloKroku] ?? ''}`
    if (progresObal) {
      progresObal.setAttribute('aria-valuenow', String(cisloKroku))
      progresObal.setAttribute('aria-valuetext', `Krok ${cisloKroku} z ${POCET_KROKU}`)
    }

    // Krok 6 je teď jedna obrazovka — orientační výsledek i kontaktní formulář
    // pohromadě, bez mezikroku — proto se tu spouští oba trackovací eventy.
    if (cisloKroku === 6) {
      vykresliVysledek()
      trackOrientacniVysledek()
      trackZahajeniKontaktu()
    }

    if (posunout) {
      const aktivni = kroky.get(cisloKroku)
      // Focus na nadpis kroku kvůli čtečkám; preventScroll, ať si scroll řídíme sami.
      aktivni?.querySelector<HTMLElement>('[data-role="nadpis-kroku"]')?.focus({ preventScroll: true })
      obal.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /* --- krok 1: co řešíte --- */
  const krok1 = kroky.get(1)
  krok1?.querySelectorAll<HTMLButtonElement>('[data-zamer]').forEach((tlacitko) => {
    tlacitko.addEventListener('click', () => {
      const zamer = tlacitko.dataset.zamer as Zamer
      stav.zamer = zamer

      krok1.querySelectorAll<HTMLButtonElement>('[data-zamer]').forEach((t) => {
        t.setAttribute('aria-pressed', String(t === tlacitko))
      })

      trackZahajeniKalkulacky(zamer)
      trackKrokKalkulacky(1, NAZVY_KROKU[1]!)
      prizpusobKrok2(zamer)
      // Krátká prodleva, aby byl vidět zvolený stav, než se krok přepne.
      window.setTimeout(() => zobrazKrok(2), 180)
    })
  })

  /* --- krok 2: přizpůsobení textů podle záměru --- */
  const krok2 = kroky.get(2)
  function prizpusobKrok2(zamer: Zamer): void {
    if (!krok2) return

    const popisky: Record<Zamer, { hodnota: string; napoveda: string; castka: string; castkaNapoveda: string }> = {
      koupe: {
        hodnota: 'Kupní cena nemovitosti',
        napoveda: 'Cena, za kterou nemovitost kupujete. Pokud ji ještě nemáte vybranou, zadejte částku, se kterou počítáte.',
        castka: '',
        castkaNapoveda: '',
      },
      rekonstrukce: {
        hodnota: 'Odhadovaná hodnota nemovitosti po rekonstrukci',
        napoveda: 'Banka zastavuje nemovitost v hodnotě po dokončení rekonstrukce.',
        castka: 'Rozpočet rekonstrukce',
        castkaNapoveda: 'Kolik má rekonstrukce stát celkem.',
      },
      vystavba: {
        hodnota: 'Odhadovaná hodnota po dokončení',
        napoveda: 'Hodnota dokončené stavby včetně pozemku.',
        castka: 'Rozpočet výstavby',
        castkaNapoveda: 'Celkové náklady na výstavbu, případně včetně pozemku.',
      },
    }

    const p = popisky[zamer]

    const popisekHodnota = krok2.querySelector<HTMLElement>('[data-role="popisek-hodnota"]')
    if (popisekHodnota) popisekHodnota.textContent = p.hodnota
    const napovedaHodnota = krok2.querySelector<HTMLElement>('[data-role="napoveda-hodnota"]')
    if (napovedaHodnota) napovedaHodnota.textContent = p.napoveda

    // U koupě je potřebná částka rovna kupní ceně, takže druhé pole nedává smysl.
    const blokCastka = krok2.querySelector<HTMLElement>('[data-role="blok-castka"]')
    if (blokCastka) blokCastka.hidden = zamer === 'koupe'
    if (zamer !== 'koupe') {
      const popisekCastka = krok2.querySelector<HTMLElement>('[data-role="popisek-castka"]')
      if (popisekCastka) popisekCastka.textContent = p.castka
      const napovedaCastka = krok2.querySelector<HTMLElement>('[data-role="napoveda-castka"]')
      if (napovedaCastka) napovedaCastka.textContent = p.castkaNapoveda
    }

    // Typ nemovitosti se nabízí jen tam, kde má smysl.
    const blokTyp = krok2.querySelector<HTMLElement>('[data-role="blok-typ"]')
    if (blokTyp) blokTyp.hidden = zamer === 'vystavba'
  }

  /* --- živé formátování všech částkových polí --- */
  obal.querySelectorAll<HTMLInputElement>('[data-castka]').forEach(pripojFormatovaniCastky)

  /* --- spolužadatel: zobrazit/skrýt blok --- */
  const prepinacSpoluzadatele = obal.querySelector<HTMLInputElement>('[data-pole="ma-spoluzadatele"]')
  const blokSpoluzadatele = obal.querySelector<HTMLElement>('[data-role="blok-spoluzadatel"]')
  prepinacSpoluzadatele?.addEventListener('change', () => {
    const zapnuto = prepinacSpoluzadatele.checked
    if (blokSpoluzadatele) blokSpoluzadatele.hidden = !zapnuto
  })

  /* --- načtení hodnot z kroku do stavu --- */
  function precti<T extends HTMLElement>(nazev: string): T | null {
    return obal.querySelector<T>(`[data-pole="${nazev}"]`)
  }

  function ulozKrok(cisloKroku: number): void {
    if (cisloKroku === 2) {
      stav.hodnotaZajisteni = cislo(precti<HTMLInputElement>('hodnota-zajisteni')?.value ?? '')
      const castka = cislo(precti<HTMLInputElement>('potrebna-castka')?.value ?? '')
      // U koupě je potřebná částka totožná s kupní cenou.
      stav.potrebnaCastka = stav.zamer === 'koupe' ? stav.hodnotaZajisteni : castka
      stav.typNemovitosti = precti<HTMLSelectElement>('typ-nemovitosti')?.value ?? ''
      stav.ucel = (precti<HTMLSelectElement>('ucel')?.value as Ucel) ?? 'vlastni_bydleni'
    }

    if (cisloKroku === 3) {
      stav.vlastniZdroje = cislo(precti<HTMLInputElement>('vlastni-zdroje')?.value ?? '')
    }

    if (cisloKroku === 4) {
      stav.vek = cislo(precti<HTMLInputElement>('vek')?.value ?? '')
      stav.prijemHlavni = cislo(precti<HTMLInputElement>('prijem-hlavni')?.value ?? '')
      stav.typPrijmuHlavni = (precti<HTMLSelectElement>('typ-prijmu-hlavni')?.value as TypPrijmu) ?? 'zamestnanec'
      stav.maSpoluzadatele = precti<HTMLInputElement>('ma-spoluzadatele')?.checked ?? false
      if (stav.maSpoluzadatele) {
        stav.prijemSpoluzadatel = cislo(precti<HTMLInputElement>('prijem-spoluzadatel')?.value ?? '')
        stav.typPrijmuSpoluzadatel =
          (precti<HTMLSelectElement>('typ-prijmu-spoluzadatel')?.value as TypPrijmu) ?? 'zamestnanec'
      } else {
        stav.prijemSpoluzadatel = 0
        stav.typPrijmuSpoluzadatel = null
      }
    }

    if (cisloKroku === 5) {
      stav.stavajiciSplatky = cislo(precti<HTMLInputElement>('stavajici-splatky')?.value ?? '')
      stav.kreditniLimity = cislo(precti<HTMLInputElement>('kreditni-limity')?.value ?? '')
      stav.pocetDospelych = Math.max(1, cislo(precti<HTMLSelectElement>('pocet-dospelych')?.value ?? '1'))
      stav.pocetDeti = cislo(precti<HTMLSelectElement>('pocet-deti')?.value ?? '0')
    }
  }

  /** Vrátí chybovou hlášku, nebo null když je krok v pořádku. */
  function overKrok(cisloKroku: number): string | null {
    if (cisloKroku === 2) {
      const poleHodnota = precti<HTMLInputElement>('hodnota-zajisteni')
      if (stav.hodnotaZajisteni < 100_000) {
        oznacNeplatne(poleHodnota, true)
        return 'Zadejte prosím částku — stačí orientační odhad.'
      }
      oznacNeplatne(poleHodnota, false)

      if (stav.zamer !== 'koupe') {
        const poleCastka = precti<HTMLInputElement>('potrebna-castka')
        if (stav.potrebnaCastka < 50_000) {
          oznacNeplatne(poleCastka, true)
          return 'Zadejte prosím orientační rozpočet.'
        }
        oznacNeplatne(poleCastka, false)
      }
      return null
    }

    if (cisloKroku === 4) {
      const poleVek = precti<HTMLInputElement>('vek')
      if (stav.vek < 18 || stav.vek > 99) {
        oznacNeplatne(poleVek, true)
        return 'Zadejte prosím věk mezi 18 a 99 lety.'
      }
      oznacNeplatne(poleVek, false)

      const polePrijem = precti<HTMLInputElement>('prijem-hlavni')
      if (stav.prijemHlavni < 1000) {
        oznacNeplatne(polePrijem, true)
        return 'Zadejte prosím svůj čistý měsíční příjem.'
      }
      oznacNeplatne(polePrijem, false)

      if (stav.maSpoluzadatele && stav.prijemSpoluzadatel < 1000) {
        const poleSpolu = precti<HTMLInputElement>('prijem-spoluzadatel')
        oznacNeplatne(poleSpolu, true)
        return 'Zadejte prosím příjem spolužadatele, nebo spolužadatele odškrtněte.'
      }
      return null
    }

    // Kroky 3 a 5 mohou zůstat nulové (nemám vlastní zdroje / nemám závazky).
    return null
  }

  /* --- navigace --- */
  obal.querySelectorAll<HTMLButtonElement>('[data-akce="dalsi"]').forEach((tlacitko) => {
    tlacitko.addEventListener('click', () => {
      const krok = kroky.get(aktualniKrok)
      if (!krok) return

      ulozKrok(aktualniKrok)
      const chyba = overKrok(aktualniKrok)
      nastavChybuKroku(krok, chyba)

      if (chyba) {
        krok.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
        return
      }

      trackKrokKalkulacky(aktualniKrok, NAZVY_KROKU[aktualniKrok] ?? '')
      zobrazKrok(Math.min(aktualniKrok + 1, POCET_KROKU))
    })
  })

  obal.querySelectorAll<HTMLButtonElement>('[data-akce="zpet"]').forEach((tlacitko) => {
    tlacitko.addEventListener('click', () => {
      // Rozpracované hodnoty se ukládají i při návratu, aby se nic neztratilo.
      ulozKrok(aktualniKrok)
      const krok = kroky.get(aktualniKrok)
      if (krok) nastavChybuKroku(krok, null)
      zobrazKrok(Math.max(aktualniKrok - 1, 1))
    })
  })

  // Enter v textovém poli posune na další krok místo odeslání formuláře.
  obal.querySelectorAll<HTMLInputElement>('[data-krok] input').forEach((vstup) => {
    vstup.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const krok = kroky.get(aktualniKrok)
      const dalsi = krok?.querySelector<HTMLButtonElement>('[data-akce="dalsi"]')
      if (dalsi) {
        e.preventDefault()
        dalsi.click()
      }
    })
  })

  zobrazKrok(1, false)

  return {
    ziskejStav: () => ({ ...stav }),

    ziskejOdhad: () => spocitejOdhad(),

    zobrazPodekovani: () => {
      kroky.forEach((el) => (el.hidden = true))
      if (progresObal) progresObal.hidden = true
      if (podekovani) {
        podekovani.hidden = false
        podekovani.classList.add('krok-vstup')
        podekovani.querySelector<HTMLElement>('[data-role="nadpis-diky"]')?.focus({ preventScroll: true })
      }
      obal.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },

    prejdiNaKalkulacku: () => {
      obal.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
  }
}
