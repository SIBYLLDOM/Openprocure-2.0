import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   CANCEL SHIPMENT BY AWB
===================================================== */
export const cancelShipment = async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const { awbs } = req.body;

        if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
            return res.status(400).json({
                message: "awbs array is required and must contain at least one AWB"
            });
        }

        const response = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/orders/cancel/shipment/awbs",
            { awbs },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ SHIPMENT CANCELED:", awbs);
        return res.json(response.data);

    } catch (error) {
        console.error(
            "❌ CANCEL SHIPMENT ERROR:",
            error.response?.data || error.message
        );

        return res.status(500).json(
            error.response?.data || { message: "Failed to cancel shipment" }
        );
    }
};
