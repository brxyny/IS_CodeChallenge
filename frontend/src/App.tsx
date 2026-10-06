import { useState } from "react";
import { formatNumber, parseMatrix, reconstructionError } from "./matrix";
import type { Matrix, ProcessResult } from "./types";

const examples = [
  {
    label: "Cuadrada",
    matrix: [
      [1, 2],
      [3, 4],
    ],
  },
  {
    label: "Rectangular",
    matrix: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  },
  {
    label: "Ancha",
    matrix: [
      [1, 2, 3],
      [4, 5, 6],
    ],
  },
  {
    label: "Negativos",
    matrix: [
      [-1, -2],
      [-3, -4],
    ],
  },
  {
    label: "Decimales",
    matrix: [
      [0.1, 1.25],
      [-2.75, 4.5],
    ],
  },
  {
    label: "Diagonal",
    matrix: [
      [2, 0],
      [0, 3],
    ],
  },
];

function MatrixCard({
  title,
  description,
  matrix,
}: {
  title: string;
  description: string;
  matrix: Matrix;
}) {
  // Keep large valid inputs usable without rendering tens of thousands of cells.
  const visibleRows = matrix.slice(0, 12);
  const visibleColumns = Math.min(matrix[0].length, 12);
  const truncated = matrix.length > 12 || matrix[0].length > 12;
  return (
    <section className="matrix-card" aria-label={title}>
      <div className="card-heading">
        <h3>{title}</h3>
        <span className="dimension">
          {matrix.length} × {matrix[0].length}
        </span>
      </div>
      <p>{description}</p>
      <div className="matrix-scroll">
        <table aria-label={`Valores de ${title}`}>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.slice(0, visibleColumns).map((value, columnIndex) => (
                  <td key={columnIndex} title={String(value)}>
                    {formatNumber(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <small>
          Vista parcial: primeras 12 filas y columnas. Descarga el JSON para ver
          todos los valores.
        </small>
      )}
    </section>
  );
}

function formatInput(matrix: Matrix): string {
  return (
    "[\n" + matrix.map((row) => "  " + JSON.stringify(row)).join(",\n") + "\n]"
  );
}

export default function App() {
  const [input, setInput] = useState(formatInput(examples[0].matrix));
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [original, setOriginal] = useState<Matrix | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function editInput(value: string) {
    setInput(value);
    setResult(null);
    setOriginal(null);
    setError("");
  }
  async function processMatrix(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    setOriginal(null);
    setBusy(true);
    try {
      const matrix = parseMatrix(input);
      const response = await fetch("/api/v1/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
        credentials: "same-origin",
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401) {
        throw new Error(
          "El acceso expiró o no está autorizado. Recarga la página e ingresa tus credenciales.",
        );
      }
      if (!response.headers.get("content-type")?.includes("application/json")) {
        throw new Error(
          response.status === 413
            ? "La matriz supera el límite de tamaño de la solicitud."
            : "El servicio no está disponible temporalmente. Inténtalo nuevamente.",
        );
      }
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || `La solicitud falló (${response.status}).`,
        );
      setOriginal(matrix);
      setResult(body as ProcessResult);
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "TimeoutError") {
        setError(
          "La solicitud superó el tiempo de espera. Inténtalo nuevamente.",
        );
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : "No fue posible procesar la matriz.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function downloadResult() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ matrix: original, ...result }, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "matrix-result.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header>
        <a className="brand" href="/" aria-label="Matrix Lab inicio">
          <span className="brand-mark">M</span>Matrix Lab
        </a>
        <span className="project-label">Interseguro · Coding Challenge</span>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">EXPLORA UNA MATRIZ</span>
          <h1>De números a resultados.</h1>
          <p>
            Factorización QR, rotación y estadísticas en una sola operación.
          </p>
        </div>
        <div className="workspace">
          <section className="input-panel">
            <div className="section-title">
              <span className="step">01</span>
              <h2>Tu matriz</h2>
            </div>
            <p className="muted">
              Elige un ejemplo o escribe un arreglo de filas en JSON.
            </p>
            <div className="examples" aria-label="Ejemplos de matrices">
              {examples.map((example) => (
                <button
                  type="button"
                  key={example.label}
                  disabled={busy}
                  onClick={() => editInput(formatInput(example.matrix))}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <form onSubmit={processMatrix}>
              <label htmlFor="matrix-input">Valores de la matriz</label>
              <textarea
                id="matrix-input"
                value={input}
                disabled={busy}
                onChange={(event) => editInput(event.target.value)}
                spellCheck={false}
                rows={9}
                aria-describedby="input-help"
              />
              <p id="input-help" className="hint">
                Hasta 256 × 256 · Todas las filas deben tener el mismo tamaño.
              </p>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="primary" disabled={busy} type="submit">
                {busy ? "Procesando…" : "Procesar matriz"}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <div className="note">
              <strong>¿Qué se calcula?</strong>
              <p>
                QR descompone A en Q × R. También rotamos A 90° en sentido
                horario. Las estadísticas combinan todos los valores de Q y R.
              </p>
            </div>
          </section>
          <section
            className="results-panel"
            aria-live="polite"
            aria-busy={busy}
          >
            <div className="section-title">
              <span className="step">02</span>
              <h2>Resultados</h2>
              {result && (
                <button className="download" onClick={downloadResult}>
                  Descargar JSON ↓
                </button>
              )}
            </div>
            {!result ? (
              <div className="empty-state">
                <div className="matrix-symbol" aria-hidden="true">
                  [&nbsp; A &nbsp;]
                </div>
                <h3>
                  {busy
                    ? "Calculando tus resultados…"
                    : "Todo empieza con una matriz."}
                </h3>
                <p>
                  {busy
                    ? "Calculamos QR, rotación y estadísticas."
                    : "Procesa los valores de la izquierda para explorar Q, R y la rotación."}
                </p>
              </div>
            ) : (
              <>
                <div className="reconstruction">
                  <span className="status-dot" />A ≈ Q × R{" "}
                  <span>
                    Error máximo:{" "}
                    <strong>
                      {formatNumber(
                        reconstructionError(original!, result.q, result.r),
                      )}
                    </strong>
                  </span>
                </div>
                <div className="matrix-grid">
                  <MatrixCard
                    title="Q"
                    description="Columnas ortonormales"
                    matrix={result.q}
                  />
                  <MatrixCard
                    title="R"
                    description="Factor triangular superior"
                    matrix={result.r}
                  />
                  <MatrixCard
                    title="Rotación"
                    description="90° en sentido horario"
                    matrix={result.rotation}
                  />
                </div>
                <section className="statistics">
                  <h3>Estadísticas de Q + R</h3>
                  <div className="statistics-grid">
                    {[
                      ["Máximo", result.statistics.max],
                      ["Mínimo", result.statistics.min],
                      ["Promedio", result.statistics.average],
                      ["Suma total", result.statistics.sum],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <strong>{formatNumber(Number(value))}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="diagonal">
                    <span>
                      Q diagonal:{" "}
                      <strong>
                        {result.statistics.diagonal.q ? "Sí" : "No"}
                      </strong>
                    </span>
                    <span>
                      R diagonal:{" "}
                      <strong>
                        {result.statistics.diagonal.r ? "Sí" : "No"}
                      </strong>
                    </span>
                    <span>
                      Alguna diagonal:{" "}
                      <strong>
                        {result.statistics.diagonal.any ? "Sí" : "No"}
                      </strong>
                    </span>
                  </div>
                  <p className="hint">
                    {result.statistics.count} valores · Diagonalidad: matriz
                    cuadrada y |valor fuera de diagonal| ≤{" "}
                    {result.statistics.epsilon}.
                  </p>
                </section>
              </>
            )}
          </section>
        </div>
      </main>
      <footer>
        <span>Go + Node.js · Sin persistencia de matrices</span>
        <span>
          Los valores visibles se redondean; el JSON conserva la precisión.
        </span>
      </footer>
    </div>
  );
}
