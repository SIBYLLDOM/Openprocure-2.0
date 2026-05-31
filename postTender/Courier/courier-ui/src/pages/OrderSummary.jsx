import { useLocation } from "react-router-dom";
import { useState } from "react";
import api from "../api/api";
import "../assets/css/OrderSummary.css";

export default function OrderSummary() {
  const { state } = useLocation();

  if (!state || !state.shipment || !state.courier) {
    return <p className="center-text">No order data available</p>;
  }

  const { shipment, courier } = state;

  const [loading, setLoading] = useState(false);
  const [shipmentId, setShipmentId] = useState(null);
  const [awb, setAwb] = useState(null);
  const [awbLoading, setAwbLoading] = useState(false);
  const [orderStatus, setOrderStatus] = useState("");
  const [error, setError] = useState("");

  /* ================= CREATE ORDER ================= */
  const createOrder = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/order/create", {
        pickup_pincode: shipment.pickup_pincode,
        delivery_pincode: shipment.delivery_pincode,
        weight: shipment.weight,
        length: shipment.length,
        breadth: shipment.breadth,
        height: shipment.height,
        courier_company_id: courier.courier_company_id
      });

      setShipmentId(res.data.shipment_id);
    } catch (err) {
      setError("Order creation failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= GENERATE AWB ================= */
  const generateAwb = async () => {
    setAwbLoading(true);
    setError("");

    try {
      const res = await api.post("/order/generate-awb", {
        shipment_id: shipmentId,
        courier_id: courier.courier_company_id
      });

      setAwb(res.data.awb_code);

      // 🔥 Fetch live status after AWB
      setTimeout(fetchOrderStatus, 2000);

    } catch (err) {
      setError("AWB generation failed");
    } finally {
      setAwbLoading(false);
    }
  };

  /* ================= FETCH ORDER STATUS ================= */
  const fetchOrderStatus = async () => {
    try {
      const res = await api.get(`/order/status/${shipmentId}`);
      setOrderStatus(res.data.status);
    } catch (err) {
      console.error("Failed to fetch order status");
    }
  };

  return (
    <div className="container-main">
      <div className="page-header">
        <h2>Order Confirmation & Processing</h2>
      </div>

      <div className="summary-grid">
        {/* ================= COURIER DETAILS ================= */}
        <div className="summary-card">
          <h3>Delivery Partner</h3>
          <div className="summary-item">
            <strong>Partner:</strong> <span>{courier.courier_name}</span>
          </div>
          <div className="summary-item">
            <strong>Service:</strong> <span>{courier.is_surface ? "Surface" : "Air"}</span>
          </div>
          <div className="summary-item">
            <strong>Rate:</strong> <span className="price-tag">₹{courier.rate}</span>
          </div>
          <div className="summary-item">
            <strong>Estimated:</strong> <span>{courier.estimated_delivery_days} days</span>
          </div>
        </div>

        {/* ================= PACKAGE DETAILS ================= */}
        <div className="summary-card">
          <h3>Shipment Details</h3>
          <div className="summary-item">
            <strong>Weight:</strong> <span>{shipment.weight} kg</span>
          </div>
          <div className="summary-item">
            <strong>Dimensions:</strong> <span>{shipment.length}×{shipment.breadth}×{shipment.height} cm</span>
          </div>
          <div className="summary-item">
            <strong>Pickup Pin:</strong> <span>{shipment.pickup_pincode}</span>
          </div>
          <div className="summary-item">
            <strong>Delivery Pin:</strong> <span>{shipment.delivery_pincode}</span>
          </div>
        </div>
      </div>

      <div className="confirmation-card">
        {/* ================= CREATE ORDER ================= */}
        {!shipmentId && (
          <div className="action-section">
            <p className="text-muted">Review your shipment details above before confirming.</p>
            <button
              className="confirm-action-btn"
              onClick={createOrder}
              disabled={loading}
            >
              {loading ? "Processing Order..." : "Confirm & Book Shipment"}
            </button>
          </div>
        )}

        {/* ================= SHIPMENT CREATED ================= */}
        {shipmentId && (
          <div className="status-tracker">
            <h4><span className="bullet"></span> Shipment Information</h4>
            <div className="status-item">
              <strong>Shipment ID:</strong> <span>{shipmentId}</span>
            </div>
            <div className="status-item">
              <strong>Status:</strong> <span className="badge ready">Order Created</span>
            </div>

            {/* ================= GENERATE AWB ================= */}
            {!awb && (
              <button
                className="confirm-action-btn"
                onClick={generateAwb}
                disabled={awbLoading}
              >
                {awbLoading ? "Generating Routing Code..." : "Generate AWB (Air Waybill)"}
              </button>
            )}
          </div>
        )}

        {/* ================= AWB GENERATED ================= */}
        {awb && (
          <div className="success-indicator">
            <div className="indicator-content">
              <strong>AWB Generated: {awb}</strong>
              <p>Routing labels have been prepared for this shipment.</p>
            </div>
          </div>
        )}

        {/* ================= LIVE STATUS ================= */}
        {orderStatus && (
          <div className="status-tracker" style={{ marginTop: '16px', backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' }}>
            <h4><span className="bullet"></span> Live Tracking Status</h4>
            <div className="status-item">
              <strong>Current:</strong> <span>{orderStatus}</span>
            </div>
            {orderStatus === "READY TO SHIP" && (
              <p className="success-msg">✅ This shipment is ready for pickup scheduling.</p>
            )}
          </div>
        )}

        {error && (
          <div className="error-indicator">
            <strong>Update Error:</strong> {error}
          </div>
        )}
      </div>
    </div>
  );
}
