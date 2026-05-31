import React from 'react';
import { FileText, Download, ExternalLink } from 'lucide-react';

const WorkspaceDocuments = ({ links = [] }) => {
    console.log('WorkspaceDocuments: Received links:', links);
    if (!links || links.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p>No documents found for this tender.</p>
            </div>
        );
    }

    // Filter out duplicate links based on URI
    const uniqueLinks = [
        ...new Map(links.filter(l => l.uri).map(l => [l.uri, l])).values()
    ];

    let resourceCounter = 1;

    const getDocumentLabel = (uri) => {
        if (uri.includes("/BoqDocument/") || uri.includes("/BoqLineItemsDocument/") || uri.includes("/BOQDocument/")) {
            return "BOQ Document";
        } else if (uri.includes("/downloadOmppdfile/")) {
            return "OMPPD";
        } else if (uri.includes("ATC") || uri.includes("atc")) {
            return "ATC";
        } else if (uri.includes("fulfilment.gem.gov.in/contract/")) {
            return "ATC"; // Categorized as ATC in reference logic
        } else if (uri.includes("shared_doc/gtc")) {
            return "Gem Contract";
        } else if (uri.includes("/catalog_data/") && uri.toLowerCase().endsWith('.pdf')) {
            return "Technical Catalog";
        } else {
            const label = `Resources ${resourceCounter}`;
            resourceCounter++;
            return label;
        }
    };

    // Reset counter for render
    resourceCounter = 1;

    return (
        <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: '#1f2937',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <FileText size={24} style={{ color: '#2563eb' }} />
                    Tender Documents
                </h2>
                <p style={{ color: '#6b7280', fontSize: '0.95rem', margin: 0 }}>
                    Access all official documents related to this tender.
                </p>
            </div>

            <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb'
            }}>
                {uniqueLinks.map((link, i) => {
                    // Reset counter if it's the first item (though map runs sequentially)
                    // Actually logic needs to run sequentially. 
                    // Note: map runs sequentially so relying on external counter is fine here 
                    // BUT React might re-render. Ideally we should pre-process.
                    // For now, let's just calc label. The issue is resourceCounter needs to increment only for "else" case.

                    return (
                        <DocumentRow key={i} link={link} index={i} />
                    );
                })}
            </div>
        </div>
    );
};

// Helper component to manage label logic cleanly? 
// No, improved approach: Pre-process links to assign labels
const DocumentRow = ({ link }) => {
    const getLabel = (uri) => {
        if (uri.includes("/BoqDocument/") || uri.includes("/BoqLineItemsDocument/") || uri.includes("/BOQDocument/")) return "BOQ Document";
        if (uri.includes("/downloadOmppdfile/")) return "OMPPD";
        if (uri.includes("ATC") || uri.includes("atc")) return "ATC";
        if (uri.includes("fulfilment.gem.gov.in/contract/")) return "ATC";
        if (uri.includes("shared_doc/gtc")) return "Gem Contract";
        if (uri.includes("/catalog_data/") && uri.toLowerCase().endsWith('.pdf')) return "Technical Catalog";
        return "Tender Resource"; // Fallback generic name if we can't maintain global counter easily in stateless
    };

    const label = link.text || getLabel(link.uri);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem',
            marginBottom: '0.75rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            transition: 'all 0.2s',
            ':hover': {
                borderColor: '#cbd5e1',
                background: '#f1f5f9'
            }
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                <div style={{
                    padding: '0.75rem',
                    background: '#dbeafe',
                    borderRadius: '8px',
                    color: '#1e40af'
                }}>
                    <FileText size={20} />
                </div>
                <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1f2937', margin: '0 0 0.25rem 0' }}>
                        {label}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                        {link.uri}
                    </p>
                </div>
            </div>

            <a
                href={link.uri}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: '#2563eb',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#1e40af'}
                onMouseLeave={(e) => e.target.style.background = '#2563eb'}
            >
                <Download size={16} />
                Download
            </a>
        </div>
    );
};

export default WorkspaceDocuments;
