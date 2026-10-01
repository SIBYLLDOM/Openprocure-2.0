const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { Ollama } = require('ollama');
const { DEFAULT_MODEL, FALLBACK_MODEL, isQuotaError } = require('../utils/ollama');
const pdfParse = require('pdf-parse');
const { getTenderDept } = require('../utils/tenderDept');

/**
 * Custom pdf-parse page renderer that prefixes each page's text with a
 * "===== PAGE N =====" marker, so the LLM can cite an exact page number
 * when quoting a tender clause instead of guessing.
 */
const renderPageWithMarker = (pageData) => {
    return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
        .then((textContent) => {
            let text = '';
            for (const item of textContent.items) {
                text += item.str + (item.hasEOL ? '\n' : ' ');
            }
            return `\n\n===== PAGE ${pageData.pageIndex + 1} =====\n\n${text}`;
        });
};

/**
 * Extracts text from the bid's tender document PDF (resolved via
 * gem_tender_docs.pdf_path) so it can be fed to the LLM as grounding
 * context, with page markers so clauses can be cited by page number.
 * Returns '' (never throws) if no local PDF is available yet — the
 * letter can still be generated from the deviation table alone.
 */
const getBidPdfText = async (bidNumber, maxChars = 40000) => {
    try {
        const [docRows] = await db.query(
            `SELECT pdf_path FROM gem_tender_docs WHERE bid_number = ? LIMIT 1`,
            [bidNumber]
        );
        const pdfPath = docRows[0]?.pdf_path;
        if (!pdfPath || !fs.existsSync(pdfPath)) return '';

        const buf = fs.readFileSync(pdfPath);
        const data = await pdfParse(buf, { pagerender: renderPageWithMarker });
        return data.text.slice(0, maxChars);
    } catch (e) {
        console.warn('[deviation-representation] Could not extract bid PDF text:', e.message);
        return '';
    }
};

/**
 * POST /api/tenders/:bidNumber/generate-representation
 * Generates AI-powered deviation representation letter using Ollama
 */
const generateRepresentationLetter = async (req, res) => {
    const { bidNumber } = req.params;

    try {
        // 1. Fetch deviation tables from tender_processing_results
        const [deviationRows] = await db.query(
            `SELECT deviation_tables FROM tender_processing_results WHERE bid_no = ?`,
            [bidNumber]
        );

        if (deviationRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No deviation data found for this tender'
            });
        }

        let deviationTables = deviationRows[0].deviation_tables;
        if (typeof deviationTables === 'string') {
            deviationTables = JSON.parse(deviationTables);
        }

        // 2. Fetch selected product from main_relevency OR use first suggested product
        const [productRows] = await db.query(
            `SELECT selected_product FROM main_relevency WHERE bid_number = ?`,
            [bidNumber]
        );

        let selectedProduct = null;

        // Try to get explicitly selected product first
        if (productRows.length > 0 && productRows[0].selected_product) {
            selectedProduct = productRows[0].selected_product;
            if (typeof selectedProduct === 'string') {
                selectedProduct = JSON.parse(selectedProduct);
            }
        }

        // If no selected product, use the first suggested product
        if (!selectedProduct) {
            const [suggestedRows] = await db.query(
                `SELECT suggested_products FROM tender_processing_results WHERE bid_no = ?`,
                [bidNumber]
            );

            if (suggestedRows.length > 0 && suggestedRows[0].suggested_products) {
                let suggestedProducts = suggestedRows[0].suggested_products;
                if (typeof suggestedProducts === 'string') {
                    suggestedProducts = JSON.parse(suggestedProducts);
                }

                if (Array.isArray(suggestedProducts) && suggestedProducts.length > 0) {
                    const firstProduct = suggestedProducts[0];
                    selectedProduct = {
                        product_code: firstProduct.suggested_product_code,
                        title: firstProduct.suggested_product_name,
                        category: firstProduct.item_category
                    };
                }
            }
        }

        if (!selectedProduct) {
            return res.status(404).json({
                success: false,
                message: 'No product found for this tender. Please ensure there are suggested products available.'
            });
        }

        // 2b. Filter deviation rows to only "Not Complied", preserving original serial
        // numbers and which tender item (item_1, item_2, ...) each row came from — a
        // representation can cover many items at once (see the `items=` query param
        // on the editor page), so the letter's "Item Code" column needs this tag.
        const notCompliedRows = [];
        let globalSno = 0;
        Object.entries(deviationTables).forEach(([itemKey, rows]) => {
            const rowArray = Array.isArray(rows) ? rows : Object.values(rows);
            rowArray.forEach(row => {
                globalSno++;
                if (row.status === 'Not Complied' || row.status === 'Deviation') {
                    notCompliedRows.push({ ...row, sno: globalSno, item_key: itemKey });
                }
            });
        });

        if (notCompliedRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No "Not Complied" rows found — all specifications are complied. Nothing to represent.'
            });
        }

        // 3. Load product specifications from products.json
        const productsPath = path.join(__dirname, '../asset/products.json');
        const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

        // Find matching product by product_code
        const productSpec = productsData.find(p => p.product_code === selectedProduct.product_code);

        if (!productSpec) {
            return res.status(404).json({
                success: false,
                message: `Product specification not found for code: ${selectedProduct.product_code}`
            });
        }
        // Resolve the correct product name (selected product title takes priority over catalogue instrument_name)
        const resolvedProductName = selectedProduct.title || selectedProduct.suggested_product_name || productSpec.instrument_name || productSpec.product_name || 'Our Product';

        // 3b. Pull the actual bid tender document text (if available) so the LLM can
        // ground its reasoning/justification in the real tender clauses, not just the
        // structured deviation rows.
        const bidPdfText = await getBidPdfText(bidNumber);
        const bidDocSection = bidPdfText
            ? `\nActual tender bid document text (ground your reasoning in this — reference exact tender clauses where possible):\n"""\n${bidPdfText}\n"""\n`
            : '';

        // 4. Construct GPT prompt
        const prompt = `Create a representation letter for the deviation table. I need the representation with a table type of columns:
- Specification
- Tender Requirement
- Product Offered
- Reason
- Justification
- Representation

Provide as JSON array. The representation should be positive, showing how our suggested product matches their requirements and will fit. Be professional and convincing.

Our Product Name: ${resolvedProductName}
Our Product Code: ${selectedProduct.product_code}

Deviation rows that require representation (Not Complied only):
${JSON.stringify(notCompliedRows, null, 2)}

The product I suggested with full specifications:
${JSON.stringify({ ...productSpec, _resolved_product_name: resolvedProductName }, null, 2)}
${bidDocSection}
IMPORTANT: Throughout the representation text, always refer to the product as "${resolvedProductName}" (not any other name from the specs). For the "product_offered" column, copy the value exactly as given in each row's own "product_offered" field from the deviation rows above — do not replace it with the product name.

For each row, build "reason", "justification" and "representation" around these four points, in this order:
1. Where the requirement appears in the tender document — cite it as "Page X, Point/Clause Y" using the "===== PAGE N =====" markers in the bid document text above to find the exact page, and quote or closely paraphrase the exact wording of the clause. If the bid document text isn't provided above or the clause can't be located in it, skip the citation rather than inventing a page number.
2. What is wrong with that requirement as written — based on the complete product specification and market context, explain why it is overly restrictive, non-standard, or unfairly narrows competition to a single make/model.
3. What we offer instead — the specific capability of "${resolvedProductName}" that addresses the underlying need.
4. The concrete advantage the customer/tender-issuing authority gains by accepting this — be specific (performance, compliance, cost, functional equivalence or superiority), not generic.

Split that four-point narrative across the three fields like this:
- "reason": points 1 and 2 — the clause citation and what's wrong with it.
- "justification": points 3 and 4 — what we offer and the advantage to the customer.
- "representation": all four points woven into one polished, professional paragraph for the letter body (connected prose, not a bullet list).

Return ONLY a valid JSON array with objects containing these exact keys: specification, tender_requirement, product_offered, reason, justification, representation. Do not include any markdown formatting or code blocks, just the raw JSON array.`;

        // 5. Call Ollama API
        const ollama = new Ollama({
            host: process.env.OLLAMA_HOST || 'https://api.openprocure.ai'
        });

        const messages = [
            {
                role: 'system',
                content: 'You are a professional tender response writer. Generate positive, convincing representation letters that highlight how products meet tender requirements.'
            },
            { role: 'user', content: prompt }
        ];
        const options = { temperature: 0.2, num_predict: 12000 };

        let generatedContent;
        try {
            const ollamaResponse = await ollama.chat({ model: DEFAULT_MODEL, messages, options });
            generatedContent = ollamaResponse.message.content;
        } catch (ollamaError) {
            // The cloud model is metered per account. When the quota runs out
            // fall back to a locally installed model rather than failing the
            // whole request — the letter is a draft the user edits anyway.
            if (isQuotaError(ollamaError) && DEFAULT_MODEL !== FALLBACK_MODEL) {
                console.warn(`[representation] ${DEFAULT_MODEL} quota exhausted — retrying on ${FALLBACK_MODEL}`);
                try {
                    const retry = await ollama.chat({ model: FALLBACK_MODEL, messages, options });
                    generatedContent = retry.message.content;
                } catch (fallbackError) {
                    console.error('Ollama fallback failed:', fallbackError);
                    return res.status(503).json({
                        success: false,
                        message: `AI generation is unavailable: the ${DEFAULT_MODEL} quota is exhausted and the local fallback (${FALLBACK_MODEL}) also failed.`,
                        error: fallbackError.message,
                    });
                }
            } else {
                console.error('Ollama API Error:', ollamaError);
                return res.status(503).json({
                    success: false,
                    message: isQuotaError(ollamaError)
                        ? 'AI generation is unavailable: the Ollama usage limit has been reached.'
                        : 'Failed to generate the representation letter.',
                    error: ollamaError.message,
                });
            }
        }

        // Parse the JSON response from Ollama
        let representationData;
        try {
            // Strip markdown code fences (```json ... ``` or ``` ... ```)
            let cleanedContent = generatedContent.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

            // Try direct parse first
            try {
                representationData = JSON.parse(cleanedContent);
            } catch {
                // LLM often wraps the array in prose — extract the first [...] block
                const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
                if (arrayMatch) {
                    representationData = JSON.parse(arrayMatch[0]);
                } else {
                    // Last resort: try extracting a {...} object and wrap it
                    const objMatch = cleanedContent.match(/\{[\s\S]*\}/);
                    if (objMatch) {
                        representationData = [JSON.parse(objMatch[0])];
                    } else {
                        throw new Error('No JSON structure found in response');
                    }
                }
            }
        } catch (parseError) {
            console.error('Failed to parse Ollama response:', generatedContent);
            return res.status(500).json({
                success: false,
                message: 'Failed to parse Ollama response as JSON',
                rawResponse: generatedContent
            });
        }

        // Re-attach original serial numbers, real product_offered, and status by
        // position (AI may not preserve sno, must not be trusted to invent
        // product_offered, and is no longer asked for status at all — the letter
        // itself doesn't display it, but the row still needs it internally since
        // the frontend filters saved/loaded rows down to Not Complied / Deviation)
        representationData = representationData.map((row, i) => ({
            ...row,
            product_offered: notCompliedRows[i]?.product_offered || resolvedProductName,
            status: notCompliedRows[i]?.status,
            sno: notCompliedRows[i]?.sno ?? (i + 1),
            item_key: notCompliedRows[i]?.item_key
        }));

        // 6. Return generated representation data
        const dept = await getTenderDept(bidNumber);
        res.json({
            success: true,
            data: representationData,
            metadata: {
                tender_id: bidNumber,
                product_code: selectedProduct.product_code,
                product_name: selectedProduct.title || selectedProduct.suggested_product_name || productSpec.instrument_name || productSpec.product_name,
                dept,
                generated_at: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error('Error generating representation letter:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to generate representation letter',
            error: err.message
        });
    }
};

/**
 * POST /api/tenders/:bidNumber/save-representation
 * Saves representation letter to database
 */
const saveRepresentationLetter = async (req, res) => {
    const { bidNumber } = req.params;
    const { html_content, representation_data, metadata } = req.body;

    try {
        // Save to tender_processing_results table
        await db.query(
            `UPDATE tender_processing_results 
             SET representation_letter = ?, 
                 representation_data = ?,
                 representation_generated_at = NOW()
             WHERE bid_no = ?`,
            [html_content, JSON.stringify(representation_data), bidNumber]
        );

        res.json({
            success: true,
            message: 'Representation letter saved successfully'
        });

    } catch (err) {
        console.error('Error saving representation letter:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to save representation letter',
            error: err.message
        });
    }
};

/**
 * GET /api/tenders/:bidNumber/get-representation
 * Retrieves saved representation letter from database
 */
const getRepresentationLetter = async (req, res) => {
    const { bidNumber } = req.params;

    try {
        const [rows] = await db.query(
            `SELECT representation_letter, representation_data, representation_generated_at 
             FROM tender_processing_results 
             WHERE bid_no = ?`,
            [bidNumber]
        );

        if (rows.length === 0 || !rows[0].representation_letter) {
            return res.json({
                success: false,
                message: 'No saved representation found'
            });
        }

        let representationData = rows[0].representation_data;
        if (typeof representationData === 'string') {
            representationData = JSON.parse(representationData);
        }

        const dept = await getTenderDept(bidNumber);
        res.json({
            success: true,
            data: {
                html_content: rows[0].representation_letter,
                representation_data: representationData,
                metadata: {
                    generated_at: rows[0].representation_generated_at,
                    dept
                }
            }
        });

    } catch (err) {
        console.error('Error retrieving representation letter:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve representation letter',
            error: err.message
        });
    }
};

/**
 * GET /api/tenders/:bidNumber/prebid-team
 * Returns the FLSP and Zone Head emails already assigned to this tender's pre-bid meeting
 */
const getPrebidTeam = async (req, res) => {
    const { bidNumber } = req.params;
    const cleanBid = bidNumber.replace(/[\/\\]/g, '_');
    try {
        const [rows] = await db.query(
            `SELECT flsp, zone_head FROM prebid_meeting WHERE bid_no = ?`,
            [cleanBid]
        );
        if (rows.length === 0) {
            return res.json({ success: true, flsp: [], zoneHead: [] });
        }
        const toEmailArray = (str) =>
            (str || '').split(',').map(e => e.trim()).filter(Boolean);

        res.json({
            success: true,
            flsp: toEmailArray(rows[0].flsp),
            zoneHead: toEmailArray(rows[0].zone_head),
        });
    } catch (err) {
        console.error('Error fetching prebid team:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch pre-bid team', error: err.message });
    }
};

/**
 * POST /api/tenders/:bidNumber/share-deviation
 * Emails the deviation summary to selected FLSP / Zonal Manager recipients
 */
const shareDeviation = async (req, res) => {
    const { bidNumber } = req.params;
    const { recipients, cc, message } = req.body;

    if (!recipients || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No recipients provided.' });
    }

    try {
        // Fetch deviation tables
        const [deviationRows] = await db.query(
            `SELECT deviation_tables, suggested_products FROM tender_processing_results WHERE bid_no = ?`,
            [bidNumber]
        );
        if (deviationRows.length === 0) {
            return res.status(404).json({ success: false, message: 'No deviation data found for this tender.' });
        }

        let deviationTables = deviationRows[0].deviation_tables;
        if (typeof deviationTables === 'string') deviationTables = JSON.parse(deviationTables);

        let productName = '';
        let suggestedProducts = deviationRows[0].suggested_products;
        if (suggestedProducts) {
            if (typeof suggestedProducts === 'string') suggestedProducts = JSON.parse(suggestedProducts);
            if (Array.isArray(suggestedProducts) && suggestedProducts.length > 0) {
                productName = suggestedProducts[0].suggested_product_name || '';
            }
        }

        // Build rows for the email table
        const allRows = [];
        let globalSno = 0;
        Object.entries(deviationTables).forEach(([itemKey, rows]) => {
            const rowArray = Array.isArray(rows) ? rows : Object.values(rows);
            rowArray.forEach(row => {
                globalSno++;
                allRows.push({ sno: globalSno, item: itemKey, ...row });
            });
        });

        const statusColor = (status) => {
            if (status === 'Complied') return { bg: '#d1fae5', color: '#065f46' };
            if (status === 'Not Complied' || status === 'Deviation') return { bg: '#fee2e2', color: '#dc2626' };
            if (status === 'Not Applicable') return { bg: '#e5e7eb', color: '#374151' };
            return { bg: '#fef3c7', color: '#92400e' }; // Not Specified
        };

        const tableRows = allRows.map(row => {
            const sc = statusColor(row.status);
            return `
                <tr>
                    <td style="padding:8px;border:1px solid #dde4f0;text-align:center;color:#6b7280;font-size:12px;">${row.sno}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;font-weight:600;">${row.specification || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;">${row.tender_requirement || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;">${row.product_offered || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;text-align:center;">
                        <span style="padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color};">${row.status || '-'}</span>
                    </td>
                    <td style="padding:8px;border:1px solid #dde4f0;color:#555;font-size:12px;">${row.reason || '-'}</td>
                </tr>`;
        }).join('');

        const appUrl = (process.env.APP_URL || 'https://openprocure.ai').replace(/\/$/, '');
        const tenderLink = `${appUrl}/tenders/tenderdetails/${bidNumber.replace(/\//g, '_')}`;
        // The recipient (typically a Zonal Manager) reviews and signs off tender
        // items from their Approvals page — surface that link prominently here
        // too, same as the automated approval-request emails do, so sharing a
        // deviation table doubles as a nudge to go check anything pending there.
        const approvalsLink = `${appUrl}/Admin/approvals`;

        const htmlBody = `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:900px;">
                <div style="padding:20px 24px;">
                    <p style="margin:0 0 12px;">Dear Team,</p>
                    <p style="margin:0 0 12px;">For this tender <strong>${bidNumber}</strong>, we are quoting <strong>${productName || 'our product'}</strong>. I have shared the deviation also, please check.</p>
                    ${message ? `<p style="margin:0 0 12px;">${message}</p>` : ''}
                    <p style="margin:0 0 20px;">Also, I have attached the tender documents. If more info required, click here: <a href="${tenderLink}" style="color:#084f9a;">${tenderLink}</a></p>
                </div>
                <div style="padding:0 24px 20px;overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="background:#084f9a;color:#fff;">
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;min-width:36px;">#</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Specification</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Tender Requirement</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Product Offered</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;min-width:100px;">Status</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Reason</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                <div style="padding:4px 24px 24px;">
                    <a href="${approvalsLink}" style="display:inline-block;background:#084f9a;color:#fff;text-decoration:none;
                          padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">
                        Open Approvals Page
                    </a>
                    <p style="margin:10px 0 0;color:#94a3b8;font-size:12px;">
                        Use this to review anything pending your sign-off for this tender.
                    </p>
                </div>
            </div>`;

        const { sendMail } = require('../utils/mailer');
        const result = await sendMail({
            to: recipients,
            cc: cc && cc.length > 0 ? cc : undefined,
            subject: `Deviation Analysis Shared — Tender ${bidNumber}`,
            html: htmlBody,
        });
        if (!result.ok) {
            return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
        }

        res.json({ success: true, message: `Deviation shared with ${recipients.length} recipient(s).` });

    } catch (err) {
        console.error('Error sharing deviation:', err);
        res.status(500).json({ success: false, message: 'Failed to share deviation.', error: err.message });
    }
};

/**
 * POST /api/tenders/:bidNumber/share-suggestions
 * Emails the suggested products table to selected FLSP / Zonal Manager recipients
 */
const shareSuggestedProducts = async (req, res) => {
    const { bidNumber } = req.params;
    const { recipients, cc, message } = req.body;

    if (!recipients || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No recipients provided.' });
    }

    try {
        const [rows] = await db.query(
            `SELECT suggested_products FROM tender_processing_results WHERE bid_no = ?`,
            [bidNumber]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No suggested products found for this tender.' });
        }

        let suggestedProducts = rows[0].suggested_products;
        if (typeof suggestedProducts === 'string') suggestedProducts = JSON.parse(suggestedProducts);
        if (!Array.isArray(suggestedProducts)) suggestedProducts = [];

        const tableRows = suggestedProducts.map((p, idx) => `
                <tr>
                    <td style="padding:8px;border:1px solid #dde4f0;text-align:center;color:#6b7280;font-size:12px;">${idx + 1}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;font-weight:600;">${p.item_category || p.tender_item_name || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;">${p.tender_item_name || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;font-weight:600;">${p.product_name || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;text-align:center;">${p.product_code || '-'}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;text-align:center;">
                        <span style="padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46;">${Math.round((p.relevancy_score || 0) * 100)}%</span>
                    </td>
                </tr>`).join('');

        const tenderLink = `https://openprocure.ai/tenders/tenderdetails/${bidNumber.replace(/\//g, '_')}`;

        const htmlBody = `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:900px;">
                <div style="padding:20px 24px;">
                    <p style="margin:0 0 12px;">Dear Team,</p>
                    <p style="margin:0 0 12px;">For this tender <strong>${bidNumber}</strong>, please find the suggested products below.</p>
                    ${message ? `<p style="margin:0 0 12px;">${message}</p>` : ''}
                    <p style="margin:0 0 20px;">If more info is required, click here: <a href="${tenderLink}" style="color:#084f9a;">${tenderLink}</a></p>
                </div>
                <div style="padding:0 24px 20px;overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <thead>
                            <tr style="background:#084f9a;color:#fff;">
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;min-width:36px;">#</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Item Category</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Tender Product</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;text-align:left;">Product Name</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;">Product Code</th>
                                <th style="padding:10px 8px;border:1px solid #1e6ec8;min-width:100px;">Relevancy</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>`;

        const { sendMail } = require('../utils/mailer');
        const result = await sendMail({
            to: recipients,
            cc: cc && cc.length > 0 ? cc : undefined,
            subject: `Suggested Products Shared — Tender ${bidNumber}`,
            html: htmlBody,
        });
        if (!result.ok) {
            return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
        }

        res.json({ success: true, message: `Suggested products shared with ${recipients.length} recipient(s).` });

    } catch (err) {
        console.error('Error sharing suggested products:', err);
        res.status(500).json({ success: false, message: 'Failed to share suggested products.', error: err.message });
    }
};

/**
 * POST /api/tenders/:bidNumber/share-tender
 * Emails a summary of the tender's key details (GEM or Open source) to
 * selected FLSP / Zonal Manager recipients
 */
const shareTenderDetails = async (req, res) => {
    const { bidNumber } = req.params;
    const { recipients, cc, message } = req.body;

    if (!recipients || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'No recipients provided.' });
    }

    try {
        const [gemRows] = await db.query(
            `SELECT bid_number, items, department, start_date, end_date, emd_amount, bid_value, state
             FROM gem_tenders WHERE bid_number = ?`,
            [bidNumber]
        );

        let fields;
        if (gemRows.length > 0) {
            const t = gemRows[0];
            fields = [
                ['Bid Number', t.bid_number],
                ['Items', t.items || '-'],
                ['Department', t.department || '-'],
                ['State', t.state || '-'],
                ['Start Date', t.start_date || '-'],
                ['End Date', t.end_date || '-'],
                ['EMD Amount', t.emd_amount || '-'],
                ['Bid Value', t.bid_value || '-'],
            ];
        } else {
            const openBidNumber = bidNumber.replace(/\//g, '_');
            const [openRows] = await db.query(
                `SELECT tender_id, tender_title, tender_refno, organisation_name, organisation_chain,
                        e_published_date, closing_date, opening_date, state, tender_site_link, tender_page_link
                 FROM open_tender_details WHERE tender_id = ?`,
                [openBidNumber]
            );
            if (openRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Tender not found.' });
            }
            const t = openRows[0];
            fields = [
                ['Tender ID', t.tender_id],
                ['Ref No', t.tender_refno || '-'],
                ['Title', t.tender_title || '-'],
                ['Organisation', t.organisation_chain || t.organisation_name || '-'],
                ['State', t.state || '-'],
                ['Published Date', t.e_published_date || '-'],
                ['Closing Date', t.closing_date || '-'],
                ['Opening Date', t.opening_date || '-'],
                ['Tender Site Link', t.tender_site_link || t.tender_page_link || '-'],
            ];
        }

        const tenderLink = `https://openprocure.ai/tenders/tenderdetails/${bidNumber.replace(/\//g, '_')}`;

        const tableRows = fields.map(([label, value]) => `
                <tr>
                    <td style="padding:8px;border:1px solid #dde4f0;font-weight:600;color:#374151;width:180px;">${label}</td>
                    <td style="padding:8px;border:1px solid #dde4f0;">${value}</td>
                </tr>`).join('');

        const htmlBody = `
            <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:700px;">
                <div style="padding:20px 24px;">
                    <p style="margin:0 0 12px;">Dear Team,</p>
                    <p style="margin:0 0 12px;">Sharing details for tender <strong>${bidNumber}</strong>.</p>
                    ${message ? `<p style="margin:0 0 12px;">${message}</p>` : ''}
                    <p style="margin:0 0 20px;">For full details, click here: <a href="${tenderLink}" style="color:#084f9a;">${tenderLink}</a></p>
                </div>
                <div style="padding:0 24px 20px;overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>`;

        const { sendMail } = require('../utils/mailer');
        const result = await sendMail({
            to: recipients,
            cc: cc && cc.length > 0 ? cc : undefined,
            subject: `Tender Shared — ${bidNumber}`,
            html: htmlBody,
        });
        if (!result.ok) {
            return res.status(502).json({ success: false, message: result.error || 'Failed to send email' });
        }

        res.json({ success: true, message: `Tender shared with ${recipients.length} recipient(s).` });

    } catch (err) {
        console.error('Error sharing tender:', err);
        res.status(500).json({ success: false, message: 'Failed to share tender.', error: err.message });
    }
};

module.exports = {
    generateRepresentationLetter,
    saveRepresentationLetter,
    getRepresentationLetter,
    getPrebidTeam,
    shareDeviation,
    shareSuggestedProducts,
    shareTenderDetails,
};
