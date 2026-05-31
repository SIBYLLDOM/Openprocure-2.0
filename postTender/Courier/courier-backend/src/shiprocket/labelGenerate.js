import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   GENERATE SHIPPING LABEL
===================================================== */
export const generateLabel = async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const { shipment_id } = req.body;

        if (!shipment_id) {
            return res.status(400).json({
                message: "shipment_id is required"
            });
        }

        const response = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/courier/generate/label",
            {
                shipment_id: Array.isArray(shipment_id) ? shipment_id : [shipment_id]
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ LABEL GENERATED:", response.data);
        return res.json(response.data);

    } catch (error) {
        console.error(
            "❌ LABEL GENERATION ERROR:",
            error.response?.data || error.message
        );

        return res.status(500).json(
            error.response?.data || { message: "Label generation failed" }
        );
    }
};
