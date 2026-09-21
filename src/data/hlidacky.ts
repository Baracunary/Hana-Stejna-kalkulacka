// Bella & Naira — hypoteční hlídačky, maskoti poradny BeLuca Life.
// Jedno místo pro obrázky a texty nápověd, ať se dají snadno upravit.

export type Pes = 'bella' | 'naira'

export interface PesInfo {
  jmeno: string
  obrazek: string
  alt: string
}

export const PSI: Record<Pes, PesInfo> = {
  bella: {
    jmeno: 'Bella',
    obrazek: '/img/bella-hlidacka.png',
    alt: 'Bella, hypoteční hlídačka',
  },
  naira: {
    jmeno: 'Naira',
    obrazek: '/img/naira-hlidacka.png',
    alt: 'Naira, hypoteční hlídačka',
  },
}

export interface NapovedaKroku {
  pes: Pes
  text: string
}

/** Krátké nápovědy hlídaček u jednotlivých kroků kalkulačky. Liché kroky hlídá
 *  Bella, sudé Naira. Text uprav klidně jen tady — na vykreslení nemá vliv. */
export const NAPOVEDY_KROKU: Record<number, NapovedaKroku> = {
  1: { pes: 'bella', text: 'Vyberte, co je vám nejblíž – zbytek pohlídáme my.' },
  2: { pes: 'naira', text: 'Stačí orientační čísla, nic nedokládáte.' },
  3: { pes: 'bella', text: 'Stačí orientační čísla, nic nedokládáte.' },
  4: { pes: 'naira', text: 'Stačí orientační čísla, nic nedokládáte.' },
  5: { pes: 'bella', text: 'Už jen kontakt a přesný propočet dostanete do 48 hodin.' },
  6: { pes: 'naira', text: 'Tady je váš orientační odhad.' },
}
