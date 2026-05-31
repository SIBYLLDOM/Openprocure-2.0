import { useEffect, useState } from "react";
import api from "../api/api";
import SchedulePickupModal from "../components/SchedulePickupModal";
import "../assets/css/ReadyToShip.css";

export default function ReadyToShip() {
  const [orders, setOrders] = useState([]);
  const [pickupLocations, setPickupLocations] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const getAwb = (o) =>
    o.awb_code ||
    o.awb ||
    o.shipment_awb ||
    o.shipments?.[0]?.awb ||
    "";

  const fetchData = async () => {
    const [ordersRes, pickupRes] = await Promise.all([
      api.get("/order/ready-to-ship"),
      api.get("/order/pickup/locations"),
    ]);

    setOrders(ordersRes.data.orders || []);
    setPickupLocations(pickupRes.data.shipping_address || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const primaryPickup = pickupLocations.find(
    (p) => p.is_primary_location === 1
  );

  const downloadFile = (type, shipment_id) => {
    window.open(
      `${import.meta.env.VITE_BACKEND_URL}/api/order/${type}?shipment_id=${shipment_id}`,
      "_blank"
    );
  };

  if (loading) return <p>Loading shipments...</p>;

  return (
    <div className="container-main">
      <h2>Live Shipments Tracker</h2>

      <table className="orders-table">
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Customer</th>
            <th>AWB</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((o) => {
            const awb = getAwb(o);

            return (
              <tr key={o.id}>
                <td>{o.channel_order_id}</td>
                <td>{o.customer_name}</td>
                <td>{awb || "Processing"}</td>
                <td>{o.status}</td>

                <td>
                  {!awb && (
                    <button
                      onClick={() => {
                        // Debug: Log the order data
                        console.log("Order data:", o);
                        console.log("courier_company_id:", o.courier_company_id);
                        console.log("channel_order_id:", o.channel_order_id);

                        if (!o.courier_company_id) {
                          alert("Error: No courier assigned to this order. Please assign a courier first.");
                          return;
                        }

                        if (!o.channel_order_id) {
                          alert("Error: Order ID is missing.");
                          return;
                        }

                        api.post("/order/generate-awb", {
                          order_id: o.channel_order_id,
                          courier_id: o.courier_company_id,
                        })
                          .then(fetchData)
                          .catch(err => {
                            console.error("AWB Generation Error:", err);
                            alert(`Failed to generate AWB: ${err.response?.data?.message || err.message}`);
                          });
                      }}
                    >
                      Generate AWB
                    </button>
                  )}

                  {awb && o.status === "READY TO SHIP" && (
                    <button
                      onClick={() =>
                        setSelectedOrder({ ...o, awb_code: awb })
                      }
                    >
                      Schedule Pickup
                    </button>
                  )}

                  {awb && o.status !== "READY TO SHIP" && (
                    <>
                      <button
                        onClick={() =>
                          downloadFile("label", o.shipment_id)
                        }
                      >
                        Label
                      </button>
                      <button
                        onClick={() =>
                          downloadFile("invoice", o.shipment_id)
                        }
                      >
                        Invoice
                      </button>
                      <button
                        onClick={() =>
                          downloadFile("manifest", o.shipment_id)
                        }
                      >
                        Manifest
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedOrder && (
        <SchedulePickupModal
          order={selectedOrder}
          pickup={primaryPickup}
          onClose={() => setSelectedOrder(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
