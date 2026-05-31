// src/components/layout/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../../assets/css/navbar.css";
import Logo from '../../assets/img/logo.png';
import Flag from '../../assets/img/image.png';
import Profile from '../../assets/img/profile.png';


const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role || "User";
  const basePath = (role === "Admin" || role === "pre-tender") ? "/Admin" : "/User";


  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null); // desktop hover/focus
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState(null); // mobile accordion
  const [profileOpen, setProfileOpen] = useState(false);

  const navRef = useRef(null);
  const profileRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Full navigation structure
  const navItems = [
    {
      label: "Home",
      items: [
        { name: "Home", path: `${basePath}/home` },
        { name: "Open Tenders", path: `${basePath}/open-dashboard` },
      ],
    },
    {
      label: "Tenders",
      items: [
        { name: "Tenders", path: `${basePath}/tenders` },
        { name: "Interested Tenders", path: `${basePath}/interested` },
        { name: "Archived Tenders", path: `${basePath}/archive` },
        { name: "Prebid Meetings", path: `${basePath}/prebid-meetings` },
      ],
    },
    {
      label: "Tender Insights",
      items: [
        { name: "Participated Tender", path: "/insights/participated-tender" },
        { name: "Competitor Profile", path: "/insights/CompetitorProfile" },
        { name: "Incident", path: "/insights/Incident" },
        { name: "Selling Stats", path: "/insights/Compare-Products" },
        { name: "Competitor Portfolio Tracking", path: "/insights/Company-Profile" },
        { name: "Compare Competitors", path: "/insights/Compare-Bidders" },
      ],
    },

    {
      label: "Tender Workdesk",
      items: [
        { name: "Workdesk", path: `${basePath}/workdesk` },
        { name: "Active Workspaces", path: `${basePath}/workdesk/active-workspaces` },
      ],
    },
    {
      label: "Order Management",
      items: [
        { name: "GeM Contracts", path: "/orders/gem-contracts" },
        { name: "Carting Dashboard", path: "/orders/carting-dashboard" },
        { name: "Work Orders", path: "/orders/work-orders" },
        { name: "PO Tracking", path: "/orders/po-tracking" },
        { name: "Billing & Invoices", path: "/orders/billing-invoices" },
      ],
    },
    {
      label: "Dealer Management",
      items: [
        { name: "Dealers", path: "/dealers/distributors" },
        { name: "OEMs", path: "/dealers/OEMs" },
        { name: "Dealer Performance", path: "/dealers/Dealer-performance" },
        { name: "Product Catalogs", path: "/dealers/product-catalogs" },
      ],
    },
    {
      label: "Support Tools",
      items: [
        { name: "Product Suggestion Engine", path: "/support/product-suggestion" },
        { name: "Participated Tenders Report", path: "/support/participated-report" },
        { name: "Tender Calendar", path: "/support/tender-calendar" },
        { name: "Document Templates", path: "/support/document-templates" },
        { name: "BOQ Calculator", path: "/support/boq-calculator" },
        { name: "Probability Simulator", path: "/support/probability-simulator" },
      ],
    },
    {
      label: "Settings",
      items: [
        { name: "Departments", path: "/settings/departments" },
        { name: "Designation", path: "/settings/designation" },
        { name: "Role Management", path: "/settings/role-management" },
        { name: "User Management", path: "/settings/user-management" },
        { name: "Distributors", path: "/settings/distributors" },
        { name: "State–Sales Mapping", path: "/settings/state-sales-mapping" },
        { name: "Profile", path: "/settings/profile" },
        { name: "System Logs", path: "/settings/system-logs" },
        { name: "API Keys", path: "/settings/api-keys" },
      ],
    },
  ];

  const profileItems = [
    { name: "Profile", path: "/profile" },
    { name: "Change Password", path: "/change-password" },
    { name: "Logout", path: "/logout" },
  ];

  // Close menus when clicking outside
  useEffect(() => {
    const onClickOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
        setMobileExpandedMenu(null);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setActiveDropdown(null);
        setProfileOpen(false);
        setMobileExpandedMenu(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // keyboard navigation for top-level buttons
  const handleTopKeyDown = (e, idx) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % navItems.length;
      document.getElementById(`nav-top-${next}`)?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + navItems.length) % navItems.length;
      document.getElementById(`nav-top-${prev}`)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      // toggle dropdown on Enter/Space
      e.preventDefault();
      setActiveDropdown(activeDropdown === idx ? null : idx);
    } else if (e.key === "Escape") {
      setActiveDropdown(null);
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
    if (mobileMenuOpen) {
      setMobileExpandedMenu(null);
    }
  };

  const toggleMobileSubmenu = (idx) => {
    setMobileExpandedMenu(mobileExpandedMenu === idx ? null : idx);
  };

  const isRouteActive = (path) => {
    if (!path || path === "#") return false;
    return location.pathname === path;
  };

  return (
    <>
      <nav className="navbar" ref={navRef} aria-label="Main navigation">
        {/* Brand / Logo */}
        <div className="navbar-brand">
          <Link to="/" className="navbar-logo-text" aria-label="Meril Tenders Home">
            <img src={Logo} alt="" className="LogoImg" />
            <span className="gaper">sd</span>
            <img src={Flag} alt="" className="FlagImg" />
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          className={`navbar-hamburger ${mobileMenuOpen ? "active" : ""}`}
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation"
          aria-expanded={mobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Main Menu */}
        <ul className={`navbar-menu ${mobileMenuOpen ? "mobile-open" : ""}`} role="menubar">
          {navItems.map((top, idx) => (
            <li
              className="navbar-item"
              key={top.label}
              onMouseEnter={() => !mobileMenuOpen && setActiveDropdown(idx)}
              onMouseLeave={() => !mobileMenuOpen && setActiveDropdown(null)}
              role="none"
            >
              <button
                id={`nav-top-${idx}`}
                className="navbar-link"
                aria-haspopup="true"
                aria-expanded={
                  (activeDropdown === idx && !mobileMenuOpen) ||
                    (mobileExpandedMenu === idx && mobileMenuOpen)
                    ? "true"
                    : "false"
                }
                onKeyDown={(e) => handleTopKeyDown(e, idx)}
                onClick={() => mobileMenuOpen && toggleMobileSubmenu(idx)}
                role="menuitem"
              >
                <span>{top.label}</span>
                <span className="dropdown-arrow" aria-hidden>
                  ▾
                </span>
              </button>

              {/* Dropdown / Submenu */}
              <ul
                className={`navbar-dropdown ${(activeDropdown === idx && !mobileMenuOpen) ||
                  (mobileExpandedMenu === idx && mobileMenuOpen)
                  ? "active"
                  : ""
                  }`}
                role="menu"
                aria-label={`${top.label} submenu`}
              >
                {top.items.map((sub, sidx) => (
                  <li key={sidx} role="none">
                    {sub.path && sub.path !== "#" ? (
                      <Link
                        to={sub.path}
                        className="navbar-dropdown-item"
                        role="menuitem"
                        aria-current={isRouteActive(sub.path) ? "page" : undefined}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setActiveDropdown(null);
                          setMobileExpandedMenu(null);
                        }}
                      >
                        {sub.name}
                      </Link>
                    ) : (
                      <a
                        href="#"
                        className="navbar-dropdown-item"
                        role="menuitem"
                        onClick={(e) => e.preventDefault()}
                      >
                        {sub.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {/* Profile area */}
        <div className="navbar-profile" ref={profileRef}>
          <button
            className="navbar-profile-btn"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-haspopup="true"
            aria-expanded={profileOpen}
            aria-label="User profile menu"
          >
            <div className="navbar-avatar" aria-hidden>
              <img src={Profile} alt="" className="UserProfile" />
            </div>
          </button>

          <ul
            className={`navbar-profile-dropdown ${profileOpen ? "active" : ""}`}
            role="menu"
            aria-label="User menu"
          >
            {profileItems.map((p, i) => (
              <li key={i} role="none">
                {p.name === "Logout" ? (
                  <button
                    className="navbar-profile-item"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    to={p.path}
                    className="navbar-profile-item"
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                  >
                    {p.name}
                  </Link>
                )}
              </li>
            ))}

          </ul>
        </div>
      </nav>
      <hr className="GoldenLine" />
    </>
  );
};

export default Navbar;
