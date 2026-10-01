import React, { useState } from 'react';
import loginShot from './screenshots/01-login.png';
import registerShot from './screenshots/02-register.png';
import navbarTendersShot from './screenshots/03-navbar-tenders-menu.png';
import tendersListShot from './screenshots/04-tenders-list.png';
import tendersListGemShot from './screenshots/07-tenders-list-gem.png';
import tenderDetailsFullShot from './screenshots/08-tender-details-full.png';
import suggestedProductsShot from './screenshots/09-suggested-products.png';
import deviationShot from './screenshots/10-deviation.png';
import processDecodeShot from './screenshots/11-process-decode-modal.png';
import deviationPageShot from './screenshots/12-deviation-page.png';
import representationEditorShot from './screenshots/13-representation-editor.png';
import representationPdfShot from './screenshots/14-representation-pdf-download.png';
import tenderDetailsExpandedShot from './screenshots/15-tender-details-expanded.png';

// Coordinates below are raw pixel positions on the 1440x900 screenshots
// (see screenshots/01-login.png, 02-register.png). The overlay SVG uses the
// same viewBox so a target here lands exactly on that field regardless of
// how large the image is rendered.
const TOPICS = [
  {
    key: 'login',
    label: 'How to Login',
    icon: '🔐',
    steps: [
      { text: 'Go to the OpenProcure login page.', image: loginShot, target: null },
      { text: 'Enter your registered email address.', image: loginShot, target: { x: 1090, y: 441, from: { x: 620, y: 300 } } },
      { text: 'Enter your password.', image: loginShot, target: { x: 1090, y: 552, from: { x: 620, y: 380 } } },
      { text: 'Click the "Login" button.', image: loginShot, target: { x: 1090, y: 686, from: { x: 620, y: 620 } } },
    ],
  },
  {
    key: 'register',
    label: 'How to Register',
    icon: '📝',
    steps: [
      { text: 'Go to the OpenProcure registration page.', image: registerShot, target: null },
      { text: 'Enter your full name, email address, and a password.', image: registerShot, target: { x: 1090, y: 300, from: { x: 620, y: 200 } } },
      { text: 'Select your role (e.g. Sales, Tender Admin, Finance Team).', image: registerShot, target: { x: 1090, y: 516, from: { x: 620, y: 460 } } },
      { text: 'Click "Register" to create your account.', image: registerShot, target: { x: 1090, y: 828, from: { x: 620, y: 700 } } },
    ],
  },
  {
    key: 'view-tenders',
    label: 'How to View Tenders',
    icon: '📋',
    steps: [
      { text: 'Log in to your account.', image: loginShot, target: null },
      { text: 'Open the "Tenders" menu in the navigation bar.', image: navbarTendersShot, target: { x: 355, y: 44, from: { x: 355, y: 180 } } },
      { text: 'Click "Tenders" to see the full list of tenders.', image: navbarTendersShot, target: { x: 355, y: 96, from: { x: 700, y: 220 } } },
      { text: 'Use the search and filter options to narrow down tenders by state, department, or status.', image: tendersListShot, target: { x: 155, y: 353, from: { x: 500, y: 470 } } },
      { text: 'Click on any tender in the list to view its full details.', image: tendersListShot, target: { x: 720, y: 500, from: { x: 720, y: 700 } } },
    ],
  },
  {
    key: 'product-decode',
    label: 'How to Product Decode',
    icon: '🧩',
    steps: [
      { text: 'Click the tender\'s title to open it.', image: tendersListGemShot, target: { x: 260, y: 535, from: { x: 700, y: 700 } } },
      { text: 'The tender details page opens. Click "View Suggested Products" to see the products OpenProcure recommends for this tender.', image: tenderDetailsFullShot, target: { x: 1155, y: 275, from: { x: 800, y: 400 } } },
      { text: 'Suggested Products shows the matched product for the tender item, along with a relevancy match score (here, 92%) showing how closely it fits the requirement.', image: suggestedProductsShot, target: { x: 560, y: 509, from: { x: 900, y: 650 } } },
      { text: 'Click "Deviation" to compare the tender\'s required specifications against the offered product\'s actual specifications, line by line.', image: suggestedProductsShot, target: { x: 1105, y: 493, from: { x: 700, y: 650 } } },
      { text: 'The Deviation Analysis table shows a status for every specification: "Complied" means the product meets that requirement, "Not Complied" means it falls short, and "Not Specified" means the product data doesn\'t mention that spec at all.', image: deviationShot, target: null },
      { text: 'Click "Process Decode" to generate the pricing/decode sheet for this tender.', image: deviationShot, target: { x: 727, y: 236, from: { x: 400, y: 420 } } },
      { text: 'This opens the Process Decode sheet — a pricing worksheet pre-filled with the item, product code, and deviation remark. Add brand, packing, GST and rates here, then Save or Submit for Approval.', image: processDecodeShot, target: { x: 1290, y: 395, from: { x: 900, y: 550 } } },
    ],
  },
  {
    key: 'representation-letter',
    label: 'How to Generate Representation Letter',
    icon: '✉️',
    steps: [
      { text: 'Open the tender\'s Deviation Analysis page (via Suggested Products → Deviation, as shown in the Product Decode guide).', image: deviationPageShot, target: null },
      { text: 'Click "Generate Deviation Representation Letter".', image: deviationPageShot, target: { x: 356, y: 236, from: { x: 700, y: 420 } } },
      { text: 'If some rows are still "Not Specified", a confirmation prompt appears — click OK to generate the letter using only the "Not Complied" rows (Not Specified rows are skipped).', image: deviationPageShot, target: null },
      { text: 'The Deviation Representation Letter opens, pre-filled with a formal letter body and a table of every deviation: the tender requirement, what the product actually offers, the reasoning, and the representation text.', image: representationEditorShot, target: null },
      { text: 'Click "Download PDF" to save the finished letter as a PDF (or "Download DOCX" for an editable Word file).', image: representationPdfShot, target: { x: 1319, y: 147, from: { x: 950, y: 300 } } },
    ],
  },
  {
    key: 'tender-details',
    label: 'How to View Tender Details',
    icon: '📄',
    steps: [
      { text: 'Go to the "Tenders" section from the navigation bar.', image: navbarTendersShot, target: { x: 355, y: 44, from: { x: 355, y: 180 } } },
      { text: 'Find the tender you want using search or filters.', image: tendersListGemShot, target: { x: 155, y: 353, from: { x: 500, y: 470 } } },
      { text: 'Click on the tender\'s title to open it.', image: tendersListGemShot, target: { x: 260, y: 535, from: { x: 700, y: 700 } } },
      { text: 'Review the tender information: bid dates, offer validity, quantity, EMD amount, and organisation details.', image: tenderDetailsFullShot, target: null },
      { text: 'Expand the sections below — Corrigendum/Representation, Key Values, Consignee Details, Pre-Bid Details, Sample, and Technical Specifications — to see the tender\'s full documents and history.', image: tenderDetailsExpandedShot, target: null },
    ],
  },
];

const IMG_W = 1440;
const IMG_H = 900;

// Draws a curved orange arrow from `from` to just outside `target`, plus a
// pulsing ring exactly on the target field, on top of the screenshot below.
const PointerOverlay = ({ target }) => {
  if (!target) return null;
  const { x, y, from } = target;

  // Stop the arrow short of the ring so the arrowhead doesn't sit on top of it.
  const dx = x - from.x;
  const dy = y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const stopShort = 48;
  const endX = x - (dx / dist) * stopShort;
  const endY = y - (dy / dist) * stopShort;

  const midX = (from.x + endX) / 2 + (dy / dist) * 40;
  const midY = (from.y + endY) / 2 - (dx / dist) * 40;

  return (
    <svg
      viewBox={`0 0 ${IMG_W} ${IMG_H}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker
          id={`arrowhead-${x}-${y}`}
          markerWidth="10"
          markerHeight="10"
          refX="6"
          refY="5"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="#f97316" />
        </marker>
      </defs>

      {/* Pulsing highlight ring on the target field */}
      <circle cx={x} cy={y} r="30" fill="none" stroke="#f97316" strokeWidth="5" opacity="0.9">
        <animate attributeName="r" values="24;42;24" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r="10" fill="#f97316" opacity="0.95" />

      {/* Curved arrow pointing into the target */}
      <path
        d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${endX} ${endY}`}
        fill="none"
        stroke="#f97316"
        strokeWidth="7"
        strokeLinecap="round"
        markerEnd={`url(#arrowhead-${x}-${y})`}
      />
    </svg>
  );
};

const Tutorial = () => {
  const [activeTopic, setActiveTopic] = useState(TOPICS[0].key);
  const topic = TOPICS.find((t) => t.key === activeTopic);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1200px 500px at 10% -10%, #eaf1ff 0%, transparent 60%), linear-gradient(180deg, #f7f9fc 0%, #eef1f7 100%)',
        padding: '44px 32px 100px',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #1d4ed8, #4f46e5)',
              color: '#fff',
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 14,
              boxShadow: '0 4px 14px rgba(29,78,216,0.25)',
            }}
          >
            OpenProcure Guides
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: '#0f172a',
              marginBottom: 10,
              letterSpacing: '-0.025em',
            }}
          >
            Tutorial Center
          </h1>
          <p style={{ color: '#64748b', fontSize: 16, maxWidth: 620, lineHeight: 1.6 }}>
            Clear, visual, step-by-step walkthroughs to help every role get the most out of OpenProcure.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: 28,
            alignItems: 'start',
          }}
        >
          {/* Sidebar */}
          <nav
            style={{
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e8ecf3',
              boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
              padding: 14,
              position: 'sticky',
              top: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: '#94a3b8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '10px 12px 14px',
              }}
            >
              Topics
            </div>
            {TOPICS.map((t) => {
              const isActive = activeTopic === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTopic(t.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    textAlign: 'left',
                    width: '100%',
                    padding: '15px 16px',
                    borderRadius: 14,
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive
                      ? 'linear-gradient(90deg, #1d4ed8, #2f5fe0)'
                      : 'transparent',
                    color: isActive ? '#fff' : '#334155',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 14.5,
                    boxShadow: isActive ? '0 8px 20px rgba(29,78,216,0.28)' : 'none',
                    transition: 'all 0.16s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#f1f5f9';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      fontSize: 16,
                      flexShrink: 0,
                      background: isActive ? 'rgba(255,255,255,0.18)' : '#eef2f8',
                    }}
                  >
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e8ecf3',
              boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
              padding: '44px 48px',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 12px',
                borderRadius: 999,
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              <span>{topic.icon}</span> Guide
            </div>
            <h2
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: 40,
                letterSpacing: '-0.015em',
              }}
            >
              {topic.label}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
              {topic.steps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 24 }}>
                  {/* Step number rail */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1d4ed8, #4338ca)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 16,
                        flexShrink: 0,
                        boxShadow: '0 6px 16px rgba(29,78,216,0.3)',
                      }}
                    >
                      {idx + 1}
                    </div>
                    {idx < topic.steps.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          width: 2,
                          background: 'linear-gradient(180deg, #c7d2fe, #e2e8f0)',
                          marginTop: 8,
                        }}
                      />
                    )}
                  </div>

                  {/* Step content */}
                  <div style={{ flex: 1, paddingBottom: 6 }}>
                    <p
                      style={{
                        fontSize: 17,
                        fontWeight: 600,
                        color: '#1e293b',
                        marginBottom: 18,
                        lineHeight: 1.55,
                      }}
                    >
                      {step.text}
                    </p>

                    {step.image ? (
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          borderRadius: 16,
                          overflow: 'hidden',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 16px 40px rgba(15,23,42,0.12)',
                          background: '#0f172a',
                          lineHeight: 0,
                        }}
                      >
                        <img
                          src={step.image}
                          alt={step.text}
                          style={{ width: '100%', display: 'block' }}
                        />
                        <PointerOverlay target={step.target} />
                      </div>
                    ) : (
                      /* Screenshot placeholder — swap this block for a real <img> once available */
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '16 / 9',
                          borderRadius: 16,
                          border: '2px dashed #cbd5e1',
                          background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          color: '#94a3b8',
                        }}
                      >
                        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                          <rect x="3" y="5" width="18" height="14" rx="2.5" />
                          <circle cx="8.5" cy="10" r="1.5" />
                          <path d="M21 15l-5-5-9 9" />
                        </svg>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          Screenshot for this step will go here
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
