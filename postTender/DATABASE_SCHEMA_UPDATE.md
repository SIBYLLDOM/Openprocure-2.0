# Database Schema Update - Participated Tenders & EMD Received

## Overview

Updated the postTender database schema to use two new tables: `participated_tenders` and `emd_received`, replacing the old `won_bids` and `emd_records` tables.

## 📊 New Database Tables

### 1. **participated_tenders** Table

Stores information about all tenders that the company has participated in.

**Columns:**

- `id` - INT, Auto Increment, Primary Key
- `bid_no` - VARCHAR(100), Unique, NOT NULL
- `won_status` - ENUM('Won','Lost','Pending'), Default: 'Pending'
- `won_date` - DATE
- `emd_status` - ENUM('Received','Not Received','Pending'), Default: 'Not Received'
- `emd_amt` - DECIMAL(15,2)
- `loa_status` - ENUM('Received','Not Received','Pending'), Default: 'Not Received'
- `loa_file_path` - VARCHAR(500)
- `buying_mode` - ENUM('Direct','Bid/RA'), NOT NULL
- `buying_origin` - ENUM('GEM','OPEN'), NOT NULL
- `created_at` - TIMESTAMP, Default: CURRENT_TIMESTAMP
- `updated_at` - TIMESTAMP, Default: CURRENT_TIMESTAMP ON UPDATE

**Indexes:**

- `idx_bid_no` on `bid_no`
- `idx_won_status` on `won_status`
- `idx_won_date` on `won_date`
- `idx_buying_origin` on `buying_origin`

### 2. **emd_received** Table

Stores EMD (Earnest Money Deposit) received records.

**Columns:**

- `id` - INT, Auto Increment, Primary Key
- `bid_no` - VARCHAR(100), NOT NULL, Foreign Key
- `emd_amt` - DECIMAL(15,2)
- `submitted_date` - DATE
- `requested_date` - DATE
- `emd_status` - ENUM('Submitted','Pending','Refunded','Forfeited'), Default: 'Pending'
- `item_category` - VARCHAR(255)
- `bank_detail` - TEXT
- `created_at` - TIMESTAMP, Default: CURRENT_TIMESTAMP
- `updated_at` - TIMESTAMP, Default: CURRENT_TIMESTAMP ON UPDATE

**Foreign Key:**

- `bid_no` REFERENCES `participated_tenders(bid_no)` ON DELETE CASCADE

**Indexes:**

- `idx_bid_no` on `bid_no`
- `idx_emd_status` on `emd_status`
- `idx_submitted_date` on `submitted_date`

## 🔄 Schema Changes

### Updated Foreign Keys

The following tables were updated to reference `participated_tenders(bid_no)` instead of `won_bids(id)`:

1. **pbg_records**

   - Changed: `bid_id INT` → `bid_no VARCHAR(100)`
   - Foreign Key: `bid_no` REFERENCES `participated_tenders(bid_no)`
2. **orders**

   - Changed: `bid_id INT` → `bid_no VARCHAR(100)`
   - Foreign Key: `bid_no` REFERENCES `participated_tenders(bid_no)`
3. **loa_records**

   - Changed: `bid_id INT` → `bid_no VARCHAR(100)`
   - Foreign Key: `bid_no` REFERENCES `participated_tenders(bid_no)`

## 🔌 Backend API Endpoints

### Participated Tenders API

**Base URL:** `/api/participated-tenders`

| Method | Endpoint    | Description                  |
| ------ | ----------- | ---------------------------- |
| GET    | `/`       | Get all participated tenders |
| GET    | `/:bidNo` | Get tender by bid number     |
| POST   | `/`       | Create new tender            |
| PUT    | `/:bidNo` | Update tender                |
| DELETE | `/:bidNo` | Delete tender                |

### EMD Received API

**Base URL:** `/api/emd-received`

| Method | Endpoint     | Description                    |
| ------ | ------------ | ------------------------------ |
| GET    | `/summary` | Get EMD summary/dashboard data |
| GET    | `/`        | Get all EMD received records   |
| GET    | `/:bidNo`  | Get EMD by bid number          |
| POST   | `/`        | Create new EMD record          |
| PUT    | `/:id`     | Update EMD record              |
| DELETE | `/:id`     | Delete EMD record              |

## 📁 Files Created/Modified

### Backend Files Created:

1. ✅ `src/controllers/participatedTenders.controller.js` - CRUD operations
2. ✅ `src/controllers/emdReceived.controller.js` - CRUD operations + summary
3. ✅ `src/routes/participatedTenders.routes.js` - API routes
4. ✅ `src/routes/emdReceived.routes.js` - API routes

### Backend Files Modified:

1. ✅ `src/app.js` - Added new routes
2. ✅ `database/schema.sql` - Updated schema

### Frontend Files Modified:

1. ✅ `src/pages/won_summary.jsx` - Updated to fetch from API

## 🔄 Frontend Integration

### won_summary.jsx Updates

**Changes Made:**

1. Added `useEffect` hook to fetch data on component mount
2. Added `loading` and `error` states
3. Replaced dummy data with API fetch from `/api/participated-tenders`
4. Added data transformation to match component structure
5. Added loading spinner and error handling UI

**API Integration:**

```javascript
const fetchParticipatedTenders = async () => {
    const response = await fetch(`${API_BASE_URL}/participated-tenders`);
    const result = await response.json();
  
    if (result.success) {
        const transformedData = result.data.map(tender => ({
            id: tender.id,
            bidNumber: tender.bid_no,
            wonDate: formatDate(tender.won_date),
            loaStatus: tender.loa_status,
            emdStatus: tender.emd_status,
            buyingMode: tender.buying_mode,
            orderOrigin: tender.buying_origin,
            // ... additional fields
        }));
        setAllBidsData(transformedData);
    }
};
```

## 🧪 Testing

### 1. Database Setup

```sql
-- Run the schema
mysql -u root -p < database/schema.sql
```

### 2. Test API Endpoints

**Get All Tenders:**

```bash
GET https://post-api.openprocure.ai/api/participated-tenders
```

**Create New Tender:**

```bash
POST https://post-api.openprocure.ai/api/participated-tenders
Content-Type: application/json

{
  "bid_no": "GEM/2025/B/123456",
  "won_status": "Won",
  "won_date": "2025-02-05",
  "emd_status": "Received",
  "emd_amt": 50000,
  "loa_status": "Received",
  "buying_mode": "Direct",
  "buying_origin": "GEM"
}
```

**Get EMD Summary:**

```bash
GET https://post-api.openprocure.ai/api/emd-received/summary
```

### 3. Frontend Testing

1. Start backend: `npm run dev` (in backend folder)
2. Start frontend: `npm run dev` (in frontend folder)
3. Navigate to: `http://localhost:5173/Admin/tenders/bid-result`
4. Should see loading state, then data from database

## 📋 Migration Notes

### Data Migration (If Needed)

If you have existing data in `won_bids` and `emd_records`, you'll need to migrate it:

```sql
-- Migrate won_bids to participated_tenders
INSERT INTO participated_tenders (bid_no, won_status, won_date, emd_status, emd_amt, loa_status, buying_mode, buying_origin)
SELECT 
    bid_number as bid_no,
    'Won' as won_status,
    won_date,
    emd_status,
    NULL as emd_amt,
    loa_status,
    buying_mode,
    order_origin as buying_origin
FROM won_bids;

-- Migrate emd_records to emd_received
INSERT INTO emd_received (bid_no, emd_amt, submitted_date, requested_date, emd_status, bank_detail)
SELECT 
    wb.bid_number as bid_no,
    er.amount as emd_amt,
    er.received_date as submitted_date,
    er.request_date as requested_date,
    CASE 
        WHEN er.status = 'Received' THEN 'Submitted'
        ELSE er.status
    END as emd_status,
    er.bank_name as bank_detail
FROM emd_records er
JOIN won_bids wb ON er.bid_id = wb.id;
```

## ✅ Completion Checklist

- ✅ Created `participated_tenders` table
- ✅ Created `emd_received` table
- ✅ Updated foreign key references in related tables
- ✅ Created backend controllers for both tables
- ✅ Created API routes for both tables
- ✅ Updated `app.js` with new routes
- ✅ Updated `won_summary.jsx` to fetch from API
- ✅ Added loading and error states to frontend
- ✅ Documented all changes

---

**Status**: ✅ **COMPLETE**
**Last Updated**: 2026-02-05
**Database Version**: 2.0


SELECT dept, contract_no, contract_url from orders_rows WHERE opi_generation = "pending for creation";
