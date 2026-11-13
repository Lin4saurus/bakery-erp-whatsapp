// Verificación de comprobantes de pago por WhatsApp (D86, D91–D96). Funciones puras: no tocan la base, así que la
// regla de oro, los rechazos y el saldo se prueban sin servidor (M1, AUDITORIA.md). La ruta junta los datos y escribe.
// Todo monto va en Prisma.Decimal (S3): sumar varios pagos parciales nunca deja un «falta Bs 0,01» fantasma.

import { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;
const CERO = new Prisma.Decimal(0);

// Bs con coma decimal, como lo lee la dueña.
export const bs = (n: Decimal): string => `Bs ${n.toFixed(2).replace(".", ",")}`;

// Lo que leyó la IA del comprobante, ya validado por la ruta.
export interface ComprobanteLeido {
  esComprobante: boolean;
  monto: Decimal | null; // redondeado a 2 decimales
  confianza: number | null;
  fecha: string | null; // «AAAA-MM-DD HH:MM»
  referencia: string | null; // tal como se lee (para mostrarla)
  receptor: string | null;
  titular: string | null;
  cuentaDestino: string | null;
  cuentaTitular: string | null;
  estadoPago: string | null;
  pareceEditado: boolean;
  sospecha: string | null;
  banco: string | null;
  enviadoPor: string | null;
}

// Lo que la ruta averiguó en la base sobre esa cotización.
export interface ContextoPago {
  hoy: string; // AAAA-MM-DD en America/La_Paz
  total: Decimal | null; // null = no tiene cotización por pagar
  yaPago: Decimal; // comprobantes válidos que esperan a la dueña (sin contar un reenvío del mismo)
  parcialesPrevios: number; // de esos, cuántos fueron parciales
  envioSinAceptar: boolean; // delivery cuyo costo de envío el cliente todavía no aceptó
  referenciaRepetida: string | null; // texto para la dueña si el nro. de operación ya se usó o está en espera en otro chat
}

export type Resultado = "por_confirmar" | "incompleto" | "rechazado" | "revision";

export interface Evaluacion {
  resultado: Resultado;
  legible: boolean;
  valido: boolean; // cuenta para el saldo: VERIFICAR_PAGO (pago completo o parcial)
  rechazado: boolean;
  saldo: Decimal | null; // lo que faltaba antes de este comprobante
  faltante: Decimal | null; // lo que sigue faltando si este pago válido es parcial
  rechazos: { duena: string; cliente: string }[]; // falso o manipulado: para la dueña y, en simple, para el cliente
  revision: string[]; // algo no cuadra pero no prueba que sea falso
}

const UMBRAL_CONFIANZA = 0.6;
const ESTADO_NO_EXITOSO = /pendiente|proceso|rechaz|fallid|error|anulad|revertid/i;

export function evaluarComprobante(l: ComprobanteLeido, c: ContextoPago): Evaluacion {
  const saldo = c.total ? Prisma.Decimal.max(c.total.sub(c.yaPago), CERO) : null;
  const monto = l.monto;
  const legible = monto !== null && (l.confianza ?? 0) >= UMBRAL_CONFIANZA;
  const rechazos: Evaluacion["rechazos"] = [];
  const rechazar = (duena: string, cliente: string) => rechazos.push({ duena, cliente });
  const revision: string[] = [];

  if (l.esComprobante) {
    if (!c.total) revision.push("Mandó un comprobante pero no tiene una cotización por pagar.");
    if (!legible || monto === null) revision.push("No se pudo leer bien el comprobante.");
    else {
      // Regla de oro (D95): el comprobante tiene que ser de hoy (hora de Bolivia).
      const dia = l.fecha?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      if (!dia) rechazar("No se ve la fecha del pago.", "no se ve la fecha del pago");
      else if (dia !== c.hoy) {
        rechazar(
          dia < c.hoy
            ? `Este pago es de ${haceCuanto(dia, c.hoy)} (${fechaLegible(dia)}), no de hoy.`
            : `Este pago tiene una fecha que todavía no llegó (${fechaLegible(dia)}).`,
          `la fecha del comprobante (${fechaLegible(dia)}) no coincide con la fecha de hoy (${fechaLegible(c.hoy)})`,
        );
      }
      // Destinatario (D96): el nombre del titular del QR o su nro. de cuenta/celular. Basta con uno de los dos.
      if (l.titular || l.cuentaTitular) {
        const nombreOk = !!(l.receptor && l.titular && nombreCoincide(l.receptor, l.titular));
        const cuentaOk = !!(l.cuentaDestino && l.cuentaTitular && cuentaCoincide(l.cuentaDestino, l.cuentaTitular));
        if (!nombreOk && !cuentaOk) {
          const fue = [l.receptor ? `«${l.receptor}»` : null, l.cuentaDestino ? `la cuenta ${l.cuentaDestino}` : null]
            .filter(Boolean)
            .join(" · ");
          const debia = [l.titular ? `«${l.titular}»` : null, l.cuentaTitular ? `la cuenta ${l.cuentaTitular}` : null]
            .filter(Boolean)
            .join(" · ");
          if (fue) rechazar(`El pago fue a ${fue}, no a ${debia}.`, "el pago no fue a nombre de la pastelería");
          else revision.push("No se ve a quién se hizo el pago (ni el nombre ni la cuenta de destino).");
        }
      }
      if (l.estadoPago && ESTADO_NO_EXITOSO.test(l.estadoPago)) {
        rechazar(
          `El comprobante dice que el pago está «${l.estadoPago}».`,
          `el comprobante dice que el pago está «${l.estadoPago}»`,
        );
      }
      if (l.pareceEditado) {
        rechazar(
          `La imagen parece editada${l.sospecha ? `: ${l.sospecha.replace(/[.\s]+$/, "")}` : ""}.`,
          "el comprobante tiene señales de edición",
        );
      }
      if (c.referenciaRepetida) rechazar(c.referenciaRepetida, "ese número de operación ya se usó en otro pago");
      // Pagos fraccionados: después de dos parciales, un tercero que tampoco completa es sospechoso.
      if (saldo && monto.lt(saldo) && c.parcialesPrevios >= 2) {
        rechazar(
          `Pagos fraccionados: ya mandó ${c.parcialesPrevios} pagos parciales para esta cotización.`,
          "ya recibimos varios pagos parciales para este pedido; envía el saldo en un solo pago",
        );
      }
      if (c.envioSinAceptar) revision.push("Pagó antes de aceptar el costo del envío (delivery).");
      if (saldo && monto.gt(saldo)) {
        revision.push(`Pagó ${bs(monto)} y ${c.yaPago.gt(0) ? "le faltaban" : "la cotización es de"} ${bs(saldo)}.`);
      }
    }
  }

  const rechazado = l.esComprobante && rechazos.length > 0;
  const valido = l.esComprobante && c.total !== null && legible && !rechazado && revision.length === 0;
  const faltante = valido && saldo && monto && monto.lt(saldo) ? saldo.sub(monto) : null;
  const resultado: Resultado =
    valido && !faltante ? "por_confirmar" : faltante ? "incompleto" : rechazado ? "rechazado" : "revision";
  return { resultado, legible, valido, rechazado, saldo, faltante, rechazos, revision };
}

// Texto de la tarjeta en Atención: una línea por renglón; «!- » es grave y «- » normal (D94). Sin números de pedido.
export function redactarDescripcion(l: ComprobanteLeido, c: ContextoPago, e: Evaluacion, notaAnterior: string | null): string {
  const resumen = [l.banco, l.enviadoPor ? `de ${l.enviadoPor}` : null].filter(Boolean).join(" · ");
  const conResumen = (t: string) => (resumen ? `${t} (${resumen})` : t);
  const nota = notaAnterior ? [notaAnterior] : [];
  if (!l.esComprobante) return "Mandó una imagen o PDF que no parece un comprobante de pago.";
  if (e.rechazado) {
    return [
      `Comprobante rechazado: ${e.legible && l.monto ? `sus ${bs(l.monto)} no` : "no"} se descuentan.`,
      ...e.rechazos.map((r) => `!- ${r.duena}`),
      ...e.revision.map((m) => `- ${m}`),
      ...(e.saldo ? [`Saldo pendiente: ${bs(e.saldo)}.`] : []),
      conResumen("No lo confirmes hasta ver el dinero en tu banco."),
    ].join("\n");
  }
  if (e.faltante && l.monto && c.total) {
    return [
      `Pago parcial de ${bs(l.monto)}.`,
      `!- Faltan ${bs(e.faltante)} de ${bs(c.total)}: se le pidió el saldo.`,
      ...nota,
      conResumen("Mira en tu banco que llegó; confirmas cuando complete el pago."),
    ].join("\n");
  }
  if (e.valido && c.total) {
    return [
      `El comprobante cuadra con la cotización de ${bs(c.total)}.`,
      ...(c.yaPago.gt(0) ? [`Completa el pago: antes mandó ${bs(c.yaPago)}.`] : []),
      ...nota,
      conResumen("Mira en tu banco que llegó y confirma el pago."),
    ].join("\n");
  }
  return [
    "Revisa el comprobante:",
    ...e.revision.map((m) => `- ${m}`),
    conResumen("No lo confirmes hasta ver el dinero en tu banco."),
  ].join("\n");
}

// La nota que queda cuando un pago válido reemplaza una tarjeta de «posible estafa» (D96).
export function notaDeRechazoAnterior(descripcionAnterior: string): string {
  const motivo = descripcionAnterior
    .split("\n")
    .find((r) => r.startsWith("!- "))
    ?.slice(3);
  return `- Antes mandó un comprobante rechazado${motivo ? `: ${motivo.replace(/[.\s]+$/, "")}` : ""}.`;
}

export const fechaLegible = (dia: string): string => dia.split("-").reverse().join("/");

// «ayer», «hace 5 días», «hace 1 mes», «hace 3 meses» entre dos días AAAA-MM-DD.
export function haceCuanto(dia: string, hoy: string): string {
  const dias = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000);
  if (dias <= 1) return "ayer";
  if (dias < 28) return `hace ${dias} días`;
  if (dias < 365) {
    const meses = Math.max(1, Math.round(dias / 30));
    return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  }
  const anios = Math.round(dias / 365);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

// Cuenta o celular de destino frente a la del QR: se comparan los dígitos (los últimos 8 alcanzan).
export function cuentaCoincide(destino: string, titular: string): boolean {
  const a = destino.replace(/\D/g, "");
  const b = titular.replace(/\D/g, "");
  if (a.length < 6 || b.length < 6) return false;
  const n = Math.min(a.length, b.length, 8);
  return a.slice(-n) === b.slice(-n);
}

// Destinatario del comprobante frente al titular del QR: basta con que el nombre o el primer apellido
// aparezca, tolerando 1–2 letras de diferencia (como en el agente de TikTok).
export function nombreCoincide(receptor: string, titular: string): boolean {
  const palabras = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  const delReceptor = palabras(receptor).filter((p) => p.length >= 3);
  const delTitular = palabras(titular).slice(0, 2);
  if (delReceptor.length === 0 || delTitular.length === 0) return true;
  return delReceptor.some((r) => delTitular.some((t) => distancia(r, t) <= (t.length >= 6 ? 2 : 1)));
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0] ?? 0;
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j] ?? 0;
      fila[j] = Math.min((fila[j] ?? 0) + 1, (fila[j - 1] ?? 0) + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = guardado;
    }
  }
  return fila[b.length] ?? 0;
}
