import type { DailyMenu, ParsedMenuResult } from "./types";

export async function readMenuUploadResponse(response: Response): Promise<{ menus: DailyMenu[]; warning?: string }> {
  // The hosting platform can reject a request before our JSON route runs.
  if (response.status === 413) {
    throw new Error("El PDF supera el límit de 4 MiB. Puja un PDF amb només la primera pàgina (menú estàndard).");
  }

  let data: ParsedMenuResult;
  try {
    data = await response.json();
  } catch {
    if ([504, 408].includes(response.status)) {
      throw new Error("S'ha esgotat el temps processant el PDF. Torna-ho a provar amb només la primera pàgina.");
    }
    throw new Error(`No s'ha pogut processar el PDF (HTTP ${response.status}). Torna-ho a provar.`);
  }
  if (!response.ok || !data.success) {
    throw new Error(data.error || `No s'ha pogut processar el PDF (HTTP ${response.status}).`);
  }
  if (!Array.isArray(data.menus)) {
    throw new Error("El servidor ha retornat una resposta de menú invàlida. Torna-ho a provar.");
  }
  return { menus: data.menus, ...(data.warning ? { warning: data.warning } : {}) };
}
