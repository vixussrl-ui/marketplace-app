"""
FastAPI backend with SQLite persistence.
Run with: python backend_sqlite.py
Access at: http://localhost:8001
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import httpx
import base64
import os
import sqlite3
import json
import hashlib
import secrets
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./data.db")

# Database setup
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
conn.row_factory = sqlite3.Row


def init_db():
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_label TEXT NOT NULL,
            platform INTEGER NOT NULL,
            client_id TEXT NOT NULL,
            client_secret TEXT NOT NULL,
            vendor_code TEXT NOT NULL,
            last_sync TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            credential_id INTEGER NOT NULL,
            platform_order_id TEXT NOT NULL,
            status TEXT,
            order_type INTEGER,
            vendor_code TEXT,
            created_at TEXT,
            items TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (credential_id) REFERENCES credentials(id)
        );
        """
    )
    conn.commit()


def row_to_dict(row):
    return dict(row) if row else None


# Simple password hashing using hashlib
def hash_password(password: str) -> str:
    salt = secrets.token_hex(32)
    hash_obj = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${hash_obj.hex()}"


def verify_password(password: str, hash_str: str) -> bool:
    try:
        salt, hash_hex = hash_str.split("$")
        hash_obj = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return hash_obj.hex() == hash_hex
    except Exception:
        return False


init_db()

app = FastAPI(title="Marketplace Admin API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class Order(BaseModel):
    id: str
    platform_order_id: str
    status: str
    order_type: int
    vendor_code: str
    created_at: str
    items: List[dict] = []


class Credential(BaseModel):
    id: int
    account_label: str
    platform: str
    client_id: str
    vendor_code: str
    last_sync: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


# EMAG Client
class EMAGClient:
    def __init__(self, client_id, client_secret, vendor_code):
        self.client_id = client_id
        self.client_secret = client_secret
        self.vendor_code = vendor_code
        self.api_url = "https://marketplace-api.emag.ro/api-3/order/read"
        self.status_map = {
            0: "canceled",
            1: "new",
            2: "in progress",
            3: "prepared",
            4: "finalized",
            5: "returned",
        }

    def _get_auth_header(self):
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"

    async def fetch_orders(self, statuses=None, page=1):
        if statuses is None:
            statuses = [1, 2, 3]
        try:
            headers = {
                "Authorization": self._get_auth_header(),
                "Content-Type": "application/json",
            }
            payload = {
                "data": {
                    "itemsPerPage": 100,
                    "currentPage": page,
                    "status": statuses,
                }
            }

            print(f"[EMAG] Fetching orders with payload: {payload}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(self.api_url, json=payload, headers=headers)
                print(f"[EMAG] Response status: {response.status_code}")

                response.raise_for_status()
                data = response.json()

                if data.get("isError"):
                    error_msg = data.get("messages", ["Unknown error"])
                    print(f"[ERROR] EMAG API error: {error_msg}")
                    return []

                orders = []
                raw_orders = data.get("results", [])
                print(f"[EMAG] Processing {len(raw_orders)} orders")

                for order in raw_orders:
                    status_val = order.get("status")
                    status_text = self.status_map.get(status_val, str(status_val))

                    items = []
                    for item in order.get("products", []):
                        item_data = {
                            "sku": item.get("part_number")
                            or item.get("ext_part_number")
                            or "N/A",
                            "name": item.get("name")
                            or item.get("product_name")
                            or "Unknown Product",
                            "qty": item.get("quantity", 0),
                            "price": item.get("sale_price", 0),
                        }
                        items.append(item_data)

                    order_data = {
                        "order_id": str(order.get("id")),
                        "status": status_text,
                        "order_type": order.get("type", 3),
                        "vendor_code": self.vendor_code,
                        "created_at": order.get("date") or order.get("created"),
                        "items": items,
                    }
                    orders.append(order_data)

                print(f"[OK] Successfully parsed {len(orders)} orders")
                return orders
        except Exception as e:
            print(f"[ERROR] Error fetching EMAG orders: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return []


# Trendyol Client
class TrendyolClient:
    def __init__(self, supplier_id, api_key, api_secret):
        self.supplier_id = supplier_id
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://apigw.trendyol.com"
        self.status_map = {
            "Awaiting": "awaiting",
            "Created": "new",
            "Picking": "processing",
            "Invoiced": "invoiced",
            "Shipped": "shipped",
            "Delivered": "delivered",
            "UnDelivered": "undelivered",
            "Cancelled": "cancelled",
            "Returned": "returned",
            "AtCollectionPoint": "at collection point",
            "UnPacked": "unpacked",
            "UnSupplied": "unsupplied",
        }

    def _get_auth_header(self):
        credentials = f"{self.api_key}:{self.api_secret}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"

    async def fetch_orders(self, status="Created", page=0, size=200, start_ms=None, end_ms=None):
        try:
            url = f"{self.base_url}/integration/order/sellers/{self.supplier_id}/orders"
            params = {
                "status": status,
                "page": page,
                "size": size,
                "orderByField": "PackageLastModifiedDate",
                "orderByDirection": "DESC",
            }
            if start_ms is not None:
                params["startDate"] = int(start_ms)
            if end_ms is not None:
                params["endDate"] = int(end_ms)

            headers = {
                "Authorization": self._get_auth_header(),
                "Content-Type": "application/json",
                "User-Agent": f"{self.supplier_id} - SelfIntegration",
            }

            print(f"[TRENDYOL] Fetching orders from {url} with params: {params}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers, params=params)
                print(f"[TRENDYOL] Response status: {response.status_code}")

                if response.status_code == 401:
                    print(f"[ERROR] TRENDYOL Authentication failed (401)")
                    return [], 0, 0

                response.raise_for_status()
                data = response.json()

                orders = []
                raw_orders = data.get("content", [])
                total_elements = data.get("totalElements", 0)
                total_pages = data.get("totalPages", 0)
                print(f"[TRENDYOL] Processing {len(raw_orders)} orders (page {page + 1}/{total_pages}, total: {total_elements})")

                for order in raw_orders:
                    status_text = self.status_map.get(
                        order.get("status"), order.get("status", "unknown")
                    )

                    items = []
                    for line in order.get("lines", []):
                        item_data = {
                            "sku": line.get("merchantSku")
                            or line.get("sku")
                            or "N/A",
                            "name": line.get("productName") or "Unknown Product",
                            "qty": line.get("quantity", 0),
                            "price": float(line.get("price", 0))
                            if line.get("price")
                            else 0,
                        }
                        items.append(item_data)

                    order_data = {
                        "order_id": str(order.get("orderNumber")),
                        "status": status_text,
                        "order_type": 3,
                        "vendor_code": "trendyol",
                        "created_at": self._convert_timestamp(order.get("orderDate")),
                        "items": items,
                    }
                    orders.append(order_data)

                print(f"[OK] Successfully parsed {len(orders)} Trendyol orders")
                return orders, total_pages, total_elements
        except Exception as e:
            print(f"[ERROR] Error fetching Trendyol orders: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return [], 0, 0

    def _convert_timestamp(self, timestamp_ms):
        if not timestamp_ms:
            return None
        try:
            timestamp_s = int(timestamp_ms) / 1000
            dt = datetime.fromtimestamp(timestamp_s)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception as e:
            print(f"[TRENDYOL] Error converting timestamp: {e}")
            return str(timestamp_ms)


@app.get("/")
async def root():
    return {"message": "Marketplace Admin API"}


@app.get("/health")
async def health():
    return {"status": "ok", "db": DB_PATH}


def get_current_user(request: Request):
    """Extract user from token"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        try:
            user_id = int(token.split("-")[-1])
            cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            user = cur.fetchone()
            if user:
                return row_to_dict(user)
        except Exception:
            pass
    raise HTTPException(status_code=401, detail="Unauthorized")

def _clean_str(val: Optional[str]) -> str:
    if val is None:
        return ""
    return str(val).strip()


@app.post("/auth/login")
async def login(request: LoginRequest):
    cur = conn.execute("SELECT * FROM users WHERE email = ?", (request.email,))
    user = cur.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_d = row_to_dict(user)
    if not verify_password(request.password, user_d["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid password")

    return {
        "access_token": f"mock-token-{user_d['id']}",
        "token_type": "bearer",
        "user_id": user_d["id"],
        "name": user_d["name"],
    }


@app.post("/auth/logout")
async def logout():
    return {"message": "Logged out"}


@app.post("/auth/signup")
async def signup(request: SignupRequest):
    if not request.email or not request.password or not request.name:
        raise HTTPException(
            status_code=400, detail="Email, password, and name are required"
        )

    cur = conn.execute("SELECT 1 FROM users WHERE email = ?", (request.email,))
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Email already registered")

    if len(request.password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )

    now = datetime.now().isoformat()
    password_hash = hash_password(request.password)
    cur = conn.execute(
        """
        INSERT INTO users (email, password_hash, name, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (request.email, password_hash, request.name, now),
    )
    conn.commit()
    new_id = cur.lastrowid

    return {
        "access_token": f"mock-token-{new_id}",
        "token_type": "bearer",
        "user_id": new_id,
        "name": request.name,
        "message": "Account created successfully",
    }


@app.get("/platforms")
async def get_platforms():
    return [
        {"id": 1, "name": "emag", "display_name": "eMAG", "is_active": True},
        {"id": 2, "name": "trendyol", "display_name": "Trendyol", "is_active": True},
    ]


@app.post("/credentials")
async def create_credential(request: Request, data: dict):
    user = get_current_user(request)
    account_label = _clean_str(data.get("account_label"))
    platform_id = int(data.get("platform_id") or 0)
    client_id = _clean_str(data.get("client_id"))
    client_secret = _clean_str(data.get("client_secret"))
    vendor_code = _clean_str(data.get("vendor_code"))

    if not account_label or not platform_id:
        raise HTTPException(
            status_code=400, detail="account_label and platform_id are required"
        )
    if platform_id not in (1, 2):
        raise HTTPException(status_code=400, detail="Invalid platform_id")
    if not vendor_code:
        raise HTTPException(status_code=400, detail="vendor_code is required")
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id is required")
    if not client_secret:
        raise HTTPException(status_code=400, detail="client_secret is required")

    cur = conn.execute(
        """
        INSERT INTO credentials (user_id, account_label, platform, client_id, client_secret, vendor_code, last_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user["id"],
            account_label,
            platform_id,
            client_id,
            client_secret,
            vendor_code,
            None,
        ),
    )
    conn.commit()
    cred_id = cur.lastrowid

    cur = conn.execute(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?", (cred_id, user["id"])
    )
    return row_to_dict(cur.fetchone())


@app.get("/credentials")
async def list_credentials(request: Request):
    user = get_current_user(request)
    cur = conn.execute(
        "SELECT * FROM credentials WHERE user_id = ? ORDER BY id ASC", (user["id"],)
    )
    return [row_to_dict(r) for r in cur.fetchall()]


@app.put("/credentials/{cred_id}")
async def update_credential(cred_id: int, request: Request, data: dict):
    user = get_current_user(request)
    cur = conn.execute(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?",
        (cred_id, user["id"]),
    )
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Credential not found")

    fields = []
    values = []
    for key in ["account_label", "platform_id", "client_id", "client_secret", "vendor_code", "last_sync"]:
        if key in data and data[key] is not None:
            col = "platform" if key == "platform_id" else key
            val = data[key]
            if col in ("account_label", "client_id", "client_secret", "vendor_code"):
                val = _clean_str(val)
            if col == "platform":
                val = int(val)
                if val not in (1, 2):
                    raise HTTPException(status_code=400, detail="Invalid platform_id")
            if col == "vendor_code" and not val:
                raise HTTPException(status_code=400, detail="vendor_code is required")
            if col == "client_id" and not val:
                raise HTTPException(status_code=400, detail="client_id is required")
            if col == "client_secret" and not val:
                raise HTTPException(status_code=400, detail="client_secret is required")
            fields.append(f"{col} = ?")
            values.append(val)
    if fields:
        values.extend([cred_id, user["id"]])
        conn.execute(
            f"UPDATE credentials SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
            tuple(values),
        )
        conn.commit()

    cur = conn.execute(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?", (cred_id, user["id"])
    )
    return row_to_dict(cur.fetchone())


@app.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: int, request: Request):
    user = get_current_user(request)
    cur = conn.execute(
        "DELETE FROM credentials WHERE id = ? AND user_id = ?", (cred_id, user["id"])
    )
    conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Credential not found")
    return {"message": "Deleted"}


@app.get("/orders")
async def list_orders(request: Request, credential_id: Optional[int] = None):
    user = get_current_user(request)
    
    # Statusuri permise:
    # EMAG: "new" (1) și "in progress" (2)
    # Trendyol: "new" (Created) și "picking" (în procesare)
    allowed_statuses = ['new', 'in progress', 'picking']
    
    if credential_id:
        cur = conn.execute(
            """
            SELECT * FROM orders
            WHERE user_id = ? AND credential_id = ?
            ORDER BY created_at DESC
            """,
            (user["id"], credential_id),
        )
    else:
        cur = conn.execute(
            """
            SELECT * FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user["id"],),
        )
    rows = cur.fetchall()
    print(f"[ORDERS] Found {len(rows)} total orders for user {user['id']}, credential_id={credential_id}")
    
    results = []
    filtered_count = 0
    for r in rows:
        d = row_to_dict(r)
        try:
            d["items"] = json.loads(d.get("items") or "[]")
        except Exception:
            d["items"] = []
        
        # Filtrăm - afișăm doar comenzile active (new, in progress, picking)
        if d.get("status", "").lower() not in allowed_statuses:
            filtered_count += 1
            print(f"[ORDERS]   - FILTERED Order {d['platform_order_id']}, Status: {d['status']} (not active)")
            continue
            
        print(f"[ORDERS]   + ACTIVE Order {d['platform_order_id']}, Status: {d['status']}, Credential: {d['credential_id']}")
        results.append(d)
    
    print(f"[ORDERS] Returning {len(results)} active orders (filtered out {filtered_count} orders)")
    
    return results


@app.get("/test/trendyol/{credential_id}")
async def test_trendyol(credential_id: int, request: Request):
    """Endpoint de test pentru a verifica ce returnează API-ul Trendyol"""
    user = get_current_user(request)
    
    cur = conn.execute(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?",
        (credential_id, user["id"]),
    )
    cred = cur.fetchone()
    
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    
    cred_d = row_to_dict(cred)
    
    client = TrendyolClient(
        supplier_id=cred_d.get("vendor_code") or cred_d.get("client_id"),
        api_key=cred_d.get("client_id"),
        api_secret=cred_d.get("client_secret", ""),
    )
    
    # Test fără filtre de dată pentru a vedea toate comenzile
    print(f"[TEST] Testing Trendyol API without date filters")
    test_results = []
    
    for status in ["Delivered", "Created", "Picking", "Invoiced", "Shipped"]:
        print(f"[TEST] Fetching {status} orders...")
        orders, total_pages, total_elements = await client.fetch_orders(
            status=status, page=0, size=200
        )
        print(f"[TEST] Status {status}: {len(orders)} orders, {total_pages} pages, {total_elements} total")
        test_results.append({
            "status": status,
            "orders_count": len(orders),
            "total_pages": total_pages,
            "total_elements": total_elements,
            "sample_orders": [o["order_id"] for o in orders[:5]]
        })
    
    return {"test_results": test_results}

@app.post("/orders/refresh")
async def refresh_orders(request: Request):
    print(f"[REFRESH] Refresh request started")
    user = get_current_user(request)

    try:
        request_body = await request.json()
    except Exception:
        request_body = {}

    print(f"[REFRESH] Request data: {request_body}")
    cred_id = request_body.get("credential_id")
    print(f"[REFRESH] Looking for credential ID: {cred_id}")

    cur = conn.execute(
        "SELECT * FROM credentials WHERE id = ? AND user_id = ?",
        (cred_id, user["id"]),
    )
    cred = cur.fetchone()

    if not cred:
        print(f"[REFRESH] Credential not found")
        raise HTTPException(status_code=404, detail="Credential not found")

    cred_d = row_to_dict(cred)
    platform = cred_d.get("platform", 1)
    print(f"[REFRESH] Using platform: {platform}")

    try:
        if platform == 1:
            print(f"[REFRESH] Fetching EMAG orders")
            client = EMAGClient(
                client_id=cred_d["client_id"],
                client_secret=cred_d.get("client_secret", ""),
                vendor_code=cred_d["vendor_code"],
            )
            # DOAR comenzi noi (1) și in progress (2)
            print(f"[REFRESH][EMAG] Fetching ONLY 'new' (1) and 'in progress' (2) orders")
            new_orders = await client.fetch_orders(statuses=[1, 2])
        elif platform == 2:
            print(f"[REFRESH] Fetching Trendyol orders")
            try:
                client = TrendyolClient(
                    supplier_id=cred_d.get("vendor_code") or cred_d.get("client_id"),
                    api_key=cred_d.get("client_id"),
                    api_secret=cred_d.get("client_secret", ""),
                )
                print(f"[REFRESH] TrendyolClient created successfully")
                
                # Preluăm comenzile noi și în procesare
                status_list = [
                    "Created",          # Comenzi noi
                    "Picking",          # În procesare/pregătire
                ]
                print(f"[REFRESH][TRENDYOL] Fetching 'Created' (new) and 'Picking' (processing) orders")
                new_orders = []
                
                print(f"[REFRESH][TRENDYOL] Fetching ALL orders without date filters")
                for status in status_list:
                    print(f"[REFRESH] Fetching {status} orders...")
                    page = 0
                    max_pages = 100  # Limita de siguranță pentru pagini
                    while page < max_pages:
                        # Fără filtre de dată - preia toate comenzile pentru acest status
                        orders, total_pages, total_elements = await client.fetch_orders(
                            status=status, page=page, size=200
                        )
                        if not orders:
                            print(f"[REFRESH] No more orders for status {status} at page {page}")
                            break
                        new_orders.extend(orders)
                        print(f"[REFRESH] Got {len(orders)} orders status {status} page {page + 1}/{total_pages} (total elements: {total_elements})")
                        page += 1
                        # Dacă am ajuns la ultima pagină, oprim
                        if page >= total_pages:
                            print(f"[REFRESH] Reached last page ({total_pages}) for status {status}")
                            break
            except Exception as trendyol_error:
                print(f"[REFRESH] Trendyol error: {trendyol_error}")
                import traceback
                traceback.print_exc()
                new_orders = []
        else:
            print(f"[REFRESH] Unknown platform: {platform}")
            raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

        print(f"[REFRESH] Got {len(new_orders)} orders, updating database")
        
        # Pas 1: Colectăm ID-urile comenzilor care trebuie să rămână
        new_order_ids = set()
        for order in new_orders:
            order_id = f"{order['order_id']}-{cred_id}"
            new_order_ids.add(order_id)
            items_json = json.dumps(order.get("items", []))
            conn.execute(
                """
                INSERT INTO orders (id, user_id, credential_id, platform_order_id, status, order_type, vendor_code, created_at, items)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    platform_order_id=excluded.platform_order_id,
                    status=excluded.status,
                    order_type=excluded.order_type,
                    vendor_code=excluded.vendor_code,
                    created_at=excluded.created_at,
                    items=excluded.items
                """,
                (
                    order_id,
                    user["id"],
                    cred_id,
                    order["order_id"],
                    order.get("status"),
                    order.get("order_type"),
                    order.get("vendor_code"),
                    order.get("created_at"),
                    items_json,
                ),
            )
        
        # Pas 2: Ștergem comenzile vechi care nu mai sunt în lista nouă
        # (înseamnă că au fost procesate și nu mai sunt "new" sau "in progress")
        if new_order_ids:
            # Găsim comenzile vechi pentru acest credential
            cur = conn.execute(
                "SELECT id FROM orders WHERE user_id = ? AND credential_id = ?",
                (user["id"], cred_id),
            )
            old_order_ids = {row[0] for row in cur.fetchall()}
            
            # Comenzile care trebuie șterse = comenzi vechi care nu sunt în lista nouă
            orders_to_delete = old_order_ids - new_order_ids
            
            if orders_to_delete:
                print(f"[REFRESH] Deleting {len(orders_to_delete)} old/processed orders")
                for old_id in orders_to_delete:
                    conn.execute(
                        "DELETE FROM orders WHERE id = ? AND user_id = ? AND credential_id = ?",
                        (old_id, user["id"], cred_id),
                    )
        else:
            # Dacă nu sunt comenzi noi, ștergem TOATE comenzile vechi pentru acest credential
            print(f"[REFRESH] No new orders found, deleting all old orders for this credential")
            conn.execute(
                "DELETE FROM orders WHERE user_id = ? AND credential_id = ?",
                (user["id"], cred_id),
            )
        
        conn.execute(
            "UPDATE credentials SET last_sync = ? WHERE id = ? AND user_id = ?",
            (datetime.now().isoformat(), cred_id, user["id"]),
        )
        conn.commit()
        print(f"[REFRESH] Complete. Fetched {len(new_orders)} orders")
        return {"orders_fetched": len(new_orders), "message": "Refresh complete"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[REFRESH] Exception occurred: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("BACKEND_PORT", "8001"))
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    print(f"Starting backend with SQLite DB at {DB_PATH}")
    uvicorn.run(app, host=host, port=port)
