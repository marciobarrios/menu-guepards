"use client";

import { useState, useEffect, useCallback } from "react";

interface DailyMenu {
  day: number;
  dishes: string[];
}

interface MonthMenus {
  month: number;
  year: number;
  lunch: DailyMenu[];
  dinner: DailyMenu[];
}

const MONTHS = [
  "Gener",
  "Febrer",
  "Març",
  "Abril",
  "Maig",
  "Juny",
  "Juliol",
  "Agost",
  "Setembre",
  "Octubre",
  "Novembre",
  "Desembre",
];

export default function Home() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [lunchFile, setLunchFile] = useState<File | null>(null);
  const [dinnerFile, setDinnerFile] = useState<File | null>(null);

  const [lunchPreview, setLunchPreview] = useState<DailyMenu[] | null>(null);
  const [dinnerPreview, setDinnerPreview] = useState<DailyMenu[] | null>(null);

  const [currentMenus, setCurrentMenus] = useState<MonthMenus | null>(null);
  // Only the value entered by the owner lives here, never a server-provided secret.
  const [ownerSecret, setOwnerSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const manualActionsDisabled = loading || !ownerSecret.trim();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadCurrentMenus = useCallback(async () => {
    try {
      const res = await fetch(`/api/menus?year=${selectedYear}&month=${selectedMonth}`);
      const data = await res.json();
      if (data.success) {
        setCurrentMenus(data.menus);
      } else {
        setCurrentMenus(null);
      }
    } catch {
      setCurrentMenus(null);
    }
  }, [selectedYear, selectedMonth]);

  // Load current month's menus on mount and when selection changes
  useEffect(() => {
    loadCurrentMenus();
  }, [loadCurrentMenus]);

  async function ownerFetch(path: "/api/parse-menu" | "/api/send-menu", init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${ownerSecret}`);
    const response = await fetch(path, { ...init, headers });
    if (response.status === 401) setOwnerSecret("");
    return response;
  }

  async function parseFile(file: File, type: "lunch" | "dinner") {
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("year", selectedYear.toString());
    formData.append("month", selectedMonth.toString());
    formData.append("save", "false");

    try {
      const res = await ownerFetch("/api/parse-menu", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        if (type === "lunch") {
          setLunchPreview(data.menus);
        } else {
          setDinnerPreview(data.menus);
        }
        setMessage({ type: "success", text: `S'han trobat ${data.menus.length} dies al PDF` });
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Error processant el PDF" });
    } finally {
      setLoading(false);
    }
  }

  async function saveMenus(type: "lunch" | "dinner") {
    const file = type === "lunch" ? lunchFile : dinnerFile;
    if (!file) return;

    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("year", selectedYear.toString());
    formData.append("month", selectedMonth.toString());
    formData.append("save", "true");

    try {
      const res = await ownerFetch("/api/parse-menu", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: `Menús de ${type === "lunch" ? "dinar" : "sopar"} guardats!` });
        loadCurrentMenus();
        if (type === "lunch") {
          setLunchFile(null);
          setLunchPreview(null);
        } else {
          setDinnerFile(null);
          setDinnerPreview(null);
        }
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Error guardant els menús" });
    } finally {
      setLoading(false);
    }
  }

  async function sendNow() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await ownerFetch("/api/send-menu", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Error enviant el missatge" });
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>, type: "lunch" | "dinner") {
    const file = e.target.files?.[0];
    if (file) {
      if (type === "lunch") {
        setLunchFile(file);
        setLunchPreview(null);
      } else {
        setDinnerFile(file);
        setDinnerPreview(null);
      }
      parseFile(file, type);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Menu Guepards</h1>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Month/Year Selector */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Selecciona el mes</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="border rounded-lg px-4 py-2 text-gray-700"
            >
              {MONTHS.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Any</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="border rounded-lg px-4 py-2 text-gray-700"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          Les dates i els dies de plat únic es detecten automàticament a partir de la graella del PDF.
        </p>
      </section>

      <section className="bg-white rounded-lg shadow p-6 mb-6" aria-labelledby="owner-access-heading">
        <h2 id="owner-access-heading" className="text-xl font-semibold mb-4">Accés de propietari</h2>
        <label htmlFor="owner-secret" className="block text-sm text-gray-600 mb-1">Clau de propietari</label>
        <div className="flex flex-wrap gap-3">
          <input
            id="owner-secret"
            type="password"
            value={ownerSecret}
            onChange={(e) => setOwnerSecret(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="owner-secret-help"
            disabled={loading}
            className="border rounded-lg px-4 py-2 text-gray-700 min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => setOwnerSecret("")}
            disabled={loading || !ownerSecret}
            className="border rounded-lg px-4 py-2 text-gray-700 disabled:opacity-50"
          >
            Esborrar clau
          </button>
        </div>
        <p id="owner-secret-help" className="text-sm text-gray-500 mt-2">
          Introdueix la clau per pujar PDFs, guardar menús o enviar missatges.
          La clau es manté només mentre aquesta pàgina és oberta. Pots consultar els menús sense clau.
        </p>
      </section>

      {/* Upload Section */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Pujar PDFs</h2>
        <p className="text-gray-600 mb-4">
          Selecciona el mes/any i puja els PDFs de dinar i sopar.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Lunch Upload */}
          <div className={`border-2 border-dashed rounded-lg p-4 ${lunchPreview ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}>
            <h3 className="font-medium mb-2">Menú de Dinar</h3>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => handleFileChange(e, "lunch")}
              className="w-full text-sm"
              disabled={manualActionsDisabled}
            />
            {lunchPreview && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-green-600">{lunchPreview.length} dies trobats</span>
                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded font-medium">PENDENT DE GUARDAR</span>
                </div>
                <button
                  onClick={() => saveMenus("lunch")}
                  disabled={manualActionsDisabled}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 w-full"
                >
                  Guardar menús de dinar
                </button>
              </div>
            )}
          </div>

          {/* Dinner Upload */}
          <div className={`border-2 border-dashed rounded-lg p-4 ${dinnerPreview ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`}>
            <h3 className="font-medium mb-2">Proposta de Sopar</h3>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => handleFileChange(e, "dinner")}
              className="w-full text-sm"
              disabled={manualActionsDisabled}
            />
            {dinnerPreview && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-green-600">{dinnerPreview.length} dies trobats</span>
                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded font-medium">PENDENT DE GUARDAR</span>
                </div>
                <button
                  onClick={() => saveMenus("dinner")}
                  disabled={manualActionsDisabled}
                  className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 w-full"
                >
                  Guardar propostes de sopar
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Preview Section */}
      {(lunchPreview || dinnerPreview) && (
        <section className="bg-amber-50 border-2 border-amber-300 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold">Vista prèvia</h2>
            <span className="text-sm bg-amber-200 text-amber-800 px-2 py-1 rounded font-medium">No guardat - comprova i guarda</span>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {lunchPreview && (
              <div>
                <h3 className="font-medium mb-2">Dinars</h3>
                <div className="max-h-96 overflow-y-auto">
                  {lunchPreview.map((menu) => (
                    <div key={menu.day} className="mb-3 p-2 bg-gray-50 rounded">
                      <span className="font-medium">Dia {menu.day}:</span>
                      <ul className="text-sm text-gray-600 ml-4">
                        {menu.dishes.map((dish, i) => (
                          <li key={i}>- {dish}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dinnerPreview && (
              <div>
                <h3 className="font-medium mb-2">Sopars</h3>
                <div className="max-h-96 overflow-y-auto">
                  {dinnerPreview.map((menu) => (
                    <div key={menu.day} className="mb-3 p-2 bg-gray-50 rounded">
                      <span className="font-medium">Dia {menu.day}:</span>
                      <ul className="text-sm text-gray-600 ml-4">
                        {menu.dishes.map((dish, i) => (
                          <li key={i}>- {dish}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Current Menus Section */}
      <section className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Menús guardats - {MONTHS[selectedMonth - 1]} {selectedYear}
        </h2>
        {currentMenus ? (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">Dinars ({currentMenus.lunch.length} dies)</h3>
              <div className="max-h-96 overflow-y-auto">
                {currentMenus.lunch.map((menu) => (
                  <div key={menu.day} className="mb-3 p-2 bg-gray-50 rounded">
                    <span className="font-medium">Dia {menu.day}:</span>
                    <ul className="text-sm text-gray-600 ml-4">
                      {menu.dishes.map((dish, i) => (
                        <li key={i}>- {dish}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-medium mb-2">Sopars ({currentMenus.dinner.length} dies)</h3>
              <div className="max-h-96 overflow-y-auto">
                {currentMenus.dinner.map((menu) => (
                  <div key={menu.day} className="mb-3 p-2 bg-gray-50 rounded">
                    <span className="font-medium">Dia {menu.day}:</span>
                    <ul className="text-sm text-gray-600 ml-4">
                      {menu.dishes.map((dish, i) => (
                        <li key={i}>- {dish}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No hi ha menús guardats per aquest mes.</p>
        )}
      </section>

      {/* Send Now Section */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Enviar menú d&apos;avui</h2>
        <p className="text-gray-600 mb-4">
          Envia el menú del dia actual via Telegram.
        </p>
        <button
          onClick={sendNow}
          disabled={manualActionsDisabled}
          className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "Enviant..." : "Enviar ara"}
        </button>
      </section>
    </main>
  );
}
