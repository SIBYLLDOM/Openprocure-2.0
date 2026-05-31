/**
 * POST /api/pricing/predict
 * Mock endpoint for pricing prediction
 */
const predictPrice = async (req, res) => {
    try {
        const { product, quantity } = req.body;
        console.log(`[Pricing Stub] Prediction requested for: ${product} (Qty: ${quantity})`);

        // Return dummy data to satisfy frontend
        res.json({
            success: true,
            low_price: 15000,
            high_price: 25000,
            confidence: 'Medium',
            basis: 'Historical Data (Mock)',
            competitors_analyzed: 5,
            top_competitors: [
                { seller_name: "Mock Seller A", average_bidding_price: 18000, inflation_rate_percent: 2.5, last_l1_price: 17500, least_quoted_price: 16000 },
                { seller_name: "Mock Seller B", average_bidding_price: 21000, inflation_rate_percent: 4.0, last_l1_price: 20000, least_quoted_price: 19500 }
            ]
        });
    } catch (err) {
        console.error('[Pricing Stub] Error:', err);
        res.status(500).json({ message: 'Pricing prediction failed' });
    }
};

module.exports = {
    predictPrice
};
