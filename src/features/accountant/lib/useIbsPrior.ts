import { useCallback, useEffect, useState } from "react";
import { loadIbsPrior, saveIbsPrior } from "@/features/accountant/lib/ibsPriorStore";

/**
 * IBS N-1 for one client and acompte year, as the text of an input. Loads the saved value when the client
 * or year changes; `save` stores the current value (call it when the field loses focus).
 * With no client selected, or before the table is live, it is a plain manual entry.
 */
export const useIbsPrior = (clientRef: string | undefined, year: number) => {
  const [value, setValue] = useState("0");
  useEffect(() => {
    let live = true;
    setValue("0");
    if (!clientRef) return;
    void loadIbsPrior(clientRef, year).then((v) => { if (live && v !== null) setValue(String(v)); });
    return () => { live = false; };
  }, [clientRef, year]);
  const save = useCallback(() => {
    if (clientRef) void saveIbsPrior(clientRef, year, Number(value) || 0);
  }, [clientRef, year, value]);
  return { value, setValue, save };
};
