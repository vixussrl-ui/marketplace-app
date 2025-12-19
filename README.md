# Marketplace Admin App

Multi-marketplace order management application for EMAG and Trendyol.

## Features

- **Multi-Marketplace Support**: Manage orders from both EMAG and Trendyol in one place
- **Order Dashboard**: View all orders with marketplace indicator, status, and product details
- **Product Summary**: Track product quantities across marketplaces with a summary table showing:
  - EMAG quantity
  - Trendyol quantity
  - Total to prepare
- **Minimalist Design**: Clean, efficient UI for order management
- **Real-time Sync**: Refresh orders from all marketplaces with one click

## Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **HTTP Client**: httpx (async)
- **Authentication**: Basic Auth (Base64)
- **API Integration**: eMAG Marketplace API v4.5.0, Trendyol Integration API

### Frontend
- **Framework**: React 18+
- **UI Library**: Ant Design v5
- **HTTP Client**: axios
- **Build Tool**: Vite

## Setup

### Backend Setup

1. Install Python dependencies:
```bash
pip install fastapi uvicorn httpx
```

2. Run the backend:
```bash
python backend_sqlite.py
```

Backend will start on `http://0.0.0.0:8001`

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start development server:
```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

## API Endpoints

### Authentication
- `POST /auth/login` - Login user

### Credentials
- `GET /credentials` - List all credentials
- `POST /credentials` - Create new credential
- `PUT /credentials/{id}` - Update credential
- `DELETE /credentials/{id}` - Delete credential

### Orders
- `GET /orders` - Get all orders (optionally filtered by credential)
- `POST /orders/refresh` - Refresh orders from marketplace
- `GET /platforms` - Get available platforms

## Configuration

All credentials should be configured through the application UI:
1. Login to the application
2. Go to **Settings** → **Platform Integrations**
3. Click **Add Credential** and enter your marketplace credentials
4. For EMAG: Add your email, password, and vendor code
5. For Trendyol: Add your API key, API secret, and Seller ID

**Important**: Never commit real credentials to the repository. All sensitive data is stored securely in the database.

## Order Statuses

### EMAG
- new (1)
- processing (2)
- prepared (3)
- finalized (4)
- cancelled (0)
- returned (5)

### Trendyol
- awaiting
- new (Created)
- processing (Picking)
- invoiced
- shipped
- delivered
- undelivered
- cancelled
- returned
- at collection point

## Project Structure

```
marketplace-app/
├── backend_sqlite.py       # FastAPI backend
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── theme/          # Theme constants
│   │   └── api.js          # API client
│   ├── package.json
│   └── vite.config.js
└── .gitignore
```

## License

Proprietary - VIXUS SRL

## Support

For issues or questions, contact support@vixus.ro
