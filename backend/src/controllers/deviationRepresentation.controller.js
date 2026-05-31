const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const { Ollama } = require('ollama');

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

        // 4. Construct GPT prompt
        const prompt = `Create a representation letter for the deviation table. I need the representation with a table type of columns:
- Specification
- Tender Requirement
- Product Offered
- Status
- Representation

Provide as JSON array. The representation should be positive, showing how our suggested product matches their requirements and will fit. Be professional and convincing.

Data asked in tender (deviation table):
${JSON.stringify(deviationTables, null, 2)}

The product I suggested with full specifications:
${JSON.stringify(productSpec, null, 2)}

Return ONLY a valid JSON array with objects containing these exact keys: specification, tender_requirement, product_offered, status, representation. Do not include any markdown formatting or code blocks, just the raw JSON array.`;

        // 5. Call Ollama API
        const ollama = new Ollama({
            host: process.env.OLLAMA_HOST || 'http://localhost:11434'
        });

        let generatedContent;
        try {
            const ollamaResponse = await ollama.chat({
                model: 'gpt-oss:20b-cloud',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional tender response writer. Generate positive, convincing representation letters that highlight how products meet tender requirements.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                options: {
                    temperature: 0.2,
                    num_predict: 8000
                }
            });

            generatedContent = ollamaResponse.message.content;
        } catch (ollamaError) {
            console.error('Ollama API Error:', ollamaError);
            return res.status(500).json({
                success: false,
                message: 'Failed to generate representation letter from Ollama',
                error: ollamaError.message
            });
        }

        // Parse the JSON response from Ollama
        let representationData;
        try {
            // Remove markdown code blocks if present
            const cleanedContent = generatedContent.replace(/```json\n?|\n?```/g, '').trim();
            representationData = JSON.parse(cleanedContent);
        } catch (parseError) {
            console.error('Failed to parse Ollama response:', generatedContent);
            return res.status(500).json({
                success: false,
                message: 'Failed to parse Ollama response as JSON',
                rawResponse: generatedContent
            });
        }

        // 6. Return generated representation data
        res.json({
            success: true,
            data: representationData,
            metadata: {
                tender_id: bidNumber,
                product_code: selectedProduct.product_code,
                product_name: productSpec.instrument_name || selectedProduct.title,
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

        res.json({
            success: true,
            data: {
                html_content: rows[0].representation_letter,
                representation_data: representationData,
                metadata: {
                    generated_at: rows[0].representation_generated_at
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

module.exports = {
    generateRepresentationLetter,
    saveRepresentationLetter,
    getRepresentationLetter
};
