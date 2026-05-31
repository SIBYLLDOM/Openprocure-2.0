# Post-Tender Management Backend

Backend API for the Post-Tender Management System - handles post-award tender processes including EMD, PBG, orders, logistics, and compliance.

## 🚀 Features

- **Bid Management**: Track won bids and their status
- **EMD Management**: Earnest Money Deposit tracking and analytics
- **PBG Generation**: AI-powered Performance Bank Guarantee letter generation
  - Supports both GeM and OPEN tender formats
  - PDF extraction and parsing
  - Template-based or OpenAI-powered generation
  - DOCX export functionality
- **Order Management**: Order punching and tracking
- **Logistics**: Dispatch and delivery management
- **Compliance**: Certificate and document management
- **Authentication**: JWT-based user authentication

## 📋 Prerequisites

- Node.js >= 18.0.0
- MySQL >= 8.0
- (Optional) OpenAI API key for AI-powered PBG generation

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update:
   - Database credentials (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)
   - JWT secret key
   - (Optional) OpenAI API key for PBG generation

3. **Create database:**
   ```bash
   mysql -u root -p < database/schema.sql
   ```

## 🚀 Running the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on:
- **Local**: https://post-api.openprocure.ai
- **Network**: http://0.0.0.0:5000 (accessible via your local IP)

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user

### Bids
- `GET /api/bids/won` - Get all won bids
- `GET /api/bids/:id` - Get bid by ID
- `POST /api/bids` - Create new bid
- `PATCH /api/bids/:id/status` - Update bid status

### EMD (Earnest Money Deposit)
- `GET /api/emd/summary` - Get EMD summary
- `GET /api/emd/dashboard` - Get EMD analytics dashboard
- `PATCH /api/emd/:bidId/status` - Update EMD status

### PBG (Performance Bank Guarantee)
- `GET /api/pbg/overview` - Get PBG overview
- `GET /api/pbg/tracker` - Get PBG tracker
- `POST /api/pbg/upload` - Upload PBG document

### PBG Generation (AI-Powered)
- `POST /api/extract-pdf` - Extract text from PDF
- `POST /api/generate-pbg` - Generate PBG letter content
- `POST /api/generate-docx` - Generate DOCX from PBG data

### Orders
- `GET /api/orders/overview` - Get orders overview
- `GET /api/orders/punching` - Get order punching data
- `POST /api/orders` - Create new order

### Logistics
- `GET /api/logistics/dispatch` - Get dispatch data
- `PATCH /api/logistics/dispatch/:id` - Update dispatch status

## 🔧 Configuration

### Database
The system uses MySQL with connection pooling (max 10 connections). Configure in `.env`:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=posttender_db
```

### CORS
Configure allowed origins in `.env`:
```env
CORS_ORIGINS=http://localhost:5173,http://192.168.1.3:5173
```

### OpenAI (Optional)
For AI-powered PBG generation:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

If not configured, the system will use template-based generation as fallback.

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── db.js                 # Database configuration
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── bids.controller.js
│   │   ├── emd.controller.js
│   │   ├── pbg.controller.js
│   │   ├── pbgGeneration.controller.js  # AI-powered PBG generation
│   │   ├── orders.controller.js
│   │   └── logistics.controller.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── bids.routes.js
│   │   ├── emd.routes.js
│   │   ├── pbg.routes.js
│   │   ├── pbgGeneration.routes.js
│   │   ├── orders.routes.js
│   │   └── logistics.routes.js
│   ├── app.js                    # Express app configuration
│   └── server.js                 # Server entry point
├── database/
│   └── schema.sql                # Database schema
├── .env.example                  # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## 🔐 Security

- Helmet.js for security headers
- CORS configuration
- JWT authentication
- Password hashing with bcrypt
- Input validation

## 📝 Development Status

### ✅ Implemented
- Server setup and configuration
- Database connection
- PBG generation (PDF extraction, AI generation, DOCX export)
- Basic route structure
- Mock data for development

### 🚧 To Do
- Complete database CRUD operations
- Implement authentication middleware
- Add input validation
- Add file upload handling for documents
- Implement email notifications
- Add logging system
- Write unit tests

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

## 📄 License

ISC
