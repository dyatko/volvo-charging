import type { components } from "./energy.gen";

export type EnergyState = components["schemas"]["EnergyState"];

type AnyResultField = NonNullable<EnergyState[keyof EnergyState]>;
type OkOf<F> = F extends { status: "OK" } ? F : never;

export type FieldStatus<F extends AnyResultField> =
  | { ok: true; value: OkOf<F>["value"]; unit?: string; updatedAt: string }
  | { ok: false; code: string; message: string };

export function readField<F extends AnyResultField>(field: F): FieldStatus<F> {
  if (field.status === "OK") {
    const f = field as OkOf<F> & { unit?: string; updatedAt: string };
    return { ok: true, value: f.value, unit: f.unit, updatedAt: f.updatedAt };
  }
  return { ok: false, code: field.code, message: field.message };
}
