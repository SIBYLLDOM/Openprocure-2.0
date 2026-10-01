// src/pages/CreateTender/CreateTender.jsx
// Usage:
// import CreateTender from 'src/pages/CreateTender/CreateTender';
// <Route path="/create-tender" element={<CreateTender/>} />

import React, { useState } from 'react';
import '../../assets/css/CreateTender.css';

export default function CreateTender() {
  const [formData, setFormData] = useState({
    tenderId: '',
    tenderBrief: '',
    referenceNo: '',
    organizationName: '',
    keyword: '',
    siteLocation: '',
    profile: '',
    estimatedCost: '',
    earnestMoneyDeposite: '',
    documentFees: '',
    submissionDate: '',
    tenderOpeningDate: '',
    tenderClosingDate: '',
    prebidMeetingDate: '',
    tenderType: '',
    tenderCategory: '',
    state: '',
    city: '',
    pincode: '',
    department: '',
    quantity: '',
    unit: '',
    description: '',
    eligibilityCriteria: '',
    technicalSpecifications: '',
    uploadedFile: null
  });

  const [searchTenderId, setSearchTenderId] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData(prev => ({
      ...prev,
      uploadedFile: file
    }));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    console.log('Searching for Tender ID:', searchTenderId);
    // Implement search logic here
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    // Implement form submission logic here
  };

  const handleClear = () => {
    setFormData({
      tenderId: '',
      tenderBrief: '',
      referenceNo: '',
      organizationName: '',
      keyword: '',
      siteLocation: '',
      profile: '',
      estimatedCost: '',
      earnestMoneyDeposite: '',
      documentFees: '',
      submissionDate: '',
      tenderOpeningDate: '',
      tenderClosingDate: '',
      prebidMeetingDate: '',
      tenderType: '',
      tenderCategory: '',
      state: '',
      city: '',
      pincode: '',
      department: '',
      quantity: '',
      unit: '',
      description: '',
      eligibilityCriteria: '',
      technicalSpecifications: '',
      uploadedFile: null
    });
  };

  return (
    <div className="create-tender-page">
     

      <div className="create-tender-container">
        {/* Search Section */}
        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Tender Id"
              value={searchTenderId}
              onChange={(e) => setSearchTenderId(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn">
              Search
            </button>
          </form>
        </div>

        {/* Main Form */}
        <div className="form-section">
          <h2 className="form-title">Create New Tender</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {/* Tender Brief */}
              <div className="form-group full-width">
                <label htmlFor="tenderBrief">
                  Tender Brief <span className="required">*</span>
                </label>
                <textarea
                  id="tenderBrief"
                  name="tenderBrief"
                  placeholder="Tender Brief"
                  value={formData.tenderBrief}
                  onChange={handleInputChange}
                  rows="4"
                  required
                />
              </div>

              {/* Reference No */}
              <div className="form-group">
                <label htmlFor="referenceNo">
                  Reference No. <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="referenceNo"
                  name="referenceNo"
                  placeholder="Reference No."
                  value={formData.referenceNo}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Organization Name */}
              <div className="form-group">
                <label htmlFor="organizationName">
                  Organization Name <span className="required">*</span>
                </label>
                <select
                  id="organizationName"
                  name="organizationName"
                  value={formData.organizationName}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Organization Name</option>
                  <option value="PWD">Public Works Department</option>
                  <option value="Health">Health Department</option>
                  <option value="Education">Education Department</option>
                  <option value="Transport">Transport Department</option>
                  <option value="Municipal">Municipal Corporation</option>
                </select>
              </div>

              {/* Keyword */}
              <div className="form-group">
                <label htmlFor="keyword">
                  Keyword <span className="required">*</span>
                </label>
                <select
                  id="keyword"
                  name="keyword"
                  value={formData.keyword}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Search By Keywords</option>
                  <option value="construction">Construction</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="equipment">Equipment</option>
                  <option value="services">Services</option>
                  <option value="supplies">Supplies</option>
                </select>
              </div>

              {/* Site Location */}
              <div className="form-group">
                <label htmlFor="siteLocation">
                  Site Location <span className="required">*</span>
                </label>
                <select
                  id="siteLocation"
                  name="siteLocation"
                  value={formData.siteLocation}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Site Location</option>
                  <option value="mumbai">Mumbai</option>
                  <option value="delhi">Delhi</option>
                  <option value="bangalore">Bangalore</option>
                  <option value="chennai">Chennai</option>
                  <option value="kolkata">Kolkata</option>
                  <option value="hyderabad">Hyderabad</option>
                  <option value="pune">Pune</option>
                </select>
              </div>

              {/* Profile */}
              <div className="form-group">
                <label htmlFor="profile">
                  Profile <span className="required">*</span>
                </label>
                <select
                  id="profile"
                  name="profile"
                  value={formData.profile}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select profile</option>
                  <option value="contractor">Contractor</option>
                  <option value="supplier">Supplier</option>
                  <option value="consultant">Consultant</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>

              {/* Estimated Cost */}
              <div className="form-group">
                <label htmlFor="estimatedCost">
                  Estimated Cost <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="estimatedCost"
                  name="estimatedCost"
                  placeholder="Estimated Cost"
                  value={formData.estimatedCost}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Earnest Money Deposite */}
              <div className="form-group">
                <label htmlFor="earnestMoneyDeposite">
                  Earnest Money Deposite <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="earnestMoneyDeposite"
                  name="earnestMoneyDeposite"
                  placeholder="Earnest Money Deposite"
                  value={formData.earnestMoneyDeposite}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Document Fees */}
              <div className="form-group">
                <label htmlFor="documentFees">
                  Document Fees <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="documentFees"
                  name="documentFees"
                  placeholder="Document Fees"
                  value={formData.documentFees}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Submission Date */}
              <div className="form-group">
                <label htmlFor="submissionDate">
                  Submission Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  id="submissionDate"
                  name="submissionDate"
                  placeholder="Submission Date"
                  value={formData.submissionDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Tender Opening Date */}
              <div className="form-group">
                <label htmlFor="tenderOpeningDate">
                  Tender Opening Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  id="tenderOpeningDate"
                  name="tenderOpeningDate"
                  placeholder="Tender Opening Date"
                  value={formData.tenderOpeningDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Tender Closing Date */}
              <div className="form-group">
                <label htmlFor="tenderClosingDate">
                  Tender Closing Date <span className="required">*</span>
                </label>
                <input
                  type="date"
                  id="tenderClosingDate"
                  name="tenderClosingDate"
                  placeholder="Tender Closing Date"
                  value={formData.tenderClosingDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Pre-bid Meeting Date */}
              <div className="form-group">
                <label htmlFor="prebidMeetingDate">
                  Pre-bid Meeting Date
                </label>
                <input
                  type="date"
                  id="prebidMeetingDate"
                  name="prebidMeetingDate"
                  placeholder="Pre-bid Meeting Date"
                  value={formData.prebidMeetingDate}
                  onChange={handleInputChange}
                />
              </div>

              {/* Tender Type */}
              <div className="form-group">
                <label htmlFor="tenderType">
                  Tender Type <span className="required">*</span>
                </label>
                <select
                  id="tenderType"
                  name="tenderType"
                  value={formData.tenderType}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Tender Type</option>
                  <option value="open">Open Tender</option>
                  <option value="limited">Limited Tender</option>
                  <option value="eoi">Expression of Interest</option>
                  <option value="gem">GeM</option>
                  <option value="non-gem">Non-GeM</option>
                </select>
              </div>

              {/* Tender Category */}
              <div className="form-group">
                <label htmlFor="tenderCategory">
                  Tender Category <span className="required">*</span>
                </label>
                <select
                  id="tenderCategory"
                  name="tenderCategory"
                  value={formData.tenderCategory}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Category</option>
                  <option value="goods">Goods</option>
                  <option value="services">Services</option>
                  <option value="works">Works</option>
                  <option value="consultancy">Consultancy</option>
                </select>
              </div>

              {/* State */}
              <div className="form-group">
                <label htmlFor="state">
                  State <span className="required">*</span>
                </label>
                <select
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select State</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Telangana">Telangana</option>
                  <option value="Gujarat">Gujarat</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                </select>
              </div>

              {/* City */}
              <div className="form-group">
                <label htmlFor="city">
                  City <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Pincode */}
              <div className="form-group">
                <label htmlFor="pincode">
                  Pincode
                </label>
                <input
                  type="text"
                  id="pincode"
                  name="pincode"
                  placeholder="Pincode"
                  value={formData.pincode}
                  onChange={handleInputChange}
                />
              </div>

              {/* Department */}
              <div className="form-group">
                <label htmlFor="department">
                  Department <span className="required">*</span>
                </label>
                <input
                  type="text"
                  id="department"
                  name="department"
                  placeholder="Department"
                  value={formData.department}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Quantity */}
              <div className="form-group">
                <label htmlFor="quantity">
                  Quantity <span className="required">*</span>
                </label>
                <input
                  type="number"
                  id="quantity"
                  name="quantity"
                  placeholder="Quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  required
                />
              </div>

              {/* Unit */}
              <div className="form-group">
                <label htmlFor="unit">
                  Unit
                </label>
                <input
                  type="text"
                  id="unit"
                  name="unit"
                  placeholder="Unit (e.g., Nos, Kg, Meter)"
                  value={formData.unit}
                  onChange={handleInputChange}
                />
              </div>

              {/* Description */}
              <div className="form-group full-width">
                <label htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  placeholder="Detailed Description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="4"
                />
              </div>

              {/* Eligibility Criteria */}
              <div className="form-group full-width">
                <label htmlFor="eligibilityCriteria">
                  Eligibility Criteria
                </label>
                <textarea
                  id="eligibilityCriteria"
                  name="eligibilityCriteria"
                  placeholder="Eligibility Criteria"
                  value={formData.eligibilityCriteria}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>

              {/* Technical Specifications */}
              <div className="form-group full-width">
                <label htmlFor="technicalSpecifications">
                  Technical Specifications
                </label>
                <textarea
                  id="technicalSpecifications"
                  name="technicalSpecifications"
                  placeholder="Technical Specifications"
                  value={formData.technicalSpecifications}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>
            </div>

            {/* Document Upload Section */}
            <div className="document-section">
              <h3>Document</h3>
              <div className="upload-group">
                <label htmlFor="fileUpload">Upload File :</label>
                <input
                  type="file"
                  id="fileUpload"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                />
                {formData.uploadedFile && (
                  <span className="file-name">{formData.uploadedFile.name}</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="form-actions">
              <button type="submit" className="btn-submit">
                Submit
              </button>
              <button type="button" onClick={handleClear} className="btn-clear">
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}