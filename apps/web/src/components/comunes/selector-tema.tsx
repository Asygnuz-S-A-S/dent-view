"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";

export function SelectorTema() {
  const { theme = "system", setTheme } = useTheme();
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">Apariencia</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
        <DropdownMenuRadioItem value="light"><Sun /> Claro</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><Moon /> Oscuro</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system"><Monitor /> Del sistema</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
