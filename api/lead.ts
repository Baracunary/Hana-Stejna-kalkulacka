// POST /api/lead — přijme poptávku z kalkulačky a předá ji třemi kanály:
// 1) e-mail Hance, 2) webhook do Make/n8n (CRM), 3) Meta Conversions API (server-side Lead).
//
// E-mail a webhook běží souběžně a nezávisle na sobě — stačí, aby uspěl jeden z nich,
// aby lead reálně dorazil; CAPI je jen doplňkové měření a nikdy nesmí request shodit.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash } from 'node:crypto'

interface KalkulackaPayload {
  zamer: string
  ucel: string
  typNemovitosti: string
  hodnotaZajisteni: number
  potrebnaCastka: number
  vlastniZdroje: number
  vek: number
  prijemHlavni: number
  typPrijmuHlavni: string
  maSpoluzadatele: boolean
  prijemSpoluzadatel: number
  typPrijmuSpoluzadatel: string | null
  stavajiciSplatky: number
  kreditniLimity: number
  pocetDospelych: number
  pocetDeti: number
  [klic: string]: unknown
}

interface OdhadPayload {
  maxUver: number
  omezeniKvuli: string
  modelovaSplatka: number
  doporucenaSplatnost: number
  stropy: { ltv: number; dsti: number; dti: number; rezerva: number }
  zapocitanyPrijem: number
  volnyPrijem: number
  pokryvaPotrebu: boolean
}

interface LeadPayload {
  jmeno: string
  telefon: string
  email: string
  poznamka: string
  souhlas: boolean
  souhlas_cas: string
  event_id?: string
  kalkulacka: KalkulackaPayload
  odhad: OdhadPayload | null
  utm: { source: string; medium: string; campaign: string; content: string; term: string }
  fbclid: string
  url: string
  user_agent: string
}

function jePlatnyPayload(body: unknown): body is LeadPayload {
  if (!body || typeof body !== 'object') return false
  const p = body as Record<string, unknown>
  return (
    typeof p.jmeno === 'string' &&
    p.jmeno.trim().length >= 3 &&
    typeof p.telefon === 'string' &&
    /^\+42[01]\d{9}$/.test(p.telefon) &&
    typeof p.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) &&
    p.souhlas === true &&
    typeof p.kalkulacka === 'object' &&
    p.kalkulacka !== null
  )
}

function sha256(hodnota: string): string {
  return createHash('sha256').update(hodnota.trim().toLowerCase()).digest('hex')
}

function kc(castka: unknown): string {
  const n = Number(castka)
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n).toLocaleString('cs-CZ').replace(/[  ]/g, ' ')} Kč`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const NAZVY_ZAMERU: Record<string, string> = {
  koupe: 'Koupě nemovitosti',
  rekonstrukce: 'Rekonstrukce',
  vystavba: 'Developerský projekt / výstavba',
}

const NAZVY_PRIJMU: Record<string, string> = {
  zamestnanec: 'zaměstnanec',
  osvc_danove_priznani: 'OSVČ — daňové přiznání',
  osvc_pausalni_dan: 'OSVČ — paušální daň',
  jednatel_firma: 'jednatel / majitel firmy',
  rodicovska_duchod_najem: 'rodičovská, důchod nebo nájem',
}

const POPIS_OMEZENI: Record<string, string> = {
  ltv: 'hodnota zajištění (LTV)',
  dsti: 'podíl splátek na příjmu (DSTI)',
  dti: 'násobek ročního příjmu (DTI)',
  rezerva: 'zůstatková rezerva domácnosti',
  potreba: 'limit pokrývá požadovanou částku',
  nedosazitelne: 'ze zadaných údajů nevychází úvěr — nutné posoudit individuálně',
}

function sestavHtml(lead: LeadPayload): string {
  const k = lead.kalkulacka
  const o = lead.odhad

  const blokOdhadu = o
    ? `
      <h3 style="margin-bottom:4px">Orientační odhad (jen pro tebe, klient ho neviděl)</h3>
      <ul>
        <li><strong>Odhadovaný max. úvěr: ${kc(o.maxUver)}</strong></li>
        <li>Rozhoduje: ${POPIS_OMEZENI[o.omezeniKvuli] ?? o.omezeniKvuli}</li>
        <li>Modelová splátka: ${kc(o.modelovaSplatka)} / měsíc při ${o.doporucenaSplatnost} letech</li>
        <li>Započítaný příjem: ${kc(o.zapocitanyPrijem)} · volný příjem po nákladech a závazcích: ${kc(o.volnyPrijem)}</li>
        <li>Dílčí stropy — LTV ${kc(o.stropy.ltv)} · DSTI ${kc(o.stropy.dsti)} · DTI ${kc(o.stropy.dti)} · rezerva ${kc(o.stropy.rezerva)}</li>
        <li>Pokryje požadovanou částku: ${o.pokryvaPotrebu ? 'ano' : 'ne'}</li>
      </ul>
      <p style="color:#6b6b6b;font-size:12px">
        Odhad počítá parametry z <code>src/data/parametry.json</code>. Není to posouzení banky.
      </p>`
    : ''

  return `
    <div style="font-family:system-ui,sans-serif;color:#1a1614;max-width:640px">
      <h2 style="color:#b1004d;margin-bottom:4px">Nová poptávka z kalkulačky</h2>
      <p style="font-size:18px;margin-top:0">
        <strong>${escapeHtml(lead.jmeno)}</strong><br/>
        Tel: <a href="tel:${escapeHtml(lead.telefon)}">${escapeHtml(lead.telefon)}</a><br/>
        E-mail: <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>
      </p>

      <h3 style="margin-bottom:4px">Co klient řeší</h3>
      <ul>
        <li><strong>${NAZVY_ZAMERU[k.zamer] ?? escapeHtml(String(k.zamer))}</strong></li>
        ${k.typNemovitosti ? `<li>Typ nemovitosti: ${escapeHtml(String(k.typNemovitosti))}</li>` : ''}
        <li>Účel: ${k.ucel === 'investice' ? 'investice (pronájem)' : 'vlastní bydlení'}</li>
        <li>Hodnota zajištění: ${kc(k.hodnotaZajisteni)}</li>
        <li>Potřebná částka: ${kc(k.potrebnaCastka)}</li>
        <li>Vlastní zdroje: ${kc(k.vlastniZdroje)}</li>
      </ul>

      <h3 style="margin-bottom:4px">Bonita</h3>
      <ul>
        <li>Věk hlavního žadatele: ${Number(k.vek) || '—'} let</li>
        <li>Příjem: ${kc(k.prijemHlavni)} / měsíc — ${NAZVY_PRIJMU[k.typPrijmuHlavni] ?? escapeHtml(String(k.typPrijmuHlavni))}</li>
        ${
          k.maSpoluzadatele
            ? `<li>Spolužadatel: ${kc(k.prijemSpoluzadatel)} / měsíc — ${NAZVY_PRIJMU[String(k.typPrijmuSpoluzadatel)] ?? escapeHtml(String(k.typPrijmuSpoluzadatel))}</li>`
            : '<li>Spolužadatel: ne</li>'
        }
        <li>Stávající splátky: ${kc(k.stavajiciSplatky)} / měsíc</li>
        <li>Limity kreditek a kontokorentů: ${kc(k.kreditniLimity)}</li>
        <li>Domácnost: ${Number(k.pocetDospelych) || 1} dospělí, ${Number(k.pocetDeti) || 0} dětí</li>
      </ul>

      ${lead.poznamka ? `<h3 style="margin-bottom:4px">Poznámka od klienta</h3><p>${escapeHtml(lead.poznamka)}</p>` : ''}

      ${blokOdhadu}

      <h3 style="margin-bottom:4px">Zdroj návštěvy</h3>
      <ul>
        <li>UTM: ${escapeHtml(lead.utm.source || '—')} / ${escapeHtml(lead.utm.medium || '—')} / ${escapeHtml(lead.utm.campaign || '—')}</li>
        ${lead.utm.content ? `<li>UTM content: ${escapeHtml(lead.utm.content)}</li>` : ''}
        <li>fbclid: ${lead.fbclid ? 'ano' : '—'}</li>
        <li>URL: ${escapeHtml(lead.url)}</li>
      </ul>

      <p style="color:#6b6b6b;font-size:12px">
        Souhlas se zpracováním udělen: ${escapeHtml(lead.souhlas_cas)}<br/>
        Klientovi byla přislíbena odpověď do 48 hodin.
      </p>
    </div>
  `
}

// Google Apps Script webhook umí být při "studeném startu" výrazně pomalejší
// než běžné API (naměřeno 2–3 s normálně, ale i přes 30 s při prvním volání
// po delší době) — každé volání proto dostává vlastní timeout, ať jedno pomalé
// volání nezablokuje odpověď klientovi ani nepřekročí limit serverless funkce.
const TIMEOUT_EMAIL_MS = 8_000
const TIMEOUT_WEBHOOK_MS = 25_000
const TIMEOUT_CAPI_MS = 8_000

async function posliEmail(lead: LeadPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const od = process.env.LEAD_EMAIL_FROM
  const komu = process.env.LEAD_EMAIL_TO || 'hana.stejna@4fin.cz'

  if (!apiKey || !od) {
    console.error('E-mail leadu nebyl odeslán — chybí RESEND_API_KEY nebo LEAD_EMAIL_FROM v env.')
    return false
  }

  try {
    const odpoved = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: od,
        to: [komu],
        reply_to: lead.email,
        subject: `Nová poptávka: ${lead.jmeno} — ${NAZVY_ZAMERU[lead.kalkulacka.zamer] ?? lead.kalkulacka.zamer}`,
        html: sestavHtml(lead),
      }),
      signal: AbortSignal.timeout(TIMEOUT_EMAIL_MS),
    })
    return odpoved.ok
  } catch (chyba) {
    console.error('Odeslání e-mailu selhalo', chyba)
    return false
  }
}

async function posliWebhook(lead: LeadPayload): Promise<boolean> {
  const url = process.env.LEAD_WEBHOOK_URL
  if (!url) return false

  try {
    const odpoved = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(TIMEOUT_WEBHOOK_MS),
    })
    return odpoved.ok
  } catch (chyba) {
    console.error('Odeslání webhooku selhalo', chyba)
    return false
  }
}

async function posliMetaCapi(lead: LeadPayload, req: VercelRequest): Promise<void> {
  const pixelId = process.env.PUBLIC_META_PIXEL_ID
  const token = process.env.META_CAPI_ACCESS_TOKEN
  if (!pixelId || !token) return

  const klientskeIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()

  const telo = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: lead.event_id,
        event_source_url: lead.url,
        action_source: 'website',
        user_data: {
          em: [sha256(lead.email)],
          ph: [sha256(lead.telefon.replace(/^\+/, ''))],
          client_ip_address: klientskeIp,
          client_user_agent: lead.user_agent,
          fbc: lead.fbclid ? `fb.1.${Date.now()}.${lead.fbclid}` : undefined,
        },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  }

  try {
    await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telo),
      signal: AbortSignal.timeout(TIMEOUT_CAPI_MS),
    })
  } catch (chyba) {
    console.error('Odeslání Meta CAPI eventu selhalo', chyba)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ chyba: 'Metoda není podporována.' })
    return
  }

  if (!jePlatnyPayload(req.body)) {
    res.status(400).json({ chyba: 'Neplatná nebo neúplná data formuláře.' })
    return
  }

  const lead = req.body

  // Čekáme i na CAPI (i když jeho výsledek neovlivní odpověď klientovi) — serverless
  // funkce se po odeslání odpovědi může ukončit dřív, než by fetch doběhl.
  const [emailOk, webhookOk] = await Promise.all([posliEmail(lead), posliWebhook(lead), posliMetaCapi(lead, req)])

  if (!emailOk && !webhookOk) {
    res.status(502).json({ chyba: 'Poptávku se nepodařilo doručit. Zkuste to prosím znovu nebo zavolejte.' })
    return
  }

  res.status(200).json({ ok: true })
}
