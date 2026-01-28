export interface DailyMenu {
  day: number;       // Day of month (1-31)
  dishes: string[];  // Array of dishes
}

export interface MonthMenus {
  month: number;     // 1-12
  year: number;
  lunch: DailyMenu[];
  dinner: DailyMenu[];
}

export interface ParsedMenuResult {
  success: boolean;
  menus?: DailyMenu[];
  error?: string;
}

export interface SendResult {
  success: boolean;
  message?: string;
  error?: string;
}
