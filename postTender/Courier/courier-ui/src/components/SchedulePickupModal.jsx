import { useState } from "react";
import api from "../api/api";
import "../assets/css/SchedulePickupModal.css";

export default function SchedulePickupModal({
  order,
  pickup,
  onClose,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);

  const awb =
    order.awb_code ||
    order.awb ||
    order.shipment_awb ||
    order.shipments?.[0]?.awb ||
    "";

  /* =========================
     CONFIRM PICKUP (MANIFEST)
  ========================= */
  const confirmPickup = async () => {
    setLoading(true);
    try {
      await api.post("/order/manifest/generate", {
        shipment_ids: [order.shipment_id],
      });

      alert("✅ Pickup scheduled successfully");
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("❌ Pickup scheduling failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) =>
        e.target.className === "modal-overlay" && onClose()
      }
    >
      <div className="modal">
        <div className="modal-header">
          <h3>Schedule Your Pick Up</h3>
          <button className="close-x-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="success-box">
          <p>✔ Package assigned successfully</p>
          <p>
            <b>AWB Number:</b> {awb}
          </p>
        </div>

        <div className="section">
          <h4>Pickup Location</h4>
          <p>
            <b>{pickup?.pickup_location}</b>
          </p>
          <p>{pickup?.address}</p>
          <p>
            {pickup?.city}, {pickup?.state} – {pickup?.pin_code}
          </p>
          <p>
            🕒 {pickup?.open_time} – {pickup?.close_time}
          </p>
        </div>

        <div className="note">
          Pickup will be scheduled as per Shiprocket standard pickup window.
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Maybe Later
          </button>

          <button
            className="primary"
            onClick={confirmPickup}
            disabled={loading}
          >
            {loading ? "Scheduling..." : "Confirm Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
