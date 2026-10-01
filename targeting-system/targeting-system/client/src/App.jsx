import { useCallback, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:4000";

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function StepBadge({ n, done, active }) {
  return <span className={`step-badge ${done ? "done" : ""} ${active ? "active" : ""}`}>{done ? "✓" : n}</span>;
}

export default function App() {
  const [names, setNames] = useState(null); // null = nothing uploaded yet
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [generatedDocs, setGeneratedDocs] = useState([]);
  const [mailNotice, setMailNotice] = useState("");
  const fileInputRef = useRef(null);

  const filteredNames = useMemo(() => {
    if (!names) return [];
    const q = search.trim().toLowerCase();
    if (!q) return names;
    return names.filter((n) => n.displayName.toLowerCase().includes(q));
  }, [names, search]);

  const selectedList = useMemo(
    () => (names ? names.filter((n) => selectedKeys.has(n.key)) : []),
    [names, selectedKeys]
  );

  const allFilteredSelected = filteredNames.length > 0 && filteredNames.every((n) => selectedKeys.has(n.key));

  async function uploadFile(file) {
    if (!file) return;
    setFileName(file.name);
    setUploadError("");
    setUploading(true);
    setNames(null);
    setSelectedKeys(new Set());
    setGeneratedDocs([]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setNames(data.names);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e) {
    uploadFile(e.target.files?.[0]);
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.xlsx$/i.test(file.name)) uploadFile(file);
  }, []);

  function toggleName(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredNames.forEach((n) => next.delete(n.key));
      } else {
        filteredNames.forEach((n) => next.add(n.key));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  async function handleGenerate() {
    if (selectedList.length === 0) return;
    setGenerating(true);
    setGenerateError("");
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: selectedList.map((p) => p.key) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate PDFs");
      setGeneratedDocs((prev) => [...data.generated, ...prev]);
      if (data.errors?.length) {
        setGenerateError(`Failed for: ${data.errors.map((e) => e.key).join(", ")}`);
      }
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleSendMail(doc) {
    setMailNotice(`Send via Mail is coming soon — "${doc.fileName}" is not sent yet.`);
    setTimeout(() => setMailNotice(""), 4000);
  }

  const step1Done = !!names;
  const step2Done = selectedList.length > 0;
  const step3Done = generatedDocs.length > 0;

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-icon">📄</div>
          <div>
            <h1>Sales Target Letter Generator</h1>
            <p className="subtitle">Upload the budget workbook, pick one or more names, and download personalized target letters as PDFs.</p>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="card">
          <div className="card-head">
            <StepBadge n={1} done={step1Done} active={!step1Done} />
            <h2>Upload Excel</h2>
          </div>

          <label
            className={`dropzone ${dragOver ? "drag-over" : ""} ${uploading ? "busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={handleFileChange} disabled={uploading} />
            <div className="dropzone-icon">{uploading ? "⏳" : "📊"}</div>
            <div className="dropzone-text">
              {uploading ? (
                <>
                  <strong>Processing workbook...</strong>
                  <span>This can take up to a minute for large files.</span>
                </>
              ) : (
                <>
                  <strong>{fileName || "Drop your .xlsx file here"}</strong>
                  <span>or click to browse</span>
                </>
              )}
            </div>
          </label>

          {uploading && (
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          )}
          {uploadError && <p className="error">⚠ {uploadError}</p>}
          {names && !uploading && <p className="success">✓ Loaded {names.length} names from the workbook.</p>}
        </section>

        {names && (
          <section className="card">
            <div className="card-head">
              <StepBadge n={2} done={step2Done} active={!step2Done} />
              <h2>Select Name(s)</h2>
            </div>

            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="search-box"
                type="text"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                  ✕
                </button>
              )}
            </div>

            <div className="list-toolbar">
              <button className="link-btn" onClick={toggleSelectAllFiltered}>
                {allFilteredSelected ? "Deselect all" : "Select all"} {search ? "(filtered)" : ""}
              </button>
              <p className="list-meta">
                {selectedList.length > 0 ? `${selectedList.length} selected · ` : ""}
                {filteredNames.length} of {names.length} names
              </p>
            </div>

            <div className="name-list">
              {filteredNames.map((n) => {
                const checked = selectedKeys.has(n.key);
                return (
                  <button
                    key={n.key}
                    className={`name-item ${checked ? "selected" : ""}`}
                    onClick={() => toggleName(n.key)}
                  >
                    <span className={`checkbox ${checked ? "checked" : ""}`}>{checked ? "✓" : ""}</span>
                    <span className="avatar">{initials(n.displayName)}</span>
                    <span className="name-item-main">
                      <span className="name-item-name">{n.displayName}</span>
                      <span className="badges">
                        {n.hasDiagnostics && <span className="badge badge-diag">Diagnostics</span>}
                        {n.hasEndoSurgery && <span className="badge badge-endo">Endo Surgery</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredNames.length === 0 && <p className="hint">No names match "{search}".</p>}
            </div>
          </section>
        )}

        {selectedList.length > 0 && (
          <section className="card highlight-card">
            <div className="card-head">
              <StepBadge n={3} done={step3Done} active={!step3Done} />
              <h2>Generate PDF{selectedList.length > 1 ? "s" : ""}</h2>
            </div>

            {selectedList.length === 1 ? (
              <div className="selected-summary">
                <span className="avatar avatar-lg">{initials(selectedList[0].displayName)}</span>
                <div>
                  <div className="selected-name">{selectedList[0].displayName}</div>
                  <div className="badges">
                    {selectedList[0].hasDiagnostics && <span className="badge badge-diag">Diagnostics</span>}
                    {selectedList[0].hasEndoSurgery && <span className="badge badge-endo">Endo Surgery</span>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="selected-chips">
                {selectedList.map((p) => (
                  <span className="chip" key={p.key}>
                    {p.displayName}
                    <button className="chip-remove" onClick={() => toggleName(p.key)} aria-label={`Remove ${p.displayName}`}>
                      ✕
                    </button>
                  </span>
                ))}
                <button className="link-btn chip-clear" onClick={clearSelection}>
                  Clear all
                </button>
              </div>
            )}

            <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <span className="spinner" /> Generating {selectedList.length > 1 ? `${selectedList.length} PDFs...` : "PDF..."}
                </>
              ) : selectedList.length > 1 ? (
                <>⚙ Generate {selectedList.length} PDFs</>
              ) : (
                <>⚙ Generate PDF</>
              )}
            </button>
            {generateError && <p className="error">⚠ {generateError}</p>}
          </section>
        )}

        {generatedDocs.length > 0 && (
          <section className="card highlight-card">
            <div className="card-head">
              <StepBadge n={4} done={true} active={false} />
              <h2>Generated Documents</h2>
            </div>

            {mailNotice && <p className="hint mail-notice">✉ {mailNotice}</p>}

            <div className="doc-list">
              {generatedDocs.map((doc) => (
                <div className="doc-item" key={doc.id}>
                  <span className="doc-icon">📄</span>
                  <span className="doc-name">{doc.displayName}</span>
                  <span className="doc-actions">
                    <a className="btn btn-sm" href={`${API_BASE}${doc.viewUrl}`} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    <a className="btn btn-sm" href={`${API_BASE}${doc.downloadUrl}`}>
                      Download
                    </a>
                    <button className="btn btn-sm btn-mail" onClick={() => handleSendMail(doc)}>
                      ✉ Send via Mail
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">Sales Target Letter Generator</footer>
    </div>
  );
}
