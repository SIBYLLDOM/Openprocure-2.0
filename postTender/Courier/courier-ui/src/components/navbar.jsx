import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../assets/css/navbar.css";

import Logo from "../assets/img/logo.png";
import Flag from "../assets/img/image.png";
import Profile from "../assets/img/profile.png";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const navRef = useRef(null);
  const profileRef = useRef(null);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  /* =============================
     LOGISTICS FLOW (REAL)
  ============================= */
  const navItems = [
    {
      label: "Dashboard",
      items: [{ name: "Dashboard", path: "/dashboard" }],
    },
    {
      label: "Logistics",
      items: [
        { name: "Create Shipment", path: "/logistics/create-shipment" },
        { name: "Ready to Ship", path: "/logistics/ready-to-ship" },
        { name: "Pickups & Manifests", path: "/logistics/pickups" },
        { name: "In Transit", path: "/logistics/in-transit" },
        { name: "Delivered", path: "/logistics/delivered" },
      ],
    },
  ];

  const isActive = (path) => location.pathname === path;

  /* =============================
     CLICK OUTSIDE HANDLER
  ============================= */
  useEffect(() => {
    const handler = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      <nav className="navbar" ref={navRef}>
        {/* LOGO */}
        <div className="navbar-brand">
          <Link to="/">
            <img src={Logo} className="LogoImg" alt="Logo" />
            <img src={Flag} className="FlagImg" alt="Flag" />
          </Link>
        </div>

        {/* HAMBURGER */}
        <button
          className={`navbar-hamburger ${mobileMenuOpen ? "active" : ""}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span />
          <span />
          <span />
        </button>

        {/* MENU */}
        <ul className={`navbar-menu ${mobileMenuOpen ? "mobile-open" : ""}`}>
          {navItems.map((nav, idx) => (
            <li
              key={nav.label}
              className="navbar-item"
              onMouseEnter={() => setActiveDropdown(idx)}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button className="navbar-link">
                {nav.label}
                <span className="dropdown-arrow">▾</span>
              </button>

              <ul
                className={`navbar-dropdown ${
                  activeDropdown === idx ? "active" : ""
                }`}
              >
                {nav.items.map((item) => (
                  <li key={item.name}>
                    <Link
                      to={item.path}
                      className="navbar-dropdown-item"
                      aria-current={isActive(item.path) ? "page" : undefined}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setActiveDropdown(null);
                      }}
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {/* PROFILE */}
        <div className="navbar-profile" ref={profileRef}>
          <button
            className="navbar-profile-btn"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <img src={Profile} className="UserProfile" alt="Profile" />
          </button>

          <ul
            className={`navbar-profile-dropdown ${
              profileOpen ? "active" : ""
            }`}
          >
            <li>
              <button className="navbar-profile-item" onClick={handleLogout}>
                Logout
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <hr className="GoldenLine" />
    </>
  );
};

export default Navbar;
