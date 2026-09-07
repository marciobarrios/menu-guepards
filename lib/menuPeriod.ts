const CATALAN_MONTHS = [
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

export interface MenuPeriod {
  year: number;
  month: number;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function withDe(monthName: string): string {
  return /^[aeiou]/i.test(monthName) ? `d'${monthName}` : `de ${monthName}`;
}

export function getMenuPeriodFromTitle(title: string): MenuPeriod | null {
  const normalizedTitle = normalizeText(title);
  const yearMatch = normalizedTitle.match(/\b(20\d{2})\b/);
  const monthIndex = CATALAN_MONTHS.findIndex((month) =>
    new RegExp(`\\b${normalizeText(month)}\\b`).test(normalizedTitle)
  );

  if (!yearMatch || monthIndex === -1) {
    return null;
  }

  return {
    year: Number(yearMatch[1]),
    month: monthIndex + 1,
  };
}

export function validateMenuPeriod(
  title: string,
  expectedYear: number,
  expectedMonth: number
): string | null {
  const detectedPeriod = getMenuPeriodFromTitle(title);
  const expectedMonthName = CATALAN_MONTHS[expectedMonth - 1];

  if (!detectedPeriod) {
    return `No s'ha pogut confirmar que el PDF sigui ${withDe(expectedMonthName)} ${expectedYear}`;
  }

  if (
    detectedPeriod.year !== expectedYear ||
    detectedPeriod.month !== expectedMonth
  ) {
    const detectedMonthName = CATALAN_MONTHS[detectedPeriod.month - 1];
    return `El PDF és ${withDe(detectedMonthName)} ${detectedPeriod.year}, no ${withDe(expectedMonthName)} ${expectedYear}`;
  }

  return null;
}
