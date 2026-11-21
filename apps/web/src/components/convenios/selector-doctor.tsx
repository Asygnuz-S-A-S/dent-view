"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SelectorDoctor({ doctores, actual }: { doctores: { id: string; nombre: string }[]; actual?: string }) {
  const router = useRouter();
  return (
    <div className="max-w-sm space-y-2">
      <Label id="lbl-doctor">Doctor remitente</Label>
      <Select value={actual ?? ""} onValueChange={(v) => router.push(`/convenios?tab=doctores&doctor=${v}`)}>
        <SelectTrigger aria-labelledby="lbl-doctor" className="w-full"><SelectValue placeholder="Elige un doctor" /></SelectTrigger>
        <SelectContent>{doctores.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
