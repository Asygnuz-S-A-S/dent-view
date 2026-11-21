"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotonImprimir() {
  return <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer /> Imprimir / guardar PDF</Button>;
}
