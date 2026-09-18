import { describe, it, expect } from 'vitest'
import {
  vypocitejAnuitu,
  jistinaZeSplatky,
  doporucenaSplatnost,
  zivotniNaklady,
  vypocitejLimit,
  vypocitejOrientacniRozpeti,
  formatujKc,
  parametry,
  type VstupLimitu,
} from './limit'

function vstup(zmeny: Partial<VstupLimitu> = {}): VstupLimitu {
  return {
    zamer: 'koupe',
    ucel: 'vlastni_bydleni',
    hodnotaZajisteni: 6_000_000,
    potrebnaCastka: 6_000_000,
    vlastniZdroje: 1_200_000,
    vek: 34,
    prijemHlavni: 45_000,
    typPrijmuHlavni: 'zamestnanec',
    prijemSpoluzadatel: 35_000,
    typPrijmuSpoluzadatel: 'zamestnanec',
    stavajiciSplatky: 0,
    kreditniLimity: 0,
    pocetDospelych: 2,
    pocetDeti: 1,
    ...zmeny,
  }
}

describe('vypocitejAnuitu', () => {
  it('spočítá splátku podle standardního anuitního vzorce', () => {
    // 3 500 000 Kč, 25 let, 5,42 % → 21 327 Kč/měsíc (referenční hodnota Hypoindexu)
    expect(vypocitejAnuitu(3_500_000, 5.42, 25)).toBe(21_327)
  })

  it('u nulové sazby rozpočítá jistinu lineárně', () => {
    expect(vypocitejAnuitu(1_200_000, 0, 10)).toBe(10_000)
  })

  it('vrátí 0 pro nesmyslné vstupy', () => {
    expect(vypocitejAnuitu(0, 5, 25)).toBe(0)
    expect(vypocitejAnuitu(1_000_000, 5, 0)).toBe(0)
  })
})

describe('jistinaZeSplatky', () => {
  it('je inverzní k anuitě', () => {
    const jistina = jistinaZeSplatky(21_327, 5.42, 25)
    expect(Math.abs(jistina - 3_500_000)).toBeLessThan(200)
  })

  it('vrátí 0 pro nulovou splátku', () => {
    expect(jistinaZeSplatky(0, 5.42, 25)).toBe(0)
  })
})

describe('doporucenaSplatnost', () => {
  it('nepřekročí maximální splatnost produktu', () => {
    expect(doporucenaSplatnost(30)).toBe(parametry.max_splatnost_let)
  })

  it('zkrátí se podle věku klienta při doplacení', () => {
    // 55 let, doplaceno do 70 → 15 let
    expect(doporucenaSplatnost(55)).toBe(parametry.vek_splaceni_do - 55)
  })

  it('nikdy není záporná', () => {
    expect(doporucenaSplatnost(85)).toBe(0)
  })
})

describe('zivotniNaklady', () => {
  it('roste s počtem osob v domácnosti', () => {
    expect(zivotniNaklady(2, 2)).toBeGreaterThan(zivotniNaklady(1, 0))
  })

  it('počítá minimálně s jedním dospělým', () => {
    expect(zivotniNaklady(0, 0)).toBe(zivotniNaklady(1, 0))
  })
})

describe('vypocitejLimit', () => {
  it('u modelové rodiny vrátí kladný limit a modelovou splátku', () => {
    const v = vypocitejLimit(vstup())
    expect(v.maxUver).toBeGreaterThan(0)
    expect(v.modelovaSplatka).toBeGreaterThan(0)
    expect(v.doporucenaSplatnost).toBe(parametry.max_splatnost_let)
  })

  it('limit je zaokrouhlený dolů na krok z parametrů', () => {
    const v = vypocitejLimit(vstup())
    expect(v.maxUver % parametry.zaokrouhleni_vysledku).toBe(0)
  })

  it('výsledný limit nikdy nepřekročí žádný z dílčích stropů', () => {
    const v = vypocitejLimit(vstup({ prijemHlavni: 120_000, prijemSpoluzadatel: 0, typPrijmuSpoluzadatel: null }))
    expect(v.maxUver).toBeLessThanOrEqual(Math.min(v.stropy.ltv, v.stropy.dsti, v.stropy.dti, v.stropy.rezerva))
  })

  it('u vysokého příjmu a malé nemovitosti limituje LTV', () => {
    const v = vypocitejLimit(
      vstup({ hodnotaZajisteni: 2_000_000, potrebnaCastka: 2_000_000, prijemHlavni: 150_000, prijemSpoluzadatel: 0, typPrijmuSpoluzadatel: null }),
    )
    // Limit pokryje potřebu, ale strop LTV musí být nejnižší z dílčích stropů.
    expect(v.stropy.ltv).toBeLessThan(v.stropy.dsti)
    expect(v.stropy.ltv).toBeLessThan(v.stropy.dti)
  })

  it('u nízkého příjmu a drahé nemovitosti limituje bonita, ne LTV', () => {
    const v = vypocitejLimit(
      vstup({ hodnotaZajisteni: 15_000_000, potrebnaCastka: 15_000_000, prijemHlavni: 30_000, prijemSpoluzadatel: 0, typPrijmuSpoluzadatel: null }),
    )
    expect(['dsti', 'dti', 'rezerva', 'nedosazitelne']).toContain(v.omezeniKvuli)
    expect(v.pokryvaPotrebu).toBe(false)
  })

  it('stávající splátky limit snižují', () => {
    const bez = vypocitejLimit(vstup({ hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000 }))
    const se = vypocitejLimit(vstup({ hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000, stavajiciSplatky: 15_000 }))
    expect(se.maxUver).toBeLessThan(bez.maxUver)
  })

  it('nevyčerpaný limit kreditní karty limit snižuje', () => {
    const bez = vypocitejLimit(vstup({ hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000 }))
    const se = vypocitejLimit(vstup({ hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000, kreditniLimity: 200_000 }))
    expect(se.maxUver).toBeLessThan(bez.maxUver)
  })

  it('investiční účel má přísnější LTV než vlastní bydlení', () => {
    const bydleni = vypocitejLimit(vstup({ ucel: 'vlastni_bydleni', prijemHlavni: 200_000 }))
    const investice = vypocitejLimit(vstup({ ucel: 'investice', prijemHlavni: 200_000 }))
    expect(investice.stropy.ltv).toBeLessThan(bydleni.stropy.ltv)
  })

  it('klient nad věkovou hranicí je označen jako nedosažitelný', () => {
    const v = vypocitejLimit(vstup({ vek: 72 }))
    expect(v.maxUver).toBe(0)
    expect(v.omezeniKvuli).toBe('nedosazitelne')
  })

  it('nulový příjem nevede k zápornému nebo NaN výsledku', () => {
    const v = vypocitejLimit(vstup({ prijemHlavni: 0, prijemSpoluzadatel: 0, typPrijmuSpoluzadatel: null }))
    expect(v.maxUver).toBe(0)
    expect(Number.isFinite(v.modelovaSplatka)).toBe(true)
  })

  it('paušální daň se započítá nižším koeficientem než zaměstnanecký příjem', () => {
    const zam = vypocitejLimit(vstup({ typPrijmuHlavni: 'zamestnanec', hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000 }))
    const pausal = vypocitejLimit(vstup({ typPrijmuHlavni: 'osvc_pausalni_dan', hodnotaZajisteni: 20_000_000, potrebnaCastka: 20_000_000 }))
    expect(pausal.zapocitanyPrijem).toBeLessThan(zam.zapocitanyPrijem)
    expect(pausal.maxUver).toBeLessThan(zam.maxUver)
  })

  it('označí, že limit pokrývá požadovanou částku', () => {
    const v = vypocitejLimit(vstup({ hodnotaZajisteni: 3_000_000, potrebnaCastka: 3_000_000, vlastniZdroje: 1_500_000, prijemHlavni: 90_000 }))
    expect(v.pokryvaPotrebu).toBe(true)
    expect(v.omezeniKvuli).toBe('potreba')
  })
})

describe('vypocitejOrientacniRozpeti', () => {
  it('horní hranice odpovídá maxUver a dolní je nižší', () => {
    const v = vypocitejLimit(vstup())
    const rozpeti = vypocitejOrientacniRozpeti(v)
    expect(rozpeti).not.toBeNull()
    expect(rozpeti!.horni).toBe(v.maxUver)
    expect(rozpeti!.dolni).toBeLessThan(rozpeti!.horni)
  })

  it('dolní hranice je zaokrouhlená na stejný krok jako maxUver', () => {
    const v = vypocitejLimit(vstup())
    const rozpeti = vypocitejOrientacniRozpeti(v)
    expect(rozpeti!.dolni % parametry.zaokrouhleni_vysledku).toBe(0)
  })

  it('vrátí null, když ze zadaných údajů nevychází žádný úvěr', () => {
    const v = vypocitejLimit(vstup({ vek: 72 }))
    expect(vypocitejOrientacniRozpeti(v)).toBeNull()
  })
})

describe('formatujKc', () => {
  it('odděluje tisíce běžnou mezerou', () => {
    expect(formatujKc(4_250_000)).toBe('4 250 000 Kč')
  })
})
