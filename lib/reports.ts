/* Reportes imprimibles (PDF desde el diálogo de impresión), con el mismo
   lenguaje brutalista del sistema: papel de fondo, bloques blancos de borde
   grueso, sombras sólidas, titulares Mona Sans anchos, la noche de la marca en
   los totales y un solo acento rojo. Se imprimen con print-color-adjust: exact
   para conservar fondos y sombras. */

import { BRAND, logoHTML, markSVG } from "./brand"
import { addDays, dateFmt, dateLong, daysBetween, esc, num, pct, plain, rateFmt, usd, ves } from "./format"
import {
  budgetDiscount,
  budgetSubtotal,
  budgetTotal,
  hasAnyDiscount,
  itemDiscount,
  itemDiscountPercent,
  itemGross,
  itemNet,
} from "./budget-math"
import type { AdvanceType, Budget, BudgetItem, Payment, Settings } from "./types"
import { methodLabel } from "./types"
import { AGING, type AgingId } from "./metrics"

const C = BRAND
const SNOW = "#F3F5FB"
const SNOW2 = "#B9C0D4"

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#E7DFD0}
body{font-family:"Mona Sans","Segoe UI",system-ui,sans-serif;color:${C.ink};font-size:12px;line-height:1.42;font-variant-numeric:tabular-nums}
.sheet{background:${C.paper};width:794px;min-height:1123px;margin:28px auto;border:3px solid ${C.ink};box-shadow:10px 10px 0 ${C.ink};display:flex;flex-direction:column}
.sheet.land{width:1123px;min-height:794px}
.wrap{flex:1 0 auto}
.wrap>thead>tr>td,.wrap>tbody>tr>td,.wrap>tfoot>tr>td{padding:0;vertical-align:top}
.foot-space,.head-space{display:none}
.page{padding:40px 44px 34px}
.d{font-stretch:125%;font-weight:850;letter-spacing:-.035em;line-height:.98}
.d2{font-stretch:112%;font-weight:800;letter-spacing:-.022em;line-height:1.06}
.mute{color:${C.mute}} .ink2{color:${C.ink2}} .r{text-align:right} .c{text-align:center} .nw{white-space:nowrap}
.tri{display:inline-block;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${C.red};flex:none}

.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;border-bottom:4px solid ${C.ink}}
.doc{text-align:right}
.title{font-size:46px}
.title .tail{color:${C.mute}}
.plate{display:inline-flex;align-items:center;gap:9px;margin-top:12px;background:${C.ink};color:${C.paper};border:2px solid ${C.ink};box-shadow:4px 4px 0 ${C.red};padding:7px 12px;font-weight:750;font-size:13px;white-space:nowrap}

.lbl{font-size:10.5px;font-weight:650;color:${C.ink2};margin-bottom:4px}
.val{font-size:14px;font-weight:750}
.meta{display:grid;margin-top:24px;background:${C.ink};gap:2px;border:2px solid ${C.ink};box-shadow:5px 5px 0 ${C.ink}}
.meta>div{background:#fff;padding:11px 13px}
.strip{display:flex;align-items:center;gap:10px;margin-top:14px;background:${C.amberBg};border:2px solid ${C.ink};padding:9px 13px;font-size:12px}
.strip b{font-weight:800}
.note{margin-top:14px;background:#fff;border:2px solid ${C.ink};border-left:8px solid ${C.ink};padding:11px 14px;font-size:12px;color:${C.ink2}}
h2.sec{display:flex;align-items:center;gap:9px;font-size:20px;margin:30px 0 13px}

.tw{background:#fff;border:2px solid ${C.ink};box-shadow:5px 5px 0 ${C.ink}}
table{width:100%;border-collapse:collapse;font-size:inherit}
.t thead th{background:${C.ink};color:${C.paper};font-size:10.5px;font-weight:650;text-align:left;padding:9px 10px}
.t tbody td{padding:9px 10px;border-top:1px solid rgba(14,20,34,.14);vertical-align:top}
.t tbody tr:first-child td{border-top:0}
.t tbody tr{break-inside:avoid}
.t tfoot td{padding:10px;font-weight:800;border-top:2px solid ${C.ink};background:${C.paper}}
.t td.r,.t th.r{white-space:nowrap}
.t thead th.r{text-align:right}
.t .n{width:36px}
.t .ix{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:${C.ink};color:${C.paper};font-weight:800;font-size:11px}
.t .cat{display:block;font-size:10px;color:${C.ink2};font-weight:650;margin-bottom:2px}
.t .dtext{display:block;font-weight:600;color:${C.ink}}
.t .q{font-weight:800;font-size:13px}
.t .gross{display:block;font-size:10px;font-weight:600;color:${C.mute};text-decoration:line-through}
.t .net{display:block;font-weight:800;font-size:13px}
.dtag{display:inline-block;background:${C.amberBg};color:${C.amber};border:1.5px solid ${C.amber};font-weight:800;font-size:10.5px;padding:2px 5px;line-height:1.15}
.t.items tbody td{border-top:1.5px solid rgba(14,20,34,.16)}
.t.items tbody tr:nth-child(even) td{background:#FBF8F1}
.t.items tbody td:first-child{padding-left:12px}
.tot .row.dis{background:${C.amberBg};color:${C.amber};font-weight:750}
.t .b{font-weight:750}
.t .sub{display:block;font-size:10px;font-weight:650;color:${C.ink2};margin-top:2px}
.disc{color:${C.amber}}

.tot{display:flex;justify-content:flex-end;margin-top:22px;break-inside:avoid}
.tot .in{width:340px}
.tot .row{display:flex;justify-content:space-between;padding:8px 13px;background:#fff;border:2px solid ${C.ink};border-bottom:0;font-size:12.5px}
.grand{display:flex;justify-content:space-between;align-items:center;gap:16px;background:${C.night};color:${SNOW};border:2px solid ${C.ink};box-shadow:5px 5px 0 ${C.red};padding:13px 14px}
.grand .k{font-weight:700;font-size:13px}
.grand .v{font-size:28px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:${C.ink};border:2px solid ${C.ink};margin-top:14px}
.split>div{background:${C.amberBg};padding:9px 13px}
.split>div+div{background:#fff}
.split .v{font-size:17px;margin-top:3px}
.bs{margin-top:12px;text-align:right;font-size:11px;color:${C.ink2}}

.cols{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;margin-top:32px;break-inside:avoid}
.box{background:#fff;border:2px solid ${C.ink};box-shadow:5px 5px 0 ${C.ink}}
.box h4{font-size:13px;font-weight:800;padding:9px 13px;border-bottom:2px solid ${C.ink};background:${C.paper}}
.box .in{padding:11px 13px}
.box p{font-size:11px;color:${C.ink2};margin-bottom:6px}
.pay dt{font-size:10px;color:${C.ink2};font-weight:650}
.pay dd{font-size:14px;font-weight:750;margin-bottom:7px}

.client{margin-top:24px}
.client .name{font-size:34px;margin-top:4px}
.tiles{display:grid;gap:14px;margin-top:20px}
.tile{background:#fff;border:2px solid ${C.ink};box-shadow:4px 4px 0 ${C.ink};padding:12px 14px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between}
.tile .v{font-size:23px;margin-top:8px;white-space:nowrap}
.tile .s{font-size:10.5px;margin-top:5px;color:${C.ink2}}
.tile.night{background:${C.night};color:${SNOW};box-shadow:4px 4px 0 ${C.red}}
.tile.night .lbl,.tile.night .s{color:${SNOW2}}
.tile.amber{background:${C.amberBg}} .tile.amber .v{color:${C.amber}}
.tile.green{background:${C.greenBg}} .tile.green .v{color:${C.green}}

.tag{display:inline-block;font-size:10px;font-weight:750;padding:3px 6px;border:1.5px solid;white-space:nowrap;line-height:1.1}
.tag.ok{background:${C.greenBg};color:${C.green};border-color:${C.green}}
.tag.warn{background:${C.amberBg};color:${C.amber};border-color:${C.amber}}
.tag.late{background:${C.amber};color:#fff;border-color:${C.amber}}
.tag.ink{background:#fff;color:${C.ink};border-color:${C.ink}}
.late{color:${C.amber};font-weight:800}

.hero-row{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;margin-top:18px;align-items:stretch}
.hero{background:${C.night};color:${SNOW};border:2px solid ${C.ink};box-shadow:7px 7px 0 ${C.red};padding:18px 22px}
.hero .lbl{color:${SNOW2};font-size:12px}
.hero .amt{font-size:58px;margin-top:8px;white-space:nowrap}
.hero .bsv{margin-top:8px;font-size:16px;font-weight:750}
.hero .bsv span{font-size:11px;font-weight:600;color:${SNOW2}}
.hero .meta2{margin-top:6px;font-size:11px;color:${SNOW2}}
.hero .more{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding-top:10px;border-top:1.5px solid rgba(243,245,251,.25);font-size:12px;color:${SNOW2}}
.hero .more+.more{margin-top:0;padding-top:4px;border-top:0}
.hero .more b{color:${SNOW};font-size:14px}
.hero .more.total b{font-size:16px}
.hero-row .box{box-shadow:5px 5px 0 ${C.ink}}
.card{margin-top:20px;background:#fff;border:2px solid ${C.ink};box-shadow:5px 5px 0 ${C.ink};break-inside:avoid}
.card .ch{display:flex;justify-content:space-between;gap:16px;padding:12px 14px;border-bottom:2px solid ${C.ink};background:${C.paper}}
.card .cb{padding:12px 14px 16px}
.card .tw{box-shadow:none}

.aging{display:flex;height:22px;border:2px solid ${C.ink};box-shadow:4px 4px 0 ${C.ink};margin:4px 0 12px;background:#fff}
.aging span{display:block;height:100%}
.aging span+span{border-left:2px solid ${C.ink}}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:${C.ink2}}
.legend i{display:inline-block;width:11px;height:11px;margin-right:5px;vertical-align:-1px;border:1.5px solid ${C.ink}}

.foot{margin-top:auto;background:${C.night};color:${SNOW};display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 44px;font-size:11px;border-top:3px solid ${C.ink};break-inside:avoid}
.foot .c1{display:flex;align-items:center;gap:14px}
.foot .c2{text-align:right;color:${SNOW2}}
.foot b{color:${SNOW};font-weight:700}

.toolbar{position:fixed;top:14px;right:14px;display:flex;gap:8px;z-index:9}
.toolbar button{font:700 13px "Mona Sans",system-ui;padding:9px 14px;border:2px solid ${C.ink};background:#fff;cursor:pointer;box-shadow:3px 3px 0 ${C.ink}}
.toolbar button.p{background:${C.ink};color:${C.paper}}

@media print{
  html{background:${C.paper}}
  .sheet,.sheet.land{width:auto;min-height:0;display:block;margin:0;border:0;box-shadow:none}
  /* El pie queda fijo al pie de cada página; el espacio del tfoot evita que el contenido pase por debajo */
  .foot{position:fixed;left:0;right:0;bottom:0;height:15mm;margin:0}
  .foot-space{display:block;height:19mm}
  /* Margen superior que se repite en cada página */
  .head-space{display:block;height:8mm}
  .toolbar{display:none}
  .page{padding:0 11mm}
  .foot{padding:0 11mm}
  .tot .row{padding:5px 12px}
  .split .v{font-size:15px}
  .bs{margin-top:8px}
  .box h4{padding:6px 11px}
  .pay dd{font-size:13px;margin-bottom:4px}
  body{font-size:11px}
  .head{padding-bottom:10px}
  .title{font-size:34px}
  .plate{margin-top:9px;padding:5px 10px;font-size:12px}
  .meta,.client{margin-top:15px}
  .meta>div{padding:7px 11px}
  .val{font-size:13px}
  .strip,.note{margin-top:10px;padding:7px 11px}
  h2.sec{font-size:17px;margin:14px 0 8px}
  .t thead th{padding:7px 9px}
  .t tbody td{padding:6px 9px}
  .tot{margin-top:10px}
  .grand{padding:10px 12px}
  .grand .v{font-size:24px}
  .split{margin-top:10px}
  .split>div{padding:5px 11px}
  .cols{margin-top:14px}
  .box .in{padding:9px 11px}
  .tiles{margin-top:14px;gap:11px}
  .tile{min-height:78px;padding:10px 12px}
  .tile .v{font-size:20px}
  .card{margin-top:14px}
  .hero{padding:14px 18px}
  .hero .amt{font-size:50px}
  .hero-row{margin-top:14px}
}
`

function shell({
  title,
  body,
  settings,
  landscape = false,
  toolbar = false,
}: {
  title: string
  body: string
  settings: Settings
  landscape?: boolean
  toolbar?: boolean
}) {
  const web = settings.website ? esc(settings.website) : ""
  return `<!doctype html><html lang="es-VE"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,300..900&display=swap" rel="stylesheet">
<style>${CSS}@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:0}</style></head><body>
${toolbar ? `<div class="toolbar"><button class="p" onclick="window.print()">Imprimir / PDF</button><button onclick="window.close()">Cerrar</button></div>` : ""}
<div class="sheet${landscape ? " land" : ""}"><table class="wrap"><thead><tr><td><div class="head-space"></div></td></tr></thead><tbody><tr><td><div class="page">${body}</div></td></tr></tbody><tfoot><tr><td><div class="foot-space"></div></td></tr></tfoot></table>
<div class="foot"><div class="c1">${markSVG({ color: SNOW, width: 66, stroke: 11 })}<div><b>${esc(settings.company_name || "Apex Consulting")}</b><br>Software web, móvil y de escritorio</div></div>
<div class="c2">${[settings.contact_email, settings.payment_phone].filter(Boolean).map(esc).join(" · ")}${web ? `<br><b>${web}</b>` : ""}</div></div></div>
</body></html>`
}

function header(title: string, plate: string, tail = "") {
  return `<div class="head">${logoHTML({ size: 30 })}<div class="doc"><div class="title d">${esc(title)}${tail ? `<span class="tail"> ${esc(tail)}</span>` : ""}</div><div class="plate"><span class="tri"></span>${plate}</div></div></div>`
}

function payBox(s: Settings) {
  return `<div class="box"><h4>Datos de pago</h4><div class="in"><dl class="pay">
    ${s.payment_phone ? `<dt>Teléfono (pago móvil)</dt><dd>${esc(s.payment_phone)}</dd>` : ""}
    ${s.payment_bank ? `<dt>Banco</dt><dd>${esc(s.payment_bank)}</dd>` : ""}
    ${s.payment_account ? `<dt>Número de cuenta</dt><dd>${esc(s.payment_account)}</dd>` : ""}
    ${s.payment_id_number ? `<dt>Cédula / RIF</dt><dd>${esc(s.payment_id_number)}</dd>` : ""}
  </dl></div></div>`
}

/* ---------- Ítems ---------- */

function itemsTable(items: BudgetItem[]) {
  const showDiscounts = hasAnyDiscount(items)
  const cols = showDiscounts ? 6 : 5
  const rows = items.length
    ? items
        .map((it, i) => {
          const d = itemDiscount(it)
          return `<tr><td class="n"><span class="ix">${i + 1}</span></td>
<td>${it.category ? `<span class="cat">${esc(it.category)}</span>` : ""}<span class="dtext">${esc(it.description)}</span></td>
<td class="r"><span class="q">${plain(num(it.quantity))}</span><span class="sub">${esc(it.unit || "")}</span></td>
<td class="r">${usd(num(it.rate))}<span class="sub">c/u</span></td>
${showDiscounts ? `<td class="r">${d > 0 ? `<span class="dtag">−${plain(itemDiscountPercent(it))} %</span><span class="sub disc">−${usd(d)}</span>` : `<span class="mute">—</span>`}</td>` : ""}
<td class="r">${d > 0 ? `<s class="gross">${usd(itemGross(it))}</s>` : ""}<span class="net">${usd(itemNet(it))}</span></td></tr>`
        })
        .join("")
    : `<tr><td colspan="${cols}" class="c mute" style="padding:28px">Sin ítems</td></tr>`
  return `<div class="tw"><table class="t items"><thead><tr><th>#</th><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio</th>${showDiscounts ? `<th class="r">Descuento</th>` : ""}<th class="r">Importe</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

/* ---------- Anticipo ---------- */

interface AdvanceTerms {
  advance_type?: AdvanceType | null
  advance_value?: number | null
}

const advanceAmountOf = (t: AdvanceTerms, total: number) => {
  const v = num(t.advance_value)
  if (!t.advance_type || v <= 0) return 0
  return t.advance_type === "percent" ? (total * Math.min(v, 100)) / 100 : Math.min(v, total)
}

const advanceText = (t: AdvanceTerms) =>
  t.advance_type === "percent"
    ? `Anticipo ${num(t.advance_value).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`
    : `Anticipo de ${usd(num(t.advance_value))}`

/* ---------- Presupuesto ---------- */

export interface BudgetDoc extends AdvanceTerms {
  number: string
  date: string
  client_name: string
  project_name: string
  project_description?: string | null
  items: BudgetItem[]
  approved_on?: string | null
}

export function budgetReport(
  doc: BudgetDoc,
  settings: Settings,
  opts: { toolbar?: boolean } = {},
) {
  const total = budgetTotal(doc.items)
  const showDiscounts = hasAnyDiscount(doc.items)
  const adv = advanceAmountOf(doc, total)
  const n = settings.due_days
  const start = doc.approved_on && doc.approved_on > doc.date ? doc.approved_on : doc.date
  const prepaid = adv > 0 ? (doc.advance_type === "percent" ? `el ${plain(num(doc.advance_value))} %` : `un anticipo de ${usd(adv)}`) : "el 50 %"

  const body = `${header("Presupuesto", `Nº ${esc(doc.number)}`)}
<div class="meta" style="grid-template-columns:1.35fr 1.35fr 1fr 1fr">
  <div><div class="lbl">Cliente</div><div class="val">${esc(doc.client_name || "—")}</div></div>
  <div><div class="lbl">Proyecto</div><div class="val">${esc(doc.project_name || "—")}</div></div>
  <div><div class="lbl">Emisión</div><div class="val nw">${dateFmt(doc.date)}</div></div>
  <div><div class="lbl">Vence</div><div class="val nw">${dateFmt(addDays(start, n))}</div></div>
</div>
${adv > 0 ? `<div class="strip"><span class="tri"></span><span><b>${esc(advanceText(doc))}</b> al aprobar: <b>${usd(adv)}</b> · el resto, <b>${usd(total - adv)}</b>, a la entrega.</span></div>` : ""}
<div class="note">${esc(doc.project_description || "Presupuesto sujeto a disponibilidad. Forma de pago a convenir según acuerdo comercial.")}</div>
<h2 class="sec d2"><span class="tri"></span>Detalle</h2>
${itemsTable(doc.items)}
<div class="tot"><div class="in">
${showDiscounts ? `<div class="row"><span class="ink2">Subtotal</span><span>${usd(budgetSubtotal(doc.items))}</span></div><div class="row dis"><span>Descuento · ${plain((budgetDiscount(doc.items) / (budgetSubtotal(doc.items) || 1)) * 100)} %</span><span>−${usd(budgetDiscount(doc.items))}</span></div>` : ""}
<div class="grand"><span class="k">Total</span><span class="v d">${usd(total)}</span></div>
${adv > 0 ? `<div class="split"><div><div class="lbl">${esc(advanceText(doc))}</div><div class="v d">${usd(adv)}</div></div><div><div class="lbl">Contra entrega</div><div class="v d">${usd(total - adv)}</div></div></div>` : ""}
</div></div>
<div class="cols">
  <div class="box"><h4>Términos y condiciones</h4><div class="in">
    <p><b>Modalidad post-pago:</b> el presupuesto cuenta con ${n} días hábiles para su cancelación a partir de su aprobación. Transcurrido dicho plazo sin recibir el pago, los montos podrán estar sujetos a modificaciones o recargos por retraso.</p>
    <p><b>Modalidad prepago:</b> se abona ${prepaid} del presupuesto al inicio del trabajo y el resto a su entrega o finalización.</p>
  </div></div>
  ${payBox(settings)}
</div>`
  return shell({ title: `Presupuesto ${doc.number} · ${doc.project_name || doc.client_name}`, body, settings, toolbar: opts.toolbar })
}

/* ---------- Estado de cuenta de un cliente ---------- */

export type ChargeKind = "saldo" | "anticipo" | "monto"

export interface StatementRow {
  budget: Budget
  /** Lo que se le cobra ahora de este presupuesto, en USD */
  due: number
  kind: ChargeKind
  /** "Saldo", "Anticipo 50 %", "Monto acordado" */
  label: string
  late: boolean
  /** Días de atraso respecto al vencimiento (0 si no ha vencido) */
  lateDays: number
}

export interface StatementInput {
  clientName: string
  rows: StatementRow[]
  payments: Payment[]
  settings: Settings
  today: string
  options: { payments: boolean }
}

/* El estado de cuenta se manda al cliente: lo que importa es cuánto debe pagar
   (lo vencido, en grande) y dónde pagarlo. Sin detalle de ítems ni totales de
   presupuestado/abonado. */
export function statementReport(i: StatementInput) {
  const { settings: s } = i
  const due = i.rows.reduce((t, r) => t + r.due, 0)
  const late = i.rows.reduce((t, r) => t + (r.late ? r.due : 0), 0)
  const notLate = due - late
  const lateCount = i.rows.filter((r) => r.late && r.due > 0.005).length
  const heroAmount = late > 0.005 ? late : due
  const heroLabel = late > 0.005 ? "Vencido · a pagar" : "A pagar"

  const rows = i.rows
    .map((r) => {
      const b = r.budget
      const start = b.approved_on && b.approved_on > b.date ? b.approved_on : b.date
      const tag = r.late
        ? `<span class="tag late">Vencido${r.lateDays > 0 ? ` · ${r.lateDays} d` : ""}</span>`
        : r.kind === "anticipo"
          ? `<span class="tag ink">Anticipo</span>`
          : `<span class="tag warn">Por vencer</span>`
      return `<tr><td class="b nw">${esc(b.number)}</td><td><span class="dtext">${esc(b.project_name)}</span></td><td class="nw">${dateFmt(addDays(start, s.due_days))}</td>
<td>${esc(r.label)}</td><td class="r"><span class="net ${r.late ? "late" : ""}">${usd(r.due)}</span></td><td>${tag}</td></tr>`
    })
    .join("")

  const pays =
    i.options.payments && i.payments.length
      ? `<h2 class="sec d2"><span class="tri"></span>Abonos recibidos</h2><div class="tw"><table class="t"><thead><tr><th>Fecha</th><th>Presupuesto</th><th>Método</th><th>Referencia</th><th class="r">Monto</th></tr></thead><tbody>
${i.payments
  .map((p) => {
    const b = i.rows.find((r) => r.budget.id === p.budget_id)?.budget
    return `<tr><td class="nw">${dateFmt(p.payment_date)}</td><td>${esc(b?.number ?? "")} · ${esc(b?.project_name ?? "")}</td><td>${esc(methodLabel(p.payment_method))}</td><td>${esc(p.reference_number || "—")}</td>
<td class="r b">${usd(p.amount)}</td></tr>`
  })
  .join("")}</tbody></table></div>`
      : ""

  const body = `${header("Estado de cuenta", esc(dateLong(i.today)))}
<div class="client"><div class="lbl">Cliente</div><div class="name d">${esc(i.clientName)}</div></div>
<div class="hero-row">
  <div class="hero">
    <div class="lbl">${heroLabel}</div>
    <div class="amt d">${usd(heroAmount)}</div>
    <div class="meta2">${late > 0.005 ? `${lateCount} presupuesto${lateCount === 1 ? "" : "s"} vencido${lateCount === 1 ? "" : "s"}` : `${i.rows.length} presupuesto${i.rows.length === 1 ? "" : "s"}`}</div>
    ${late > 0.005 && notLate > 0.005 ? `<div class="more"><span>Además, por vencer</span><b>${usd(notLate)}</b></div><div class="more total"><span>Total a pagar ahora</span><b>${usd(due)}</b></div>` : ""}
  </div>
  ${payBox(s)}
</div>
<h2 class="sec d2"><span class="tri"></span>Detalle de lo que se cobra</h2>
<div class="tw"><table class="t items"><thead><tr><th>Nº</th><th>Proyecto</th><th>Venció</th><th>Concepto</th><th class="r">A pagar</th><th>Estado</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="c mute" style="padding:24px">Sin montos por cobrar</td></tr>`}</tbody>
<tfoot><tr><td colspan="4">Total a pagar</td><td class="r">${usd(due)}</td><td></td></tr></tfoot></table></div>
${pays}`

  return shell({ title: `Estado de cuenta · ${i.clientName}`, body, settings: s })
}

/* ---------- Cuentas por cobrar (todos los clientes) ---------- */

export interface ReceivableClient {
  name: string
  budgets: Budget[]
  aging: Record<AgingId, number>
  pending: number
  overdue: number
  lastPayment: string | null
}

const stateTag = (b: Budget, late: boolean) => {
  const paid = num(b.paid_amount)
  if (paid >= num(b.total) - 0.005) return `<span class="tag ok">Pagado</span>`
  if (late) return `<span class="tag late">Vencido</span>`
  return paid > 0.005 ? `<span class="tag warn">Abonado</span>` : `<span class="tag warn">Por cobrar</span>`
}

export function receivablesReport(i: {
  clients: ReceivableClient[]
  aging: Record<AgingId, { amount: number; count: number }>
  receivable: number
  overdue: number
  settings: Settings
  today: string
  rate: number | null
  rateDate: string | null
}) {
  const { settings: s, rate } = i
  const bs = (v: number) => (rate ? `<div class="s">${ves(v * rate)}</div>` : "")
  const bar = AGING.map((a) => {
    const v = i.aging[a.id].amount
    return v > 0 ? `<span style="width:${(v / (i.receivable || 1)) * 100}%;background:${a.color}" title="${a.label}"></span>` : ""
  }).join("")
  const legend = AGING.map((a) => `<span><i style="background:${a.color}"></i>${a.label}: <b>${usd(i.aging[a.id].amount)}</b></span>`).join("")

  const rows = i.clients
    .map(
      (c) => `<tr><td class="b">${esc(c.name)}</td><td class="r">${c.budgets.length}</td><td class="r b">${usd(c.pending)}</td>
${AGING.map((a) => `<td class="r ${c.aging[a.id] > 0 && a.id !== "current" ? "late" : c.aging[a.id] > 0 ? "" : "mute"}">${c.aging[a.id] > 0 ? usd(c.aging[a.id]) : "—"}</td>`).join("")}
<td class="nw">${c.lastPayment ? dateFmt(c.lastPayment) : "—"}</td></tr>`,
    )
    .join("")

  const detail = i.clients
    .map(
      (c) => `<div class="card"><div class="ch"><div class="d2" style="font-size:19px">${esc(c.name)}</div><div class="r"><b style="font-size:14px">${usd(c.pending)}</b>${rate ? `<div class="ink2">${ves(c.pending * rate)}</div>` : ""}</div></div>
<div class="cb"><div class="tw"><table class="t"><thead><tr><th>Nº</th><th>Proyecto</th><th>Aprobado</th><th class="r">Días</th><th class="r">Total</th><th class="r">Abonado</th><th class="r">Saldo</th><th>Estado</th></tr></thead><tbody>
${c.budgets
  .map((b) => {
    const start = b.approved_on && b.approved_on > b.date ? b.approved_on : b.date
    const late = daysBetween(addDays(start, s.due_days), i.today) > 0
    return `<tr><td class="b">${esc(b.number)}</td><td>${esc(b.project_name)}</td><td class="nw">${dateFmt(start)}</td><td class="r">${daysBetween(start, i.today)}</td><td class="r">${usd(b.total)}</td><td class="r">${usd(b.paid_amount)}</td><td class="r b">${usd(num(b.total) - num(b.paid_amount))}</td><td>${stateTag(b, late)}</td></tr>`
  })
  .join("")}</tbody></table></div></div></div>`,
    )
    .join("")

  const body = `${header("Cuentas por cobrar", esc(dateLong(i.today)))}
<div class="tiles" style="grid-template-columns:repeat(4,1fr)">
  <div class="tile night"><div class="lbl">Por cobrar</div><div class="v d">${usd(i.receivable)}</div>${bs(i.receivable)}</div>
  <div class="tile amber"><div class="lbl">Vencido (más de ${s.due_days} días)</div><div class="v d">${usd(i.overdue)}</div>${bs(i.overdue)}</div>
  <div class="tile green"><div class="lbl">Por vencer</div><div class="v d">${usd(i.receivable - i.overdue)}</div>${bs(i.receivable - i.overdue)}</div>
  <div class="tile"><div class="lbl">Clientes con saldo</div><div class="v d">${i.clients.length}</div><div class="s">${i.clients.reduce((t, c) => t + c.budgets.length, 0)} presupuestos aprobados con saldo</div></div>
</div>
<h2 class="sec d2"><span class="tri"></span>Antigüedad de saldos</h2><div class="aging">${bar}</div><div class="legend">${legend}</div>
<h2 class="sec d2"><span class="tri"></span>Por cliente</h2>
<div class="tw"><table class="t"><thead><tr><th>Cliente</th><th class="r">Abiertos</th><th class="r">Saldo</th>${AGING.map((a) => `<th class="r">${a.label}</th>`).join("")}<th>Último pago</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td>Total</td><td class="r">${i.clients.reduce((t, c) => t + c.budgets.length, 0)}</td><td class="r">${usd(i.receivable)}</td>${AGING.map((a) => `<td class="r">${usd(i.aging[a.id].amount)}</td>`).join("")}<td></td></tr></tfoot></table></div>
${rate ? `<div class="bs">Montos en Bs a la tasa BCV ${i.rateDate ? `del ${dateFmt(i.rateDate)}` : ""}: ${rateFmt(rate)} Bs/$</div>` : ""}
<h2 class="sec d2"><span class="tri"></span>Detalle por cliente</h2>${detail}`

  return shell({ title: `Cuentas por cobrar · ${dateFmt(i.today)}`, body, settings: s, landscape: true })
}

/* ---------- Cobros de un período ---------- */

export interface CollectionRow {
  payment: Payment
  budget?: Budget
  /** Bs del cobro: los registrados en Bs, o la referencia a la tasa BCV de su fecha */
  bs: number | null
  bsIsReference: boolean
  rate: number | null
}

export function collectionsReport(i: { rows: CollectionRow[]; period: string; settings: Settings; today: string }) {
  const totalUsd = i.rows.reduce((t, r) => t + num(r.payment.amount), 0)
  const inVes = i.rows.filter((r) => r.payment.currency === "VES")
  const totalVes = inVes.reduce((t, r) => t + num(r.payment.amount_ves), 0)
  const withRate = i.rows.filter((r) => r.rate)
  const avgRate = withRate.length ? withRate.reduce((t, r) => t + num(r.rate), 0) / withRate.length : null
  const refBs = i.rows.reduce((t, r) => t + (r.bs ?? 0), 0)

  const byMethod = new Map<string, number>()
  i.rows.forEach((r) => byMethod.set(r.payment.payment_method, (byMethod.get(r.payment.payment_method) ?? 0) + num(r.payment.amount)))

  const body = `${header("Cobros", esc(i.period))}
<div class="tiles" style="grid-template-columns:repeat(4,1fr)">
  <div class="tile night"><div class="lbl">Cobrado</div><div class="v d">${usd(totalUsd)}</div><div class="s">${i.rows.length} cobro${i.rows.length === 1 ? "" : "s"}</div></div>
  <div class="tile"><div class="lbl">Recibido en bolívares</div><div class="v d">${ves(totalVes)}</div><div class="s">${inVes.length} cobro${inVes.length === 1 ? "" : "s"} en Bs</div></div>
  <div class="tile"><div class="lbl">Equivalente total en Bs</div><div class="v d">${ves(refBs)}</div><div class="s">a la tasa BCV de cada fecha</div></div>
  <div class="tile"><div class="lbl">Tasa promedio</div><div class="v d">${avgRate ? rateFmt(avgRate) : "—"}</div><div class="s">Bs por dólar</div></div>
</div>
<h2 class="sec d2"><span class="tri"></span>Detalle</h2>
<div class="tw"><table class="t"><thead><tr><th>Fecha</th><th>Presupuesto</th><th>Cliente</th><th>Método</th><th>Referencia</th><th class="r">Tasa</th><th class="r">Bolívares</th><th class="r">USD</th></tr></thead><tbody>
${i.rows
  .map(
    (r) => `<tr><td class="nw">${dateFmt(r.payment.payment_date)}</td><td>${esc(r.budget?.number ?? "")} · ${esc(r.budget?.project_name ?? "")}</td><td>${esc(r.budget?.client_name ?? "")}</td>
<td>${esc(methodLabel(r.payment.payment_method))}</td><td>${esc(r.payment.reference_number || "—")}</td><td class="r">${r.rate ? rateFmt(r.rate) : "—"}</td>
<td class="r ${r.bsIsReference ? "mute" : "b"}">${r.bs != null ? `${r.bsIsReference ? "≈ " : ""}${ves(r.bs)}` : "—"}</td><td class="r b">${usd(r.payment.amount)}</td></tr>`,
  )
  .join("")}</tbody>
<tfoot><tr><td colspan="6">Total</td><td class="r">≈ ${ves(refBs)}</td><td class="r">${usd(totalUsd)}</td></tr></tfoot></table></div>
<p class="bs" style="text-align:left">Los montos con «≈» son referencia a la tasa BCV de la fecha del cobro (cobros registrados en dólares).</p>
<h2 class="sec d2"><span class="tri"></span>Por método de pago</h2>
<div class="tw" style="max-width:420px"><table class="t"><tbody>${Array.from(byMethod.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([m, v]) => `<tr><td>${esc(methodLabel(m))}</td><td class="r b">${usd(v)}</td></tr>`)
    .join("")}</tbody></table></div>`

  return shell({ title: `Cobros · ${i.period}`, body, settings: i.settings, landscape: true })
}

/** Porcentaje para mostrar en etiquetas ("50 %") */
export const pctLabel = (n: number) => pct(n)
