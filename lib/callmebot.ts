import { SendResult } from "./types";

export async function sendWhatsAppMessage(message: string): Promise<SendResult> {
  const phone = process.env.PHONE;
  const apiKey = process.env.CALLMEBOT_KEY;

  if (!phone || !apiKey) {
    return {
      success: false,
      error: "Missing PHONE or CALLMEBOT_KEY environment variables",
    };
  }

  const encodedMessage = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodedMessage}&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const text = await response.text();

    if (response.ok && text.includes("Message queued")) {
      return {
        success: true,
        message: "Message sent successfully",
      };
    }

    return {
      success: false,
      error: `CallMeBot error: ${text}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export function formatMenuMessage(
  lunchDishes: string[] | null,
  dinnerDishes: string[] | null,
  day: number,
  monthName: string
): string {
  const header = `📅 *${day} de ${monthName}*\n`;

  let message = header;

  if (lunchDishes && lunchDishes.length > 0) {
    message += `\n🍱 *Menú del dia:*\n`;
    message += lunchDishes.map((d) => `- ${d}`).join("\n");
  }

  if (dinnerDishes && dinnerDishes.length > 0) {
    message += `\n\n🥣 *Proposta de sopar:*\n`;
    message += dinnerDishes.map((d) => `- ${d}`).join("\n");
  }

  if (!lunchDishes && !dinnerDishes) {
    return `${header}\n❌ No hi ha menú disponible per avui.`;
  }

  return message;
}

export const CATALAN_MONTHS = [
  "gener",
  "febrer",
  "març",
  "abril",
  "maig",
  "juny",
  "juliol",
  "agost",
  "setembre",
  "octubre",
  "novembre",
  "desembre",
];
