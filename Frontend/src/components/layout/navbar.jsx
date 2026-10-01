// src/components/layout/Navbar.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../../assets/css/navbar.css";
import Logo from '../../assets/img/logo.png';
import Flag from '../../assets/img/image.png';
import Profile from '../../assets/img/profile.png';
import NotificationBell from './NotificationBell';


const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));
  const role = user?.role || "User";
  const basePath = ["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"].includes(role) ? "/Admin" : "/User";


  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null); // desktop hover/focus
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState(null); // mobile accordion
  const [profileOpen, setProfileOpen] = useState(false);

  const navRef = useRef(null);
  const profileRef = useRef(null);

  // Real mouse hover only — touch devices report a "hover" on first tap with
  // no matching mouseleave, which would otherwise leave dropdowns stuck open
  // and overlapping the navbar until the user taps elsewhere.
  const [canHover, setCanHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const handler = () => setCanHover(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleLogout = () => {
    const sessionId = localStorage.getItem('sessionId');
    const token = localStorage.getItem('token');
    if (sessionId && token) {
      const apiBase = import.meta.env.VITE_API_BASE_URL;
      navigator.sendBeacon(
        `${apiBase}/monitoring/session/end`,
        new Blob([JSON.stringify({ sessionId: Number(sessionId) })], { type: 'application/json' })
      );
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("sessionId");
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
        { name: "Tender Tracker", path: `${basePath}/tender-tracker` },
        { name: "Archived Tenders", path: `${basePath}/archive` },
        { name: "Prebid Meetings", path: `${basePath}/prebid-meetings` },
        { name: "Document Tender", path: `${basePath}/document-tender` },
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
        { name: "Library", path: `${basePath}/workdesk/library` },
        { name: "Letter Generate", path: `${basePath}/workdesk/letter-generate` },
      ],
    },
    {
      label: "Order Management",
      items: [
        { name: "GeM Contracts", path: "/orders/gem-contracts" },
        { name: "Carting Dashboard", path: "/orders/carting-dashboard" },
      ],
    },
    {
      label: "Dealer Management",
      items: [
        { name: "Dealers", path: "/dealers/distributors" },
        { name: "Dealer Authorization Letter", path: "/dealers/authorization-letter" },
      ],
    },
    {
      label: "Support Tools",
      items: [
        { name: "AI Drive", path: "/support/ai-drive" },
        { name: "Tutorial", path: "/tutorial" },
        // Budget Targeting System is exclusive to Office Administrator — see below.
        ...(role === "Office Administrator" ? [{ name: "Budget Targeting System", path: "/support/budget-targeting" }] : []),
      ],
    },
    ...(["Admin", "Tender Admin", "Office Administrator"].includes(role) ? [{
      label: "Monitor",
      items: [
        { name: "Monitor Dashboard", path: "/Admin/monitor" },
        { name: "Approvals", path: "/Admin/approvals" },
        { name: "Automation", path: "/Admin/automation" },
        { name: "Scrapers", path: "/Admin/scrapers" },
        { name: "User Management", path: "/Admin/users" },
        { name: "Field Team", path: "/Admin/field-team" },
        { name: "Support Tickets", path: "/Admin/support-tickets" },
        { name: "Product Categories", path: "/Admin/product-categories" },
      ],
    }] : []),
    ...(role === "Zonal Head" ? [{
      label: "Team",
      items: [
        { name: "User Management", path: "/Admin/users" },
      ],
    }] : []),
  ];

  // Finance Team only price and sign off Process Decode sheets — the tender
  // pipeline, workdesk, orders, dealers, support tools and settings are not
  // part of that job, so those sections are dropped for them.
  // Tender Workdesk stays visible: Finance review the Process Decode sheet and
  // act on approvals from inside the workdesk (see DecodeStatusBanner).
  const HIDDEN_FOR_FINANCE = [
    "Tender Insights",
    "Order Management",
    "Dealer Management",
    "Support Tools",
  ];

  // Approvals lives under "Monitor", which only Admin and Tender Admin see —
  // so every other role in the approval chain gets a direct entry instead.
  const APPROVAL_ROLES = ["Tender Executive", "Zonal Head", "Sales", "Finance Team"];

  // Pricing is Finance's main workspace, so it gets its own entry.
  const PRICING_ROLES = ["Finance Team", "Admin"];

  // Legal signs Dealer Authorization Letters first, then Admin (Ravi Kiran) —
  // both need a direct entry to Pending Signatures.
  const SIGNOFF_ROLES = ["Legal", "Admin", "Tender Admin", "Office Administrator"];

  const visibleNavItems = (
    role === "Finance Team"
      ? navItems.filter(i => !HIDDEN_FOR_FINANCE.includes(i.label))
      : navItems
  ).concat(
    PRICING_ROLES.includes(role)
      ? [{ label: "Pricing", items: [{ name: "Tender Pricing", path: "/Admin/pricing" }] }]
      : []
  ).concat(
    APPROVAL_ROLES.includes(role)
      ? [{ label: "Approvals", items: [{ name: "Approvals", path: "/Admin/approvals" }] }]
      : []
  ).concat(
    SIGNOFF_ROLES.includes(role)
      ? [{ label: "Signatures", items: [{ name: "Pending Signatures", path: "/dealers/signatures" }] }]
      : []
  );

  const profileItems = [
    { name: "My Profile", path: "/profile" },
    { name: "My Support Tickets", path: "/support" },
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
      const next = (idx + 1) % visibleNavItems.length;
      document.getElementById(`nav-top-${next}`)?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + visibleNavItems.length) % visibleNavItems.length;
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
          {visibleNavItems.map((top, idx) => (
            <li
              className="navbar-item"
              key={top.label}
              onMouseEnter={() => canHover && !mobileMenuOpen && setActiveDropdown(idx)}
              onMouseLeave={() => canHover && !mobileMenuOpen && setActiveDropdown(null)}
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
                onClick={() => {
                  if (mobileMenuOpen) toggleMobileSubmenu(idx);
                  else if (!canHover) setActiveDropdown((cur) => (cur === idx ? null : idx));
                }}
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
        <NotificationBell />

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
