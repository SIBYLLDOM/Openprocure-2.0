import { useLocation, useNavigate } from "react-router-dom";
import "../assets/css/CourierOptions.css";

export default function CourierOptions() {
  const navigate = useNavigate();
  const { state } = useLocation();

  // Safety guard
  if (!state || !state.couriers) {
    return (
      <p className="center-text">
        No courier data available. Please go back and try again.
      </p>
    );
  }

  // ✅ REAL SHIPROCKET RESPONSE STRUCTURE
  const courierList =
    state.couriers?.data?.available_courier_companies || [];

  const shipment = state.shipment;

  if (courierList.length === 0) {
    return (
      <p className="center-text">
        No couriers available for the selected route.
      </p>
    );
  }

  const getServiceType = (courier) =>
    courier.is_surface ? "Surface" : "Air";

  return (
    <div className="container-main">
      <div className="page-header">
        <h2>Available Delivery Partners</h2>
      </div>

      <div className="courier-selection-wrapper">
        <table className="courier-table">
          <thead>
            <tr>
              <th>Courier Partner</th>
              <th>Service Type</th>
              <th>Shipping Rate</th>
              <th>Estimated Delivery</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {courierList.map((courier) => (
              <tr key={courier.courier_company_id}>
                <td>
                  <strong>{courier.courier_name}</strong>
                </td>
                <td>
                  <span className="service-badge">{getServiceType(courier)}</span>
                </td>
                <td>
                  <span className="price-tag">₹{courier.rate}</span>
                </td>
                <td>
                  <span className="eta-badge">{courier.estimated_delivery_days} days</span>
                </td>
                <td>
                  <button
                    className="select-btn"
                    onClick={() =>
                      navigate("/summary", {
                        state: {
                          shipment,
                          courier
                        }
                      })
                    }
                  >
                    Select & Continue
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
