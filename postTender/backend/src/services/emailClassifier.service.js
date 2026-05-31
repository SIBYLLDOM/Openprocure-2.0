const OpenAI = require('openai');

class EmailClassifierService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * Classify email into predefined categories using GPT
     * @param {Object} emailData - Email data object
     * @returns {Promise<Object>} Classification result with category and confidence
     */
    async classifyEmail(emailData) {
        try {
            const prompt = this.buildClassificationPrompt(emailData);

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an email classification expert for a procurement management system. 
                        Classify emails into these categories:
                        - TenderWon: Notifications about winning tenders/bids
                        - Order: Order confirmations, purchase orders
                        - EMD: Earnest Money Deposit receipts/confirmations
                        - PBG: Performance Bank Guarantee documents
                        - NABL: NABL certificate documents
                        - LOA: Letter of Acceptance, Letter of Intent (LOI) or Award Letter
                        - DCC: Declaration of Conformity Certificate
                        - COA: Certificate of Analysis
            - Other: If none of the above matches of email
                        
                        Return ONLY a JSON object with: category, confidence (0-1), reasoning`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0].message.content);

            return {
                category: result.category || 'Other',
                confidence: result.confidence || 0,
                reasoning: result.reasoning || ''
            };

        } catch (error) {
            console.error('Error classifying email:', error);
            return {
                category: 'Other',
                confidence: 0,
                reasoning: 'Classification failed: ' + error.message
            };
        }
    }

    /**
     * Build classification prompt from email data
     * @param {Object} emailData - Email data
     * @returns {String} Formatted prompt
     */
    buildClassificationPrompt(emailData) {
        return `
Classify this email:

From: ${emailData.from_email}
Subject: ${emailData.subject}
Date: ${emailData.received_date}

Email Body:
${emailData.body_text.substring(0, 2000)}

${emailData.attachments.length > 0 ? `Attachments: ${emailData.attachments.map(a => a.filename).join(', ')}` : ''}

Return JSON with category, confidence, and reasoning.
        `.trim();
    }

    /**
     * Check if confidence is high enough for auto-processing
     * @param {Number} confidence - Confidence score
     * @returns {Boolean} True if confidence is high enough
     */
    isHighConfidence(confidence) {
        return confidence >= 0.8;
    }
}

module.exports = EmailClassifierService;
