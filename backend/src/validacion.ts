import { z } from "zod";
import { Prisma } from "@prisma/client";

// Mensajes de Zod en español para lo que ve la dueña.
z.setErrorMap((issue, ctx) => {
  if (ctx.data === undefined) return { message: "Es obligatorio." };
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type: {
      // En palabras de la dueña, no «se esperaba number» (U4).
      const esperado: Record<string, string> = {
        number: "Debe ser un número.",
        string: "Debe ser un texto.",
        boolean: "Debe ser sí o no.",
        array: "Debe ser una lista.",
        date: "Debe ser una fecha.",
      };
      return { message: esperado[issue.expected] ?? "Dato inválido." };
    }
    case z.ZodIssueCode.invalid_union:
      return { message: "Debe ser un número válido." };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido. Opciones: ${issue.options.join(", ")}.` };
    default:
      return { message: ctx.defaultError };
  }
});

const aDecimal = (valor: number | string): Prisma.Decimal | null => {
  try {
    const resultado = new Prisma.Decimal(valor);
    return resultado.isFinite() ? resultado : null;
  } catch {
    return null;
  }
};

// Acepta número o texto ("0.0064") y lo convierte a Decimal sin pasar por float.
// La regla va dentro del transform: un .refine() posterior correría aun con un valor inválido.
const decimal = (cumpleRegla: (valor: Prisma.Decimal) => boolean, mensajeRegla: string) =>
  z.union([z.number(), z.string().trim().min(1)]).transform((valor, ctx) => {
    const resultado = aDecimal(valor);
    if (resultado === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe ser un número válido." });
      return z.NEVER;
    }
    if (!cumpleRegla(resultado)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensajeRegla });
      return z.NEVER;
    }
    return resultado;
  });

export const decimalPositivo = decimal((valor) => valor.gt(0), "Debe ser mayor que 0.");
export const decimalNoNegativo = decimal((valor) => valor.gte(0), "No puede ser negativo.");
export const decimalDistintoDeCero = decimal((valor) => !valor.isZero(), "No puede ser 0.");
export const decimal0a100 = decimal((valor) => valor.gte(0) && valor.lte(100), "Debe estar entre 0 y 100.");

const id = z.coerce.number({ invalid_type_error: "Debe ser un número." }).int().positive("Debe ser un id válido.");

export const parseId = (valor: unknown): number => id.parse(valor);

export const nombre = z.string().trim().min(1, "Es obligatorio.").max(100, "Máximo 100 caracteres.");

export const alMenosUnCampo = (datos: object): boolean => Object.keys(datos).length > 0;

// Dos nombres son el mismo cliente si solo cambian mayúsculas, tildes o espacios (D45):
// «Marco  Aurélio» = «marco aurelio». Distinto apellido = distinto cliente.
export const normalizarNombre = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-_'’]/g, " ") // puntos y guiones cuentan como espacio (D45, S5): «María-José» = «Maria José»
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
