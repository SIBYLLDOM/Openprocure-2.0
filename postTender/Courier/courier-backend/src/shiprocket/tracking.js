import axios from "axios";
import { getShiprocketToken } from "./auth.js";

/* =====================================================
   TRACK SHIPMENT BY AWB CODE
===================================================== */
export const trackShipment = async (req, res) => {
    try {
        const token = await getShiprocketToken();
        const { awb_code } = req.params;

        if (!awb_code) {
            return res.status(400).json({
                message: "awb_code is required"
            });
        }

        const response = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb_code}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ TRACKING DATA FETCHED:", awb_code);
        return res.json(response.data);

    } catch (error) {
        console.error(
            "❌ TRACKING ERROR:",
            error.response?.data || error.message
        );

        return res.status(500).json(
            error.response?.data || { message: "Failed to fetch tracking data" }
        );
    }
};
