const pdfLib = require('pdf-parse');
const { callOllama, parseJsonResponse } = require('../utils/ollama');

exports.parsePdf = async (req, res) => {
    try {
        let pdf = pdfLib;
        // Handle variations in export (CommonJS vs ESM default)
        if (typeof pdf !== 'function') {
            if (pdf.default && typeof pdf.default === 'function') {
                pdf = pdf.default;
            } else {
                throw new Error(`pdf-parse export is not a function. It is a ${typeof pdf} with keys: ${Object.keys(pdf).join(', ')}`);
            }
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const data = await pdf(req.file.buffer);
        res.json({ text: data.text });
    } catch (error) {
        console.error('PDF Parse Error:', error);
        res.status(500).json({ error: 'Failed to parse PDF', details: error.message });
    }
};

exports.checkPreBid = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 50) {
            return res.status(400).json({ error: 'Document text is empty or too short to analyze' });
        }

        const systemPrompt = 'You are a tender compliance assistant. You read tender documents and find pre-bid meeting details. Return ONLY valid JSON, no markdown, no explanation.';
        const userPrompt = `Read the following tender document text and determine whether a Pre-Bid Meeting is mentioned.

Return a JSON object with exactly these keys:
- "mentioned": boolean — true if a pre-bid meeting is mentioned anywhere in the document
- "date": string — the pre-bid meeting date if found, else "N/A"
- "time": string — the pre-bid meeting time if found, else "N/A"
- "venue": string — the pre-bid meeting venue/location/link if found, else "N/A"

Document text (truncated):
${text.substring(0, 100000)}

Return ONLY the JSON object. No markdown, no explanation.`;

        const raw = await callOllama(systemPrompt, userPrompt);
        const parsed = parseJsonResponse(raw);

        res.json({
            mentioned: !!parsed.mentioned,
            date: parsed.date || 'N/A',
            time: parsed.time || 'N/A',
            venue: parsed.venue || 'N/A',
        });
    } catch (error) {
        console.error('checkPreBid Error:', error);
        res.status(500).json({ error: 'Failed to analyze document', details: error.message });
    }
};
