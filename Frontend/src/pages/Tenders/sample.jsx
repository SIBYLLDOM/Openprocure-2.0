import React, { useEffect, useState } from 'react';
import '../../assets/css/TenderDetails.css';

const Sample = () => {

  /* ---------------- UI STATES ---------------- */
  const [expandedSections, setExpandedSections] = useState({
    tenderDetails: true,
    keyValues: false,
    documents: false,
    technicalSpecs: false,
    requiredDocs: false
  });

  const [isInterested, setIsInterested] = useState(false);

  /* ---------------- DATA STATES ---------------- */
  const [details, setDetails] = useState(null);
  const [links, setLinks] = useState([]);

  // 🔥 Technical specs states (UPDATED)
  const [techSpecs, setTechSpecs] = useState([]); // ARRAY OF CATALOGUES
  const [loadingTechSpecs, setLoadingTechSpecs] = useState(false);

  /* ---------------- MAIN API (Tender JSON) ---------------- */
  useEffect(() => {
    fetch("http://localhost:5000/data")
      .then(res => res.json())
      .then(json => {

        const extracted = {
          bidEndDate: "N/A",
          bidOpeningDate: "N/A",
          bidOfferValidity: "N/A",
          estimatedBidValue: "N/A",
          ministry: "N/A",
          departmentOrg: "N/A",
          totalQty: "N/A",
          itemCategory: "N/A",
          documentRequired: "N/A",
          evaluationMethod: "N/A",
          emdAmount: "N/A",
          emdRequired: "No",
          advisoryBank: "N/A",
          epbgPercentage: "N/A",
          epbgDuration: "N/A"
        };

        json.pages?.forEach(page => {
          page.tables?.forEach(table => {
            table.forEach(([key, value]) => {
              if (!key || !value) return;
              const k = key.toLowerCase();

              if (k.includes("bid end date")) extracted.bidEndDate = value;
              else if (k.includes("bid opening")) extracted.bidOpeningDate = value;
              else if (k.includes("bid offer validity")) extracted.bidOfferValidity = value;
              else if (k.includes("estimated bid value")) extracted.estimatedBidValue = value;
              else if (k.includes("ministry/state name")) extracted.ministry = value;
              else if (k.includes("department name")) extracted.departmentOrg = value;
              else if (k.includes("organisation name")) {
                extracted.departmentOrg =
                  extracted.departmentOrg === "N/A"
                    ? value
                    : `${extracted.departmentOrg}, ${value}`;
              }
              else if (k.includes("total quantity")) extracted.totalQty = value;
              else if (k.includes("item category")) extracted.itemCategory = value;
              else if (k.includes("document required")) extracted.documentRequired = value;
              else if (k.includes("evaluation method")) extracted.evaluationMethod = value;
              else if (k.includes("emd amount")) extracted.emdAmount = value;
              else if (k.includes("advisory bank")) extracted.advisoryBank = value;
              else if (k.includes("epbg percentage")) extracted.epbgPercentage = value;
              else if (k.includes("duration of epbg")) extracted.epbgDuration = value;
            });
          });
        });

        extracted.emdRequired =
          extracted.emdAmount && extracted.emdAmount !== "0" && extracted.emdAmount !== "N/A"
            ? "Yes"
            : "No";

        setDetails(extracted);

        const uniqueLinks = [
          ...new Map(
            (json.links || [])
              .filter(l => l.uri)
              .map(l => [l.uri, l])
          ).values()
        ];

        setLinks(uniqueLinks);
      })
      .catch(console.error);
  }, []);

  /* ---------------- FETCH TECH SPECS (MULTI) ---------------- */
  const fetchTechSpecs = async () => {
    if (techSpecs.length > 0) return;

    const catalogueLinks = links.filter(l =>
      l.uri.includes('/showCatalogue/')
    );

    if (catalogueLinks.length === 0) return;

    try {
      setLoadingTechSpecs(true);

      const allCatalogues = [];

      for (const link of catalogueLinks) {
        const res = await fetch(
          `http://127.0.0.1:8000/scrape/catalogue?url=${encodeURIComponent(link.uri)}`
        );

        const json = await res.json();

        if (json.status === "success") {
          allCatalogues.push({
            title: json.title || "Technical Specifications",
            rows: json.data || []
          });
        }
      }

      setTechSpecs(allCatalogues);

    } catch (err) {
      console.error("Failed to fetch technical specifications", err);
    } finally {
      setLoadingTechSpecs(false);
    }
  };

  /* ---------------- HELPER: Calculate rowspan for merged cells ---------------- */
  const calculateRowSpans = (rows) => {
    const rowSpans = [];
    let currentCategory = null;
    let spanCount = 0;
    let startIndex = 0;

    rows.forEach((row, index) => {
      if (row.category !== currentCategory) {
        // Save the previous span
        if (currentCategory !== null) {
          for (let i = startIndex; i < index; i++) {
            rowSpans[i] = i === startIndex ? spanCount : 0;
          }
        }
        // Start new span
        currentCategory = row.category;
        startIndex = index;
        spanCount = 1;
      } else {
        spanCount++;
      }
    });

    // Handle the last group
    for (let i = startIndex; i < rows.length; i++) {
      rowSpans[i] = i === startIndex ? spanCount : 0;
    }

    return rowSpans;
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => {
      const updated = { ...prev, [section]: !prev[section] };

      if (section === "technicalSpecs" && !prev.technicalSpecs) {
        fetchTechSpecs();
      }

      return updated;
    });
  };

  if (!details) return <p>Loading...</p>;

  const tenderDocumentLinks = links.filter(
    l => !l.uri.includes('/showCatalogue/')
  );

  /* ---------------- UI ---------------- */
  return (
    <div className="tender-details-container">
      <div className="content-wrapper">

        {/* LEFT CONTENT */}
        <div className="left-content">

          {/* Tender Details */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('tenderDetails')}>
              <h2>Tender Details</h2>
              <span className={`arrow ${expandedSections.tenderDetails ? 'expanded' : ''}`}>^</span>
            </div>

            {expandedSections.tenderDetails && (
              <div className="accordion-content">
                <div className="details-grid-horizontal">
                  <div className="detail-item-left"><label>Bid End Date</label><p>{details.bidEndDate}</p></div>
                  <div className="detail-item-left"><label>Bid Opening Date</label><p>{details.bidOpeningDate}</p></div>
                  <div className="detail-item-left"><label>Bid Offer Validity</label><p>{details.bidOfferValidity}</p></div>
                  <div className="detail-item-left"><label>Total Quantity</label><p>{details.totalQty}</p></div>
                  <div className="detail-item-left"><label>Item Category</label><p>{details.itemCategory}</p></div>
                  <div className="detail-item-left"><label>Ministry</label><p>{details.ministry}</p></div>
                  <div className="detail-item-left">
                    <label>Estimated Bid Value</label>
                    <p>
                      {details.estimatedBidValue !== "N/A"
                        ? `₹ ${Number(details.estimatedBidValue).toLocaleString()}`
                        : "Refer Document"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Values */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('keyValues')}>
              <h2>Key Values *</h2>
              <span className={`arrow ${expandedSections.keyValues ? 'expanded' : ''}`}>^</span>
            </div>

            {expandedSections.keyValues && (
              <div className="accordion-content">
                <div className="key-values-row">
                  <div className="detail-item-left"><label>EMD Required</label><p>{details.emdRequired}</p></div>
                  <div className="detail-item-left"><label>Advisory Bank</label><p>{details.advisoryBank}</p></div>
                  <div className="detail-item-left"><label>ePBG Percentage (%)</label><p>{details.epbgPercentage}</p></div>
                  <div className="detail-item-left"><label>Duration of ePBG (Months)</label><p>{details.epbgDuration}</p></div>
                </div>
              </div>
            )}
          </div>

          {/* Technical Specifications */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('technicalSpecs')}>
              <h2>Technical Specifications</h2>
              <span className={`arrow ${expandedSections.technicalSpecs ? 'expanded' : ''}`}>^</span>
            </div>

            {expandedSections.technicalSpecs && (
              <div className="accordion-content">

                {loadingTechSpecs && (
                  <div className="loading-state">
                    <p>Loading Technical Specifications...</p>
                  </div>
                )}

                {!loadingTechSpecs && techSpecs.map((catalogue, cIdx) => {
                  const rowSpans = calculateRowSpans(catalogue.rows);

                  return (
                    <div key={cIdx} style={{ marginBottom: "30px" }}>
                      <p className="phead">{catalogue.title}</p>

                      <div className="tech-spec-table-wrapper">
                        <table className="tech-spec-table">
                          <thead>
                            <tr>
                              <th>Category</th>
                              <th>Specification</th>
                              <th>Allowed Values</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogue.rows.map((row, rIdx) => {
                              const rowSpan = rowSpans[rIdx];
                              
                              return (
                                <tr key={rIdx}>
                                  {/* Only render category cell if rowSpan > 0 (first cell in merged group) */}
                                  {rowSpan > 0 && (
                                    <td 
                                      rowSpan={rowSpan} 
                                      className="merged-cell"
                                    >
                                      {row.category}
                                    </td>
                                  )}
                                  <td>{row.specification}</td>
                                  <td>{row.allowed_values}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {!loadingTechSpecs && techSpecs.length === 0 && (
                  <p className="tech-spec-empty">No technical specifications available.</p>
                )}

              </div>
            )}
          </div>

          {/* Tender Documents */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('documents')}>
              <h2>Tender Document</h2>
              <span className={`arrow ${expandedSections.documents ? 'expanded' : ''}`}>^</span>
            </div>

            {expandedSections.documents && (
              <div className="accordion-content">
                <div className="documents-list">
                  {tenderDocumentLinks.length > 0 ? (
                    tenderDocumentLinks.map((link, i) => (
                      <div key={i} className="document-row">
                        
                        <a href={link.uri} target="_blank" rel="noopener noreferrer" className="btn-download">
                          Download
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="tech-spec-empty">No documents available.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Required Documents */}
          <div className="accordion-section">
            <div className="accordion-header" onClick={() => toggleSection('requiredDocs')}>
              <h2>Required Documents To Participate</h2>
              <span className={`arrow ${expandedSections.requiredDocs ? 'expanded' : ''}`}>^</span>
            </div>

            {expandedSections.requiredDocs && (
              <div className="accordion-content">
                <ul className="required-docs-list">
                  {details.documentRequired.split(',').map((doc, i) => (
                    <li key={i}>{doc.trim()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT SIDEBAR */}
        <div className="right-sidebar">
          <div className="features-panel">
            <h3>TENDER FEATURES</h3>
            <button className={`feature-btn ${isInterested ? 'active' : ''}`} onClick={() => setIsInterested(!isInterested)}>
              ♡ Interested
            </button>
            <button className="feature-btn">⏰ Set Reminder</button>
            <button className="feature-btn">⬇ Download NIT</button>
            <button className="feature-btn">📄 View BOQ</button>
            <button className="feature-btn">↗ Share</button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Sample;