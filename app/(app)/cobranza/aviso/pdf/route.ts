import { getUser } from "@/lib/auth";
import { APP_NAME, IS_DEMO } from "@/lib/brand";
import { chargesOf, getSettings, pendingByCharge, unitBalance } from "@/lib/data";
import { isPeriod, today } from "@/lib/format";
import { currentRate } from "@/lib/rates";
import { statementPdf } from "@/lib/statement-pdf";
import { readPhoto } from "@/lib/uploads";
import { draftLines, getStatement, statementTotals, unitCharge, type Statement } from "@/lib/statements";

/**
 * El aviso de cobro en PDF. El comerciante descarga el de su local; la
 * administración, el de cualquier local (?local=) o el general.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user || user.role === "vigilante") return new Response("No autorizado", { status: 401 });
  const params = new URL(request.url).searchParams;
  const period = params.get("mes") ?? "";
  if (!isPeriod(period)) return new Response("Mes no válido", { status: 400 });

  const isAdmin = user.role === "admin";
  const unitId = isAdmin ? Number(params.get("local")) || null : user.unitId;
  const unit = unitId ? unitBalance(unitId) : null;
  if (!isAdmin && !unit) return new Response("Sin local", { status: 404 });
  if (params.get("local") && !unit) return new Response("Ese local no existe", { status: 404 });

  const settings = getSettings();
  let statement: Statement | null = getStatement(period);
  if (!statement) {
    // Solo la administración puede sacar el borrador de un mes sin emitir.
    if (!isAdmin) return new Response("Ese aviso no se ha emitido", { status: 404 });
    const rate = (await currentRate())?.bsPerUsd ?? 0;
    statement = { period, issuedOn: null, dueOn: null, rate, lines: draftLines(period, rate, settings.reservePercent) };
  }

  const charge = unit && statement.issuedOn ? unitCharge(unit.id, period) : null;
  const aliquot = unit ? (charge?.aliquot ?? unit.aliquot) : 100;
  const neto = statementTotals(statement.lines, aliquot).neto;
  // Lo que el local arrastra de avisos anteriores a este.
  const pending = unit ? pendingByCharge(unit.id) : null;
  const previousDebt = unit
    ? chargesOf(unit.id).filter((c) => c.period < period).reduce((n, c) => n + (pending!.get(c.id) ?? 0), 0)
    : undefined;

  const bytes = await statementPdf({
    siteName: settings.name,
    location: settings.location,
    logo: settings.logo ? await readPhoto(settings.logo) : null,
    demo: IS_DEMO,
    rif: settings.rif,
    paymentInfo: settings.paymentInfo,
    appName: APP_NAME,
    statement,
    unit: unit ?? undefined,
    aliquot,
    usdCents: charge?.usdCents ?? (statement.rate ? Math.round(neto / statement.rate) : 0),
    previousDebt,
    totalDebt: unit?.balance,
    today: today(),
  });

  const name = `aviso-${period}${unit ? `-local-${unit.id}` : "-general"}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
