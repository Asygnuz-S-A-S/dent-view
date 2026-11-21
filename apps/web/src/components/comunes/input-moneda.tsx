"use client";

import { Input } from "@/components/ui/input";
import { conMiles, soloDigitos } from "@/lib/formato";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  /** Solo dígitos ("180000"); el campo lo muestra como "180.000". */
  value: string;
  onValueChange: (digitos: string) => void;
};

export function InputMoneda({ value, onValueChange, ...props }: Props) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input {...props} inputMode="numeric" autoComplete="off" className={`pl-7 ${props.className ?? ""}`} value={conMiles(value)} onChange={(e) => onValueChange(soloDigitos(e.target.value))} />
    </div>
  );
}
