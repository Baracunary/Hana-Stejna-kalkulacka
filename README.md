# Hypoteční kalkulačka — Hana-Marie Stejná

Jednostránkový lead-magnet web s vícekrokovou hypoteční kalkulačkou. Landing page pro Meta Ads kampaně.
Vite + vanilla TypeScript + Tailwind CSS v4, bez frontend frameworku. `api/lead.ts` běží jako Vercel serverless funkce.

**Hlavní myšlenka webu:** neprodáváme kalkulačku, ale odpověď na otázku „Kolik mi banka maximálně půjčí?“

Návod je psaný i pro netechnického čtenáře — pokud narazíte na termín, který vám nic neříká, přeskočte ho
a řiďte se přesně napsanými příkazy.

---

## 1. Spuštění na počítači

Potřebujete [Node.js](https://nodejs.org) verze 20 nebo novější.

```bash
npm install
npm run dev
```

Terminál vypíše adresu (obvykle `http://localhost:5173`) — otevřete ji v prohlížeči.

**Důležité:** `npm run dev` spouští jen frontend, ne serverless funkci `api/lead.ts` — tu umí spustit až Vercel.
Aby šlo lokálně projít celý tok kalkulačky až po děkovnou obrazovku, je ve `vite.config.ts` vývojářský „mock“,
který na `/api/lead` odpoví rovnou `{ ok: true }`, aniž by se cokoliv reálně odeslalo. V terminálu uvidíte řádek
`[DEV MOCK] /api/lead přijal poptávku`. Do produkce se mock nedostane.

Pro odzkoušení skutečného odesílání e-mailu použijte `vercel dev` a mějte vyplněný `.env` podle sekce 4:

```bash
npm install -g vercel   # jen jednou
vercel dev
```

### Testy a kontrola typů

```bash
npm run test        # jednorázově spustí testy výpočtů (Vitest)
npm run test:watch  # testy se spouští znovu při každé změně
npm run typecheck   # zkontroluje, že v kódu nejsou typové chyby
```

---

## 2. Nasazení na Vercel

1. Nahrajte projekt do GitHub repozitáře.
2. Na [vercel.com](https://vercel.com) klikněte **Add New → Project** a vyberte repozitář. Vercel sám rozpozná Vite.
3. V **Settings → Environment Variables** vyplňte proměnné ze sekce 4.
4. **Deploy.** Každá další změna v hlavní větvi se nasadí automaticky.

---

## 3. Struktura projektu

```
index.html             hlavní stránka — hero, kalkulačka, všechny sekce
gdpr.html              stránka /gdpr
cookies.html           stránka /cookies
src/
  main.ts               propojí všechny části dohromady
  legal.ts              vstupní bod pro právní podstránky
  style.css             design systém — barvy, písmo, komponenty
  data/
    parametry.json      >>> PARAMETRY VÝPOČTU — sem chodí Hanka upravovat (viz sekce 5)
  lib/
    limit.ts            výpočet maximálního limitu (LTV, DSTI, DTI, rezerva)
    limit.test.ts       testy výpočtu
    kalkulacka.ts       řízení kroků kalkulačky, validace, progres
    validace.ts         kontrola jména / telefonu / e-mailu
    formular.ts         odeslání poptávky, honeypot, ochrana proti botům
    analytics.ts        Meta Pixel + události
    consent.ts          stav cookie souhlasu
    cookie-lista.ts     cookie lišta
    utm.ts              zdroj návštěvy (UTM, fbclid)
    accordion.ts        FAQ
    sticky-cta.ts       plovoucí CTA na mobilu
api/
  lead.ts               serverless funkce — přijme poptávku, pošle e-mail / webhook / Meta CAPI
public/
  favicon.svg, robots.txt
  img/                  >>> sem patří fotka Hany (viz sekce 7)
```

---

## 4. Proměnné prostředí (`.env`)

Zkopírujte `.env.example` na `.env` a vyplňte. Stejné hodnoty pak zadejte i ve Vercelu.

| Proměnná | K čemu je | Kde ji získat |
|---|---|---|
| `PUBLIC_META_PIXEL_ID` | ID Meta Pixelu pro měření reklam | Meta Events Manager → Zdroje dat |
| `PUBLIC_PLAUSIBLE_DOMAIN` | volitelná analytika návštěvnosti | jen při použití [Plausible](https://plausible.io), jinak prázdné |
| `RESEND_API_KEY` | posílání e-mailu s poptávkou | účet na [resend.com](https://resend.com), API klíč v nastavení |
| `LEAD_EMAIL_FROM` | odesílací adresa | musí být z domény ověřené v Resendu |
| `LEAD_EMAIL_TO` | kam se poptávky posílají | výchozí `hana.stejna@4fin.cz` |
| `LEAD_WEBHOOK_URL` | předání poptávky do CRM | z webhook kroku ve scénáři Make/n8n |
| `META_CAPI_ACCESS_TOKEN` | server-side měření konverzí | Meta Events Manager → Conversions API |
| `META_TEST_EVENT_CODE` | jen pro testování, v provozu prázdné | Meta Events Manager → Testovat události |

Web funguje i bez vyplnění všech proměnných — jen se odpovídající část neodešle. E-mail a webhook běží nezávisle
na sobě, stačí mít funkční aspoň jeden, aby poptávka dorazila.

---

## 5. Parametry výpočtu — `src/data/parametry.json`

> **Tohle je nejdůležitější soubor pro Hanku.** Všechna čísla v něm jsou zatím **výchozí odhad**, ne ověřená
> pravidla konkrétních bank. **Než web pustíte do reklamy, projděte je a přepište podle toho, s čím reálně
> pracujete.** Nic jiného v kódu měnit nemusíte.

Kalkulačka spočítá čtyři nezávislé stropy a vezme ten nejnižší:

| Strop | Co omezuje | Parametry |
|---|---|---|
| **LTV** | podíl úvěru na hodnotě zastavené nemovitosti | `ltv_max` |
| **DSTI** | podíl všech splátek na čistém měsíčním příjmu | `dsti_max`, `dsti_max_do36` |
| **DTI** | násobek ročního čistého příjmu | `dti_max`, `dti_max_do36` |
| **Rezerva** | co musí domácnosti zůstat na živobytí | `zivotni_naklady` |

Dál se nastavuje modelová sazba (`sazba_pro_odhad`), maximální splatnost a věk doplacení, jak se započítávají
různé typy příjmů (`koeficient_prijmu`) a jakým podílem se počítají nevyčerpané limity kreditek
(`kreditni_limit_koeficient`).

Soubor uložte (na GitHubu tlačítkem „Commit changes“), na Vercelu se změna nasadí sama do pár minut.
**Formát musí zůstat platný JSON** — měňte jen samotná čísla, nic neposouvejte.

### Kde se výsledek objeví

**Nikde na webu.** Odhad se záměrně **návštěvníkovi nezobrazuje** — kalkulačka nesmí působit jako příslib banky.
Výsledek se posílá **jen v e-mailu Hance** jako podklad, včetně toho, které pravidlo limit reálně omezilo
a jak daleko od sebe jednotlivé stropy jsou. Klient dostane odpověď do 48 hodin.

---

## 6. Měření a kampaně

Události Meta Pixelu se posílají v tomto pořadí:

| Událost | Kdy se odpálí |
|---|---|
| `PageView` | při načtení (po souhlasu s marketingovými cookies) |
| `ViewContent` | návštěvník doscrolloval ke kalkulačce |
| `CustomizeProduct` | odpověděl na první otázku — zahájil kalkulačku |
| `KalkulackaKrok` (vlastní) | za každý dokončený krok, kvůli sledování odpadu |
| `InitiateCheckout` | došel na krok s kontaktními údaji |
| `Lead` | **až po úspěšné odpovědi serveru (HTTP 200)**, nikdy dřív |

`Lead` se posílá zároveň z prohlížeče i ze serveru (Conversions API) se stejným `event_id`, takže se v Ads Manageru
deduplikuje. Všechny skripty se načítají výhradně po udělení souhlasu v cookie liště.

### Co doladit mimo web

- **Cílit na Leads s konverzí na webu** (Pixel `Lead`), ne na Instant Form — u hypoték dává Instant Form levnější,
  ale výrazně méně kvalitní leady.
- **Kampaň může spadnout do Special Ad Category (credit)** kvůli povaze finančního produktu. Ověřte to v Ads
  Manageru před spuštěním, ne až po zamítnutí.
- **V reklamě se nesmí slibovat konkrétní sazba ani schválení hypotéky.** Doporučená formulace je
  „Zjistěte svůj maximální hypoteční limit“, ne „Hanka vám do 48 hodin poskytne informace“.
- **Slib 48 hodin je potřeba reálně dodržet.** Rychlost reakce rozhoduje o konverzi leadů víc než cokoli na webu.

---

## 7. Co musí doplnit klient

Všechna místa jsou v kódu označená textem `TODO`:

```bash
grep -rn "TODO" index.html gdpr.html cookies.html public/robots.txt src/data/parametry.json
```

Konkrétně:

1. **`src/data/parametry.json`** — projít a potvrdit všechna čísla (viz sekce 5). **Nejdůležitější položka.**
2. **Fotka Hany** — uložit jako `public/img/hana-portret.webp` (poměr 3:4, ideálně 900×1200)
   a v `index.html` v sekci „O Hance“ odkomentovat `<img>` a smazat blok s placeholderem.
   *Fotky z belucalife.cz použité nebyly — na stránce nejsou jednoznačně přiřazené ke konkrétní osobě
   a web zobrazuje i další spolupracovníky.*
3. **Patička `index.html`** — IČO, sídlo, přesný registrační status a číslo v registru ČNB.
4. **`gdpr.html`** — doba uchování údajů, konkrétní názvy zpracovatelů (hosting, e-mail, CRM),
   upřesnění právního vztahu k 4fin Better Together, a.s.
5. **Doména** — canonical v `index.html` a sitemap v `public/robots.txt`.
6. **OG obrázek** — `public/img/og-image.jpg` (1200×630) pro sdílení na sociálních sítích.
7. **Reference** — v sekci referencí jsou tři ověřené citace z belucalife.cz, které se týkají výhradně
   Hany-Marie Stejné. Doplnit případné další, ideálně k hypotékám.

---

## 8. Poznámka k designu

Barevný systém je převzatý z produkčního CSS **4fin.cz**, aby reklama → landing page → značka 4fin působily
jako jeden celek:

| Token | Hodnota | Použití |
|---|---|---|
| `--color-primary` | `#b1004d` | hlavní značková barva, CTA |
| `--color-primary-light` | `#c4005a` | hover stav |
| `--color-primary-dark` | `#8c1642` | active stav |
| `--color-background` | `#f2f0ed` | pozadí stránky |
| `--color-ink` | `#1a1614` | tmavé sekce |
| `--color-charcoal` | `#4a4847` | běžný text |
| `--color-muted` | `#6b6b6b` | doplňkový text |

Všechny tokeny jsou v `src/style.css` v bloku `@theme`, takže případná změna barevnosti je záležitost
několika řádků.

4fin používá licencovaný font **Artegra Sans**. Web zatím používá vizuálně blízkou náhradu **Figtree**
z Google Fonts. Až bude licence k dispozici, stačí nahrát soubory do `public/fonts` a přepsat `--font-sans`.

---

## 9. Poznámka k původnímu balíku souborů

Původní stažená kopie webu Jana Frýdla je uložená ve složce `_puvodni-stazene/` (v `.gitignore`, do repozitáře
se nedostane). **Měla zpřeházené názvy souborů vůči obsahu** — `package.json` obsahoval `index.html`,
`style.css` obsahoval výpočetní modul a tak dále — a zároveň v ní chyběla řada souborů úplně, takže projekt
nešlo nainstalovat ani spustit. Projekt je proto postavený znovu; zachovaná byla ověřená logika, kterou
šlo z balíku přečíst (serverless funkce pro lead, anti-spam, správa souhlasu, UTM, deduplikace Pixel ↔ CAPI).
Složku můžete po kontrole smazat.
