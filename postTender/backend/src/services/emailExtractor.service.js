const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const Tesseract = require('tesseract.js');


class EmailExtractorService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * Extract structured data from email based on category
     * @param {Object} emailData - Email data
     * @param {String} category - Email category
     * @returns {Promise<Object>} Extracted data
     */
    async extractData(emailData, category) {
        try {
            // Extract text from attachments based on type
            let attachmentText = '';
            for (const attachment of emailData.attachments) {
                const ext = path.extname(attachment.filename).toLowerCase();
                let text = '';

                if (ext === '.pdf') {
                    text = await this.extractPdfText(attachment.file_path);
                } else if (ext === '.docx' || ext === '.doc') {
                    text = await this.extractWordText(attachment.file_path);
                } else if (ext === '.xlsx' || ext === '.xls') {
                    text = await this.extractExcelText(attachment.file_path);
                } else if (['.jpg', '.jpeg', '.png', '.bmp'].includes(ext)) {
                    text = await this.extractImageText(attachment.file_path);
                }

                if (text) {
                    attachmentText += `\n\nAttachment: ${attachment.filename}\n${text.substring(0, 10000)}`; // Limit text length per attachment
                }
            }

            const fullText = emailData.body_text + attachmentText;

            switch (category) {
                case 'TenderWon':
                    return await this.extractTenderWonData(fullText, emailData);
                // ... keep existing cases ...
                case 'Order':
                    return await this.extractOrderData(fullText, emailData);
                case 'EMD':
                    return await this.extractEMDData(fullText, emailData);
                case 'PBG':
                    return await this.extractPBGData(fullText, emailData);
                case 'NABL':
                    return await this.extractNABLData(fullText, emailData);
                case 'LOA':
                    return await this.extractLOAData(fullText, emailData);
                case 'DCC':
                    return await this.extractDCCData(fullText, emailData);
                case 'COA':
                    return await this.extractCOAData(fullText, emailData);
                default:
                    return {};
            }
        } catch (error) {
            console.error('Error extracting data:', error);
            return { error: error.message };
        }
    }

    /**
     * Extract PDF text content
     */
    async extractPdfText(filePath) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } catch (error) {
            console.error('Error extracting PDF text:', error);
            return '';
        }
    }

    /**
     * Extract Word document text
     */
    async extractWordText(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } catch (error) {
            console.error('Error extracting Word text:', error);
            return '';
        }
    }

    /**
     * Extract Excel sheet text
     */
    async extractExcelText(filePath) {
        try {
            const workbook = xlsx.readFile(filePath);
            let text = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                text += `Sheet: ${sheetName}\n` + xlsx.utils.sheet_to_csv(sheet) + '\n';
            });
            return text;
        } catch (error) {
            console.error('Error extracting Excel text:', error);
            return '';
        }
    }

    /**
     * Extract Text from Info Images (OCR)
     */
    async extractImageText(filePath) {
        try {
            const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
                logger: m => console.log(m) // Optional logger
            });
            return text;
        } catch (error) {
            console.error('Error extracting Image text:', error);
            return '';
        }
    }

    /**
     * Extract Tender Won data
     */
    async extractTenderWonData(text, emailData) {
        const prompt = `
Extract tender won information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "bid_no": "The official Tender ID or Bid Number (e.g. GEM/2024/B/1234567). DO NOT use 'Submission Number' or 'Application ID'. If multiple numbers exist, prioritize the Tender Reference Number.",
    "won_date": "Date won (YYYY-MM-DD)",
    "buying_mode": "Direct or Bid/RA",
    "buying_origin": "GEM or OPEN",
    "emd_amt": "EMD amount if mentioned"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract Order data
     */
    async extractOrderData(text, emailData) {
        const prompt = `
Extract order information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "bid_no": "Related bid number",
    "order_number": "Order/PO number",
    "order_date": "Order date (YYYY-MM-DD)",
    "order_value": "Total order value (number only)",
    "delivery_date": "Expected delivery date (YYYY-MM-DD)"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract EMD data
     */
    async extractEMDData(text, emailData) {
        const prompt = `
Extract EMD (Earnest Money Deposit) information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "bid_no": "The official Tender ID or Bid Number (e.g. GEM/2024/B/1234567). DO NOT use 'Submission Number'.",
    "emd_amt": "EMD amount (number only)",
    "submitted_date": "Date submitted (YYYY-MM-DD)",
    "bank_detail": "Bank name and details"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract PBG data
     */
    async extractPBGData(text, emailData) {
        const prompt = `
Extract PBG (Performance Bank Guarantee) information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "bid_no": "The official Tender ID or Bid Number (e.g. GEM/2024/B/1234567). DO NOT use 'Submission Number'.",
    "pbg_amount": "PBG amount (number only)",
    "issue_date": "Issue date (YYYY-MM-DD)",
    "expiry_date": "Expiry date (YYYY-MM-DD)",
    "bank_name": "Bank name",
    "reference_number": "BG reference number"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract NABL data
     */
    async extractNABLData(text, emailData) {
        const prompt = `
Extract NABL certificate information from this email and its attachments:

${text.substring(0, 5000)}

Extract and return JSON with these fields:
{
    "certificate_type": "NABL",
    "issue_date": "Issue date (YYYY-MM-DD)",
    "expiry_date": "Expiry date (YYYY-MM-DD)",
    "contract_no": "Related Contract Number / Order Number / Bid Number. Look for patterns like 'GEMC-...', 'No. ...', 'Ref: ...'. If multiple are found, prioritize GEM Contract Number."
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract LOA data
     */
    async extractLOAData(text, emailData) {
        const prompt = `
Extract LOA (Letter of Acceptance) information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "bid_no": "The official Tender ID or Bid Number (e.g. GEM/2024/B/1234567). DO NOT use 'Submission Number'.",
    "loa_number": "LOA number",
    "loa_date": "LOA date (YYYY-MM-DD)",
    "received_date": "Date received (YYYY-MM-DD)"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract DCC data
     */
    async extractDCCData(text, emailData) {
        const prompt = `
Extract DCC (Declaration of Conformity Certificate) information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "order_id": "Related order/contract number",
    "certificate_type": "DCC",
    "issue_date": "Issue date (YYYY-MM-DD)"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Extract COA data
     */
    async extractCOAData(text, emailData) {
        const prompt = `
Extract COA (Certificate of Analysis) information from this email:

${text.substring(0, 3000)}

Extract and return JSON with these fields:
{
    "contract_no": "Related Order No / Contract Number / Bid Number",
    "issue_date": "Issue date (YYYY-MM-DD)"
}
        `;

        return await this.callGPT(prompt);
    }

    /**
     * Call GPT for extraction
     */
    async callGPT(prompt) {
        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a data extraction expert. Extract structured data from emails and documents. Return ONLY valid JSON. If a field is not found, use null."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.2,
                response_format: { type: "json_object" }
            });

            return JSON.parse(completion.choices[0].message.content);
        } catch (error) {
            console.error('GPT extraction error:', error);
            return { error: error.message };
        }
    }
}

module.exports = EmailExtractorService;
