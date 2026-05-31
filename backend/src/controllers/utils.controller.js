const pdfLib = require('pdf-parse');

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
