import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/navbar";
import CreateShipment from "./pages/CreateShipment";
import CourierOptions from "./pages/CourierOptions";
import OrderSummary from "./pages/OrderSummary";
import ReadyToShip from "./pages/ReadyToShip";
import Pickups from "./pages/Pickups";
import InTransit from "./pages/InTransit";
import Delivered from "./pages/Delivered";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/logistics/create-shipment" replace />} />
        <Route path="/logistics/create-shipment" element={<CreateShipment />} />
        <Route path="/couriers" element={<CourierOptions />} />
        <Route path="/summary" element={<OrderSummary />} />
        <Route path="/logistics/ready-to-ship" element={<ReadyToShip />} />
        <Route path="/logistics/pickups" element={<Pickups />} />
        <Route path="/logistics/in-transit" element={<InTransit />} />
        <Route path="/logistics/delivered" element={<Delivered />} />
      </Routes>
    </>
  );
}

export default App;
