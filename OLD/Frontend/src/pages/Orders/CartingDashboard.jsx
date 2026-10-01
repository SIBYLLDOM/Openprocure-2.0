import React, { useState, useEffect, useMemo } from 'react';
import { RotateCcw, Mail, Upload, MessageSquare, Info, Maximize2, Minimize2, MoreVertical, ArrowUp, ArrowDown } from 'lucide-react';
import Select, { components } from 'react-select';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Tooltip } from 'react-tooltip';
import indiaGeoJson from '../../assets/data/india-states.json';

// Import local CSS
import '../../assets/css/CartingDashboard.css';

// --- Inlined Data ---

// Initial state
const INITIAL_KPI_DATA = {
  total: "0L",
  meril: "0L",
  others: "0L"
};

// pivotData removed (fetching from API)

// chartData removed (fetching from API)



// indiaTopo removed (using imported GeoJSON)


// --- Sub-Components ---

const IconButton = ({ icon }) => (
  <button style={{
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666'
  }}>
    {icon}
  </button>
);

const Header = () => {
  return (
    <div className="header-container">
      <h2 className="header-title">Endo Carting Dashboard</h2>
      <div className="header-icons">
        <IconButton icon={<RotateCcw size={16} />} />
        <IconButton icon={<Mail size={16} />} />
        <IconButton icon={<Upload size={16} />} />
        <IconButton icon={<MessageSquare size={16} />} />
        <IconButton icon={<Info size={16} />} />
      </div>
    </div>
  );
};

const customSelectStyles = {
  control: (provided) => ({
    ...provided,
    backgroundColor: '#fff',
    borderColor: '#ddd',
    minHeight: '32px',
    height: '32px',
    fontSize: '13px',
    boxShadow: 'none',
    '&:hover': {
      borderColor: '#bbb'
    }
  }),
  valueContainer: (provided) => ({
    ...provided,
    height: '32px',
    padding: '0 6px',
    alignItems: 'center',
  }),
  input: (provided) => ({
    ...provided,
    margin: '0',
    padding: '0',
    color: '#333'
  }),
  indicatorsContainer: (provided) => ({
    ...provided,
    height: '32px',
  }),
  dropdownIndicator: (provided) => ({
    ...provided,
    padding: '4px',
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 9999,
    fontSize: '13px'
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? '#e0f7fa' : state.isFocused ? '#f5f5f5' : '#fff',
    color: '#333',
    cursor: 'pointer'
  }),
  placeholder: (provided) => ({
    ...provided,
    color: '#333',
  })
};

const CustomDropdownIndicator = (props) => {
  return (
    <components.DropdownIndicator {...props}>
      <MoreVertical size={16} />
    </components.DropdownIndicator>
  );
};

const Filters = ({ options, selectedFilters, setSelectedFilters }) => {
  const handleFilterChange = (option, selectedOption) => {
    setSelectedFilters(prev => ({
      ...prev,
      [option.label]: selectedOption
    }));
  };

  return (
    <div className="filters-container">
      {options.map((option, index) => (
        <div key={index} className="filter-item">
          <label style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            {option.label}:
          </label>
          <Select
            options={option.options}
            styles={customSelectStyles}
            components={{ DropdownIndicator: CustomDropdownIndicator }}
            placeholder={`Select ${option.label}...`}
            isClearable
            value={selectedFilters[option.label] || null}
            onChange={(selectedOption) => handleFilterChange(option, selectedOption)}
          />
        </div>
      ))}
    </div>
  );
};

const Card = ({ title, value, color }) => (
  <div style={{
    height: '100%',
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderTop: `4px solid ${color}`,
    padding: '20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>{title}</div>
    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#000' }}>{value}</div>
  </div>
);

const KPICards = ({ data }) => {
  return (
    <div className="kpi-container">
      <div className="kpi-card-wrapper">
        <Card title="Total Carting" value={data.total} color="#00bcd4" />
      </div>
      <div className="kpi-card-wrapper">
        <Card title="Meril Carting" value={data.meril} color="#ff9800" />
      </div>
      <div className="kpi-card-wrapper">
        <Card title="Others Carting" value={data.others} color="#e91e63" />
      </div>
    </div>
  );
};

const PivotTable = ({ data, isExpanded, toggleExpand }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'default' });
  const [hoveredHeader, setHoveredHeader] = useState(null);

  const containerStyle = {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    height: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column'
  };

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    if (sortConfig.key !== null && sortConfig.direction !== 'default') {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric values with 'L' suffix
        if (typeof aValue === 'string' && aValue.includes('L')) {
          aValue = parseFloat(aValue.replace('L', '')) || 0;
          bValue = typeof bValue === 'string' ? parseFloat(bValue.replace('L', '')) || 0 : 0;
        }
        // Handle Month sorting
        else if (sortConfig.key === 'month') {
          const months = { "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12 };
          aValue = months[aValue] || 0;
          bValue = months[bValue] || 0;
        }
        else {
          if (!aValue) aValue = "";
          if (!bValue) bValue = "";
        }

        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    } else if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'default';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey || sortConfig.direction === 'default') {
      return <span style={{ marginLeft: '5px', opacity: 0.3, fontSize: '10px' }}>↓</span>;
    }
    return sortConfig.direction === 'ascending'
      ? <ArrowUp size={12} style={{ marginLeft: '5px' }} />
      : <ArrowDown size={12} style={{ marginLeft: '5px' }} />;
  };

  const headerStyle = {
    padding: '10px',
    borderBottom: '1px solid #eee',
    fontWeight: '600',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap'
  };

  const getTooltipText = (key, label) => {
    if (sortConfig.key !== key) return `Click to sort ${label} in Ascending order.`;
    if (sortConfig.direction === 'ascending') return `Click to sort ${label} in Descending order.`;
    if (sortConfig.direction === 'descending') return `Click to clear sort on ${label}.`;
    return `Click to sort ${label} in Ascending order.`;
  };

  const SortableHeader = ({ label, columnKey, align = 'left' }) => (
    <th
      onClick={() => requestSort(columnKey)}
      onMouseEnter={() => setHoveredHeader(columnKey)}
      onMouseLeave={() => setHoveredHeader(null)}
      style={{ ...headerStyle, textAlign: align, position: 'relative' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {label} <SortIcon columnKey={columnKey} />
      </div>

      {hoveredHeader === columnKey && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: align === 'right' ? 'auto' : '0',
          right: align === 'right' ? '0' : 'auto',
          transform: 'translateY(10px)',
          backgroundColor: '#333',
          color: '#fff',
          padding: '10px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '400',
          zIndex: 1000,
          minWidth: '200px',
          textAlign: 'left',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#64b5f6' }}>Sort Details:</div>
          <div>{getTooltipText(columnKey, label)}</div>
        </div>
      )}
    </th>
  );

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>Pivot-Carting</h3>
        <button onClick={toggleExpand} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>
          {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 300px)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5', color: '#666', textAlign: 'left' }}>
              <th style={{ padding: '10px', borderBottom: '1px solid #eee', fontWeight: '600' }}></th>
              <SortableHeader label="Hospital State" columnKey="state" />
              <SortableHeader label="Month" columnKey="month" />
              <SortableHeader label="MERIL" columnKey="meril" align="right" />
              <SortableHeader label="OTHERS" columnKey="others" align="right" />
              <SortableHeader label="Total Total Value" columnKey="total" align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #f9f9f9' }}>
                <td style={{ padding: '10px', color: '#888' }}>{row.id}</td>
                <td style={{ padding: '10px' }}>{row.state}</td>
                <td style={{ padding: '10px', color: '#666' }}>{row.month}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{row.meril}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{row.others}</td>
                <td style={{ padding: '10px', textAlign: 'right' }}>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const EndoChart = ({ data, isExpanded, toggleExpand }) => {
  // Use imported GeoJSON directly
  const geographyData = indiaGeoJson;

  const [tooltipContent, setTooltipContent] = useState('');

  const getStateData = (geoName) => {
    if (!geoName) return null;
    return data.find(d => d.name.toLowerCase() === geoName.toLowerCase());
  };

  const containerStyle = {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden'
  };

  if (!geographyData) {
    return <div>Loading Map...</div>;
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#000' }}>Chart - Endo Carting</h3>
        <div style={{ display: 'flex', gap: '8px', color: '#666', alignItems: 'center' }}>
          <button onClick={toggleExpand} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', padding: 0, display: 'flex' }}>
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <MoreVertical size={16} />
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 1000,
            center: [78.9629, 22.5937] // Center of India
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies geography={geographyData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const stateData = getStateData(geo.properties.name);
                const tooltipContent = stateData ? `
                                <div style="text-align: left;">
                                  <strong>${geo.properties.name}</strong><br/>
                                  Meril: ${stateData.meril}L<br/>
                                  Others: ${stateData.others}L
                                </div>
                            ` : `<strong>${geo.properties.name}</strong><br/>No Data`;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    data-tooltip-id="my-tooltip"
                    data-tooltip-html={tooltipContent}
                    style={{
                      default: {
                        fill: stateData ? "#4db6ac" : "#ECEFF1",
                        stroke: "#607D8B",
                        strokeWidth: 0.75,
                        outline: "none"
                      },
                      hover: {
                        fill: stateData ? "#7986cb" : "#CFD8DC",
                        stroke: "#607D8B",
                        strokeWidth: 1,
                        outline: "none",
                        cursor: "pointer"
                      },
                      pressed: {
                        fill: "#FF5722",
                        stroke: "#607D8B",
                        strokeWidth: 1,
                        outline: "none"
                      }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

      <Tooltip id="my-tooltip" float style={{ backgroundColor: "#333", color: "#fff", zIndex: 100 }} />

      <div style={{
        marginTop: '10px',
        padding: '10px',
        borderTop: '1px solid #eee',
        fontSize: '12px',
        color: '#666',
        textAlign: 'center'
      }}>
        Hover over a state to see detailed carting values. <br />
        <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#4db6ac', marginRight: '5px' }}></span> Participating States
        <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#ECEFF1', marginLeft: '10px', marginRight: '5px', border: '1px solid #ccc' }}></span> No Data
      </div>
    </div>
  );
};


// --- Main Component ---

const CartingDashboard = () => {
  const [expandedView, setExpandedView] = useState(null);
  const [selectedFilters, setSelectedFilters] = useState({});
  const [sellerOptions, setSellerOptions] = useState([]);
  const [stateOptions, setStateOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [kpiData, setKpiData] = useState(INITIAL_KPI_DATA);
  const [pivotData, setPivotData] = useState([]);
  const [mapData, setMapData] = useState([]);

  useEffect(() => {
    fetchSellers();
    fetchStates();
  }, []);

  useEffect(() => {
    const dept = selectedFilters['Dept']?.value;
    fetchCategories(dept);
  }, [selectedFilters['Dept']]); // Re-fetch categories ONLY when Dept changes

  const fetchSellers = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/carting/sellers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setSellerOptions(data.data);
      }
    } catch (error) {
      console.error('Error fetching sellers:', error);
    }
  };

  const fetchStates = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/carting/states`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setStateOptions(data.data);
      }
    } catch (error) {
      console.error('Error fetching states:', error);
    }
  };

  const fetchCategories = async (dept) => {
    try {
      let url = `${import.meta.env.VITE_API_BASE_URL}/carting/categories`;
      if (dept) {
        url += `?department=${dept}`;
      }
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setCategoryOptions(data.data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const filterOptions = useMemo(() => [
    {
      label: "Bid/Direct",
      options: [
        { value: 'bid', label: 'Bid' },
        { value: 'direct', label: 'Direct' },
        { value: 'mixed', label: 'Mixed' }
      ]
    },
    {
      label: "Dept",
      options: [
        { value: 'endo', label: 'Endo' },
        { value: 'diagno', label: 'Diagno' }
      ]
    },
    {
      label: "Month",
      options: [
        { value: 'jan', label: 'January' },
        { value: 'feb', label: 'February' },
        { value: 'mar', label: 'March' },
        { value: 'apr', label: 'April' },
        { value: 'may', label: 'May' },
        { value: 'jun', label: 'June' },
        { value: 'jul', label: 'July' },
        { value: 'aug', label: 'August' },
        { value: 'sep', label: 'September' },
        { value: 'oct', label: 'October' },
        { value: 'nov', label: 'November' },
        { value: 'dec', label: 'December' }
      ]
    },
    {
      label: "Year",
      options: [
        { value: '2024', label: '2024' },
        { value: '2025', label: '2025' },
        { value: '2026', label: '2026' }
      ]
    },
    {
      label: "Seller Details",
      options: sellerOptions
    },
    {
      label: "State",
      options: stateOptions
    },
    {
      label: "Category",
      options: categoryOptions
    }
  ], [sellerOptions, stateOptions, categoryOptions]);

  useEffect(() => {
    const filters = {};
    if (selectedFilters['Bid/Direct']) {
      filters.buyingMode = selectedFilters['Bid/Direct'].value;
    }
    if (selectedFilters['Dept']) {
      filters.department = selectedFilters['Dept'].value;
    }
    if (selectedFilters['Year']) {
      filters.year = selectedFilters['Year'].value;
    }
    if (selectedFilters['Month']) {
      const monthMap = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
      };
      filters.month = monthMap[selectedFilters['Month'].value];
    }
    if (selectedFilters['Seller Details']) {
      filters.seller = selectedFilters['Seller Details'].value;
    }
    if (selectedFilters['State']) {
      filters.state = selectedFilters['State'].value;
    }
    if (selectedFilters['Category']) {
      filters.category = selectedFilters['Category'].value;
    }

    fetchKpiData(filters);
    fetchPivotData(filters);
    fetchMapData(filters);
  }, [selectedFilters]);

  const fetchMapData = async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/carting/map?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        // Format values to Lakhs
        const formatValue = (val) => (val / 100000).toFixed(2);

        const formattedData = data.data.map(item => ({
          ...item,
          total: formatValue(item.total),
          meril: formatValue(item.meril),
          others: formatValue(item.others)
        }));

        setMapData(formattedData);
      }
    } catch (error) {
      console.error('Error fetching map data:', error);
    }
  };

  const fetchPivotData = async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/carting/pivot?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        // Format values with 'L' suffix
        const formatLakh = (val) => (val / 100000).toFixed(2) + 'L';

        const formattedData = data.data.map(item => ({
          ...item,
          total: formatLakh(item.total),
          meril: formatLakh(item.meril),
          others: formatLakh(item.others)
        }));

        setPivotData(formattedData);
      }
    } catch (error) {
      console.error('Error fetching pivot data:', error);
    }
  };

  const fetchKpiData = async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/carting/kpi?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();

      if (data.success) {
        // Format values to Lakhs (L)
        const formatLakh = (val) => (val / 100000).toFixed(2) + 'L';

        setKpiData({
          total: formatLakh(data.data.total),
          meril: formatLakh(data.data.meril),
          others: formatLakh(data.data.others)
        });
      }
    } catch (error) {
      console.error('Error fetching KPI data:', error);
    }
  };

  const toggleTableExpand = () => {
    setExpandedView(prev => prev === 'table' ? null : 'table');
  };

  const toggleChartExpand = () => {
    setExpandedView(prev => prev === 'chart' ? null : 'chart');
  };

  return (
    <div className="app-container">
      <Header />
      <Filters options={filterOptions} selectedFilters={selectedFilters} setSelectedFilters={setSelectedFilters} />
      <KPICards data={kpiData} />

      <div className="main-content">
        {expandedView !== 'chart' && (
          <div
            className="split-section-left"
            style={{
              flex: expandedView === 'table' ? '1 1 100%' : '4',
              display: expandedView === 'chart' ? 'none' : 'block',
              transition: 'all 0.3s ease'
            }}
          >
            <PivotTable
              data={pivotData}
              isExpanded={expandedView === 'table'}
              toggleExpand={toggleTableExpand}
            />
          </div>
        )}

        {expandedView !== 'table' && (
          <div
            className="split-section-right"
            style={{
              flex: expandedView === 'chart' ? '1 1 100%' : '6',
              display: expandedView === 'table' ? 'none' : 'block',
              transition: 'all 0.3s ease'
            }}
          >
            <EndoChart
              data={mapData}
              isExpanded={expandedView === 'chart'}
              toggleExpand={toggleChartExpand}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CartingDashboard;
