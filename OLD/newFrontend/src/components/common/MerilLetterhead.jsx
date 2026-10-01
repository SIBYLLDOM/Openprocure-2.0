import LetterheadLogo from '../../assets/img/endo-letterhead-logo.png';
import LetterheadSignature from '../../assets/img/endo-letterhead-signature.png';
import LetterheadFooterBand from '../../assets/img/endo-letterhead-footer.png';

/**
 * Header block — Meril logo top-right, with a Ref. No. / Date row underneath.
 * Sourced from Frontend/src/assets/data/endo_letter_head.html, which is the
 * canonical Endo letterhead design (also used server-side by docPrep.controller.js
 * for PDF/DOCX generation — keep both in sync if this changes).
 */
export function MerilLetterHeader({ refNo, date }) {
    return (
        <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <img src={LetterheadLogo} alt="Meril" style={{ height: '52px', width: 'auto', display: 'block' }} />
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: "'Cambria', 'Times New Roman', serif",
                    fontSize: '9pt',
                    color: '#1a1a1a',
                    marginTop: '14px',
                }}
            >
                <span>Ref. No.: <strong>{refNo}</strong></span>
                <span>Date: <strong>{date}</strong></span>
            </div>
        </div>
    );
}

/**
 * Signature block — Gelivi Kiran Kumar, Additional General Manager - Tender
 * Business. Same source file as the header/footer (see above).
 */
export function MerilLetterSignature() {
    return (
        <div style={{ marginTop: '4pt' }}>
            <img src={LetterheadSignature} alt="Signature" style={{ width: '1.6in', height: 'auto', display: 'block', margin: '4pt 0' }} />
            <p style={{ fontWeight: 'bold', fontSize: '11pt', margin: 0 }}>Gelivi Kiran Kumar</p>
            <p style={{ fontSize: '11pt', margin: 0 }}>Additional General Manager - Tender Business</p>
        </div>
    );
}

/**
 * Footer band — company name/address/CIN/contact details and the navy brand
 * bar, all baked into a single image asset (bleeds edge-to-edge beyond the
 * page's own margins), matching endo_letterhead_generator.html exactly.
 */
export function MerilLetterFooter() {
    return (
        <div style={{ marginTop: '0.4in', marginLeft: '-1in', marginRight: '-1in' }}>
            <img
                src={LetterheadFooterBand}
                alt="Meril Endo Surgery Private Limited"
                style={{ width: '100%', height: 'auto', display: 'block' }}
            />
        </div>
    );
}
