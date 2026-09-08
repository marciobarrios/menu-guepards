import { SendResult } from "./types";

interface TelegramMessageOptions {
  includeWhatsAppShare?: boolean;
}

export function getWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export async function sendTelegramMessage(
  message: string,
  options: TelegramMessageOptions = {}
): Promise<SendResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      success: false,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables",
    };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        ...(options.includeWhatsAppShare && {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Compartir per WhatsApp",
                  url: getWhatsAppShareUrl(message),
                },
              ],
            ],
          },
        }),
      }),
    });

    const data = await response.json();

    if (data.ok) {
      return {
        success: true,
        message: "Message sent successfully",
      };
    }

    return {
      success: false,
      error: `Telegram error: ${data.description || "Unknown error"}`,
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
    message += lunchDishes.map((d) => `• ${d}`).join("\n");
  }

  if (dinnerDishes && dinnerDishes.length > 0) {
    message += `\n\n🥣 *Proposta de sopar:*\n`;
    message += dinnerDishes.map((d) => `• ${d}`).join("\n");
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
