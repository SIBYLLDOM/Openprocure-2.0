import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import "../assets/css/CreateShipment.css";

export default function CreateShipment() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    pickup_address: "",
    pickup_city: "",
    pickup_state: "",
    pickup_pincode: "",

    delivery_address: "",
    delivery_city: "",
    delivery_state: "",
    delivery_pincode: "",

    weight: "",
    length: "",
    breadth: "",
    height: ""
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const checkCouriers = async () => {
    // basic validation (API-2 needs only pincodes + weight)
    if (
      form.pickup_pincode.length !== 6 ||
      form.delivery_pincode.length !== 6 ||
      !form.weight
    ) {
      alert("Please enter valid pincodes and weight");
      return;
    }

    try {
      setLoading(true);

      const res = await api.get("/courier/serviceability", {
        params: {
          pickup_pincode: form.pickup_pincode,
          delivery_pincode: form.delivery_pincode,
          weight: form.weight
        }
      });

      // Navigate with REAL API-2 data
      navigate("/couriers", {
        state: {
          shipment: form,      // full address (for later API-3)
          couriers: res.data   // API-2 response
        }
      });

    } catch (error) {
      console.error(error);
      alert("Failed to check courier serviceability");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-main">
      <div className="shipment-card">
        <div className="shipment-header">
          <h2>Create New Shipment</h2>
        </div>

        {/* Pickup Section */}
        <div className="shipment-section">
          <h3>Pickup Details</h3>
          <textarea
            className="address-input"
            name="pickup_address"
            placeholder="Complete Pickup Address"
            onChange={handleChange}
          />
          <div className="form-row">
            <input name="pickup_city" placeholder="City" onChange={handleChange} />
            <input name="pickup_state" placeholder="State" onChange={handleChange} />
            <input name="pickup_pincode" placeholder="Pincode" onChange={handleChange} />
          </div>
        </div>

        {/* Delivery Section */}
        <div className="shipment-section">
          <h3>Delivery Details</h3>
          <textarea
            className="address-input"
            name="delivery_address"
            placeholder="Complete Delivery Address"
            onChange={handleChange}
          />
          <div className="form-row">
            <input name="delivery_city" placeholder="City" onChange={handleChange} />
            <input name="delivery_state" placeholder="State" onChange={handleChange} />
            <input name="delivery_pincode" placeholder="Pincode" onChange={handleChange} />
          </div>
        </div>

        {/* Package Details */}
        <div className="shipment-section">
          <h3>Package & Weight</h3>
          <div className="form-row">
            <input name="weight" placeholder="Weight (kg)" onChange={handleChange} />
            <input name="length" placeholder="Length (cm)" onChange={handleChange} />
            <input name="breadth" placeholder="Breadth (cm)" onChange={handleChange} />
            <input name="height" placeholder="Height (cm)" onChange={handleChange} />
          </div>
        </div>

        <div className="submit-btn-container">
          <button
            className="verify-btn"
            onClick={checkCouriers}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span> Checking Serviceability...
              </>
            ) : (
              "Verify & Check Available Couriers"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
