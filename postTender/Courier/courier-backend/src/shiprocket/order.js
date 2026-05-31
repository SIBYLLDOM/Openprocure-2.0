import axios from "axios";
import { getShiprocketToken } from "./auth.js";
import { saveCourierTracking, updateCourierTracking } from "../services/courierTracking.js";

/* =====================================================
   CREATE ORDER
===================================================== */
export const createOrder = async (req, res) => {
  try {
    const token = await getShiprocketToken();

    const {
      pickup_location,
      pickup_pincode,
      delivery_pincode,
      weight,
      length,
      breadth,
      height,
      courier_company_id,
      customer_name,
      customer_phone,
      customer_email,
      delivery_address,
      delivery_city,
      delivery_state,
      reference_no,
      reference_type
    } = req.body;

    const payload = {
      order_id: `${reference_type || 'ORDER'}-${Date.now()}`,
      order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      pickup_location: pickup_location || "Home",
      comment: `Reference: ${reference_no || 'N/A'}`,

      billing_customer_name: customer_name || "Test User",
      billing_last_name: "",
      billing_address: delivery_address || "Test Address",
      billing_address_2: "",
      billing_city: delivery_city || "Test City",
      billing_pincode: delivery_pincode,
      billing_state: delivery_state || "Test State",
      billing_country: "India",
      billing_email: customer_email || "test@example.com",
      billing_phone: customer_phone || "9999999999",

      shipping_is_billing: false,
      shipping_customer_name: customer_name || "Test User",
      shipping_last_name: "",
      shipping_address: delivery_address || "Test Address",
      shipping_address_2: "",
      shipping_city: delivery_city || "Test City",
      shipping_pincode: delivery_pincode,
      shipping_state: delivery_state || "Test State",
      shipping_country: "India",
      shipping_email: customer_email || "test@example.com",
      shipping_phone: customer_phone || "9999999999",

      order_items: [
        {
          name: "Sample Product",
          sku: "SKU001",
          units: 1,
          selling_price: 100,
          discount: 0,
          tax: 0,
          hsn: "",
        },
      ],
      payment_method: "Prepaid",
      sub_total: 100,
      length,
      breadth,
      height,
      weight,
    };

    console.log(`📦 CREATING SHIPROCKET ORDER FOR: ${reference_no}`);

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ ORDER CREATED:", response.data);

    // Save initial courier tracking to database
    await saveCourierTracking({
      contract_no: reference_no,
      order_id: response.data.order_id,
      shipment_id: response.data.shipment_id,
      pickup_status: 'pending'
    });

    return res.json(response.data);
  } catch (error) {
    console.error("❌ ORDER ERROR:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Order creation failed",
      error: error.response?.data || error.message
    });
  }
};

/* =====================================================
   GENERATE AWB
===================================================== */
export const generateAwb = async (req, res) => {
  try {
    const token = await getShiprocketToken();
    const { order_id, shipment_id, courier_id } = req.body;

    if (!courier_id) {
      return res.status(400).json({ message: "courier_id is required" });
    }

    if (!order_id && !shipment_id) {
      return res
        .status(400)
        .json({ message: "order_id or shipment_id required" });
    }

    const payload = shipment_id
      ? { shipment_id, courier_id }
      : { order_id, courier_id };

    const response = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log('✅ AWB GENERATED:', response.data);

    // ShipRocket returns AWB in nested structure: response.data.response.data
    const awbData = response.data.response?.data || response.data;

    // Update courier tracking in database with AWB info
    await updateCourierTracking(awbData.shipment_id, {
      awb_no: awbData.awb_code,
      courier_name: awbData.courier_name
    });

    return res.json({
      awb_code: awbData.awb_code,
      shipment_id: awbData.shipment_id,
      courier_name: awbData.courier_name,
      awb_assign_status: response.data.awb_assign_status
    });
  } catch (error) {
    console.error("❌ AWB ERROR:", error.response?.data || error.message);
    return res.status(500).json({ message: "AWB generation failed" });
  }
};

/* =====================================================
   GET ORDERS
===================================================== */
export const getReadyToShipOrders = async (req, res) => {
  try {
    const token = await getShiprocketToken();

    const response = await axios.get(
      "https://apiv2.shiprocket.in/v1/external/orders",
      {
        params: { per_page: 50 },
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return res.json({ orders: response.data.data || [] });
  } catch (error) {
    console.error("❌ GET ORDERS ERROR:", error.response?.data || error.message);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/* =====================================================
   GET ORDER STATUS/TRACKING
===================================================== */
export const getOrderStatus = async (req, res) => {
  try {
    const token = await getShiprocketToken();
    const { shipmentId } = req.params;

    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error("❌ TRACK ERROR:", error.response?.data || error.message);
    return res.status(500).json(
      error.response?.data || { message: "Tracking failed" }
    );
  }
};
