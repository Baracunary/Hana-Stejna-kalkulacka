// Výpočtové jádro: odhad maximálního hypotečního limitu.
// Čistě funkční modul bez závislosti na DOM, snadno testovatelný.
//
// DŮLEŽITÉ: výsledek je vnitřní podklad pro Hanku, který se posílá v e-mailu s leadem.
// Návštěvníkovi webu se ŽÁDNÁ částka nezobrazuje — kalkulačka nesmí působit jako
// příslib banky. Skutečné posouzení dělá Hanka a klient ho dostane do 48 hodin.
//
// Všechny limity jsou parametry v src/data/parametry.json, ne natvrdo v kódu.

import parametryData from '../data/parametry.json'

export type Zamer = 'koupe' | 'rekonstrukce' | 'vystavba'
export type Ucel = 'vlastni_bydleni' | 'investice'
export type TypPrijmu = keyof Parametry['koeficient_prijmu']

export interface Parametry {
  sazba_pro_odhad: number
  max_splatnost_let: number
  vek_splaceni_do: number
  dsti_max: number
  dsti_max_do36: number
  dti_max: number
  dti_max_do36: number
  ltv_max: Record<'vlastni_bydleni' | 'vlastni_bydleni_do36' | 'investice', number>
  kreditni_limit_koeficient: number
  zivotni_naklady: { prvni_dospely: number; dalsi_dospely: number; dite: number }
  koeficient_prijmu: {
    zamestnanec: number
    osvc_danove_priznani: number
    osvc_pausalni_dan: number
    jednatel_firma: number
    rodicovska_duchod_najem: number
  }
  min_uver: number
  zaokrouhleni_vysledku: number
}

export const parametry = parametryData as unknown as Parametry

export interface VstupLimitu {
  zamer: Zamer
  ucel: Ucel
  /** Hodnota zajištění: kupní cena, hodnota nemovitosti PO rekonstrukci, nebo hodnota dokončené stavby. */
  hodnotaZajisteni: number
  /** Kolik peněz chce klient reálně získat (cena, rozpočet rekonstrukce, rozpočet výstavby). */
  potrebnaCastka: number
  vlastniZdroje: number
  vek: number
  prijemHlavni: number
  typPrijmuHlavni: TypPrijmu
  prijemSpoluzadatel: number
  typPrijmuSpoluzadatel: TypPrijmu | null
  /** Součet měsíčních splátek stávajících úvěrů, hypoték a leasingů. */
  stavajiciSplatky: number
  /** Součet limitů kreditních karet a kontokorentů. */
  kreditniLimity: number
  pocetDospelych: number
  pocetDeti: number
}

export type DuvodOmezeni = 'ltv' | 'dsti' | 'dti' | 'rezerva' | 'potreba' | 'nedosazitelne'

export interface VysledekLimitu {
  /** Odhadovaný maximální úvěr v Kč, zaokrouhlený dolů. 0 = z parametrů nevychází žádný úvěr. */
  maxUver: number
  /** Které pravidlo limit reálně omezilo — hlavní informace pro Hanku. */
  omezeniKvuli: DuvodOmezeni
  /** Modelová měsíční splátka při maxUver, doporučené splatnosti a sazbě z parametrů. */
  modelovaSplatka: number
  doporucenaSplatnost: number
  /** Dílčí stropy, aby Hanka viděla, jak daleko od sebe jsou. */
  stropy: { ltv: number; dsti: number; dti: number; rezerva: number }
  zapocitanyPrijem: number
  volnyPrijem: number
  /** Pokryje odhadovaný limit spolu s vlastními zdroji to, co klient potřebuje? */
  pokryvaPotrebu: boolean
}

/**
 * Anuitní splátka. Sazba 0 % ošetřena lineárním rozpočtem jistiny.
 */
export function vypocitejAnuitu(jistina: number, rocniSazbaProcent: number, roky: number): number {
  if (jistina <= 0 || roky <= 0) return 0
  const i = rocniSazbaProcent / 100 / 12
  const n = Math.round(roky * 12)
  if (i === 0) return Math.ceil(jistina / n)
  return Math.ceil((jistina * (i * (1 + i) ** n)) / ((1 + i) ** n - 1))
}

/**
 * Jistina, kterou danou splátku unese — obrácená anuita.
 */
export function jistinaZeSplatky(splatka: number, rocniSazbaProcent: number, roky: number): number {
  if (splatka <= 0 || roky <= 0) return 0
  const i = rocniSazbaProcent / 100 / 12
  const n = Math.round(roky * 12)
  if (i === 0) return splatka * n
  return (splatka * ((1 + i) ** n - 1)) / (i * (1 + i) ** n)
}

/**
 * Splatnost omezená jak stropem produktu, tak věkem klienta při doplacení.
 */
export function doporucenaSplatnost(vek: number, p: Parametry = parametry): number {
  const doVeku = p.vek_splaceni_do - vek
  return Math.max(0, Math.min(p.max_splatnost_let, doVeku))
}

/** Měsíční životní minimum domácnosti podle počtu osob. */
export function zivotniNaklady(pocetDospelych: number, pocetDeti: number, p: Parametry = parametry): number {
  const dospeli = Math.max(1, pocetDospelych)
  const { prvni_dospely, dalsi_dospely, dite } = p.zivotni_naklady
  return prvni_dospely + (dospeli - 1) * dalsi_dospely + Math.max(0, pocetDeti) * dite
}

function zapocitatPrijem(castka: number, typ: TypPrijmu | null, p: Parametry): number {
  if (!typ || castka <= 0) return 0
  return castka * (p.koeficient_prijmu[typ] ?? 1)
}

function zaokrouhliDolu(castka: number, krok: number): number {
  if (krok <= 0) return Math.max(0, Math.floor(castka))
  return Math.max(0, Math.floor(castka / krok) * krok)
}

/**
 * Odhad maximálního hypotečního limitu.
 *
 * Postupně se spočítají čtyři nezávislé stropy (LTV, DSTI, DTI, zůstatková rezerva)
 * a vezme se ten nejnižší. `omezeniKvuli` říká, který to byl — to je pro Hanku
 * nejužitečnější informace, protože ukazuje, kde má případně hledat řešení.
 */
export function vypocitejLimit(vstup: VstupLimitu, p: Parametry = parametry): VysledekLimitu {
  const splatnost = doporucenaSplatnost(vstup.vek, p)

  const zapocitanyPrijem =
    zapocitatPrijem(vstup.prijemHlavni, vstup.typPrijmuHlavni, p) +
    zapocitatPrijem(vstup.prijemSpoluzadatel, vstup.typPrijmuSpoluzadatel, p)

  const zavazkyMesicne =
    Math.max(0, vstup.stavajiciSplatky) + Math.max(0, vstup.kreditniLimity) * p.kreditni_limit_koeficient

  const naklady = zivotniNaklady(vstup.pocetDospelych, vstup.pocetDeti, p)
  const volnyPrijem = zapocitanyPrijem - zavazkyMesicne - naklady

  // Klient je mladší 36 let → mírnější limity (LTV/DSTI/DTI).
  const do36 = vstup.vek < 36

  // Splatnost 0 (klient je nad hranicí věku) nebo nulový příjem → nedává smysl počítat dál.
  if (splatnost <= 0 || zapocitanyPrijem <= 0) {
    return {
      maxUver: 0,
      omezeniKvuli: 'nedosazitelne',
      modelovaSplatka: 0,
      doporucenaSplatnost: splatnost,
      stropy: { ltv: 0, dsti: 0, dti: 0, rezerva: 0 },
      zapocitanyPrijem,
      volnyPrijem,
      pokryvaPotrebu: false,
    }
  }

  // --- 1) strop podle LTV ---
  const ltvMax =
    vstup.ucel === 'investice'
      ? p.ltv_max.investice
      : do36
        ? p.ltv_max.vlastni_bydleni_do36
        : p.ltv_max.vlastni_bydleni
  const stropLtv = Math.max(0, vstup.hodnotaZajisteni * ltvMax)

  // --- 2) strop podle DSTI (podíl splátek na příjmu) ---
  const dstiMax = do36 ? p.dsti_max_do36 : p.dsti_max
  const splatkaDleDsti = Math.max(0, zapocitanyPrijem * dstiMax - zavazkyMesicne)
  const stropDsti = jistinaZeSplatky(splatkaDleDsti, p.sazba_pro_odhad, splatnost)

  // --- 3) strop podle DTI (násobek ročního příjmu) ---
  // Stávající závazky se odhadují jako jejich zbývající jistina; přesnou znát nemůžeme,
  // proto se od stropu odečte to, co odpovídá současným splátkám při stejné sazbě.
  const dtiMax = do36 ? p.dti_max_do36 : p.dti_max
  const jistinaStavajicich = jistinaZeSplatky(Math.max(0, vstup.stavajiciSplatky), p.sazba_pro_odhad, splatnost)
  const stropDti = Math.max(0, zapocitanyPrijem * 12 * dtiMax - jistinaStavajicich)

  // --- 4) strop podle zůstatkové rezervy domácnosti ---
  const stropRezerva = jistinaZeSplatky(Math.max(0, volnyPrijem), p.sazba_pro_odhad, splatnost)

  const stropy = {
    ltv: Math.round(stropLtv),
    dsti: Math.round(stropDsti),
    dti: Math.round(stropDti),
    rezerva: Math.round(stropRezerva),
  }

  const nejnizsi = Math.min(stropy.ltv, stropy.dsti, stropy.dti, stropy.rezerva)
  const maxUver = zaokrouhliDolu(nejnizsi, p.zaokrouhleni_vysledku)

  let omezeniKvuli: DuvodOmezeni =
    nejnizsi === stropy.ltv
      ? 'ltv'
      : nejnizsi === stropy.rezerva
        ? 'rezerva'
        : nejnizsi === stropy.dsti
          ? 'dsti'
          : 'dti'

  if (maxUver < p.min_uver) omezeniKvuli = 'nedosazitelne'

  // Kolik klient reálně potřebuje si půjčit = potřebná částka mínus vlastní zdroje.
  const potrebaUveru = Math.max(0, vstup.potrebnaCastka - Math.max(0, vstup.vlastniZdroje))
  const pokryvaPotrebu = maxUver >= potrebaUveru && potrebaUveru > 0

  // Když limit potřebu pokryje, je rozhodující potřeba, ne strop.
  if (pokryvaPotrebu) omezeniKvuli = 'potreba'

  const rozhodujici = pokryvaPotrebu ? potrebaUveru : maxUver

  return {
    maxUver,
    omezeniKvuli,
    modelovaSplatka: vypocitejAnuitu(rozhodujici, p.sazba_pro_odhad, splatnost),
    doporucenaSplatnost: splatnost,
    stropy,
    zapocitanyPrijem: Math.round(zapocitanyPrijem),
    volnyPrijem: Math.round(volnyPrijem),
    pokryvaPotrebu,
  }
}

export interface OrientacniRozpeti {
  dolni: number
  horni: number
}

/**
 * Hrubší, zaokrouhlené rozpětí pro OKAMŽITÝ odhad, který se ukáže hned po
 * vyplnění kalkulačky, ještě před kontaktním formulářem — aby šlo v reklamě
 * férově tvrdit, že si výsledek spočítáte za pár minut.
 *
 * Schválně je to hrubší a širší číslo než `maxUver` (horní hranice = maxUver,
 * dolní hranice o 15 % níž), aby dávalo smysl nabídnout přesný propočet
 * výměnou za kontakt — přesné číslo, konkrétní doporučení a posouzení
 * nestandardních věcí totiž kalkulačka sama o sobě dát nemůže.
 *
 * Vrací null, když ze zadaných údajů nevychází žádný úvěr (viz `omezeniKvuli
 * === 'nedosazitelne'`) — v tom případě dává smysl nabídnout osobní konzultaci,
 * ne rozpětí.
 */
export function vypocitejOrientacniRozpeti(vysledek: VysledekLimitu, p: Parametry = parametry): OrientacniRozpeti | null {
  if (vysledek.maxUver < p.min_uver) return null
  const dolni = zaokrouhliDolu(vysledek.maxUver * 0.85, p.zaokrouhleni_vysledku)
  return { dolni, horni: vysledek.maxUver }
}

/* -------------------------------------------------------------------------
   Formátování
   ------------------------------------------------------------------------- */

/** Formátování celého čísla česky. toLocaleString vrací pro cs-CZ úzkou NBSP —
 *  sjednotíme na běžnou mezeru kvůli kopírování a předvídatelnému renderu. */
export function formatujCislo(cislo: number): string {
  return Math.round(cislo)
    .toLocaleString('cs-CZ')
    .replace(/[  ]/g, ' ')
}

export function formatujKc(castka: number): string {
  return `${formatujCislo(castka)} Kč`
}

export const popisOmezeni: Record<DuvodOmezeni, string> = {
  ltv: 'hodnota zajištění (LTV)',
  dsti: 'podíl splátek na příjmu (DSTI)',
  dti: 'násobek ročního příjmu (DTI)',
  rezerva: 'zůstatková rezerva domácnosti',
  potreba: 'limit pokrývá požadovanou částku',
  nedosazitelne: 'ze zadaných údajů nevychází úvěr — nutné posoudit individuálně',
}
