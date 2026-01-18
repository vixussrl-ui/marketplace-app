"""
Script helper pentru a obține OAuth Access Token de la Etsy
Acest script te ghidează prin procesul de obținere a unui access token.
"""

import secrets
import hashlib
import base64
import urllib.parse
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import time

class OAuthHandler(BaseHTTPRequestHandler):
    """Handler pentru callback-ul OAuth de la Etsy"""
    auth_code = None
    state = None
    
    def do_GET(self):
        """Procesează callback-ul de la Etsy"""
        query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        
        if 'code' in query_params:
            OAuthHandler.auth_code = query_params['code'][0]
            OAuthHandler.state = query_params.get('state', [None])[0]
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"""
                <html>
                <head><title>Etsy OAuth Success</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1 style="color: green;">✓ Autorizare reușită!</h1>
                    <p>Poți închide această fereastră și să revii la terminal.</p>
                    <p>Codul de autorizare a fost capturat.</p>
                </body>
                </html>
            """)
        else:
            error = query_params.get('error', ['Unknown error'])[0]
            self.send_response(400)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(f"""
                <html>
                <head><title>Etsy OAuth Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1 style="color: red;">✗ Eroare: {error}</h1>
                    <p>Te rugăm să încerci din nou.</p>
                </body>
                </html>
            """.encode())
    
    def log_message(self, format, *args):
        """Suprimă log-urile"""
        pass

def generate_code_verifier():
    """Generează un code_verifier pentru PKCE"""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

def generate_code_challenge(verifier):
    """Generează code_challenge din code_verifier folosind S256"""
    sha256 = hashlib.sha256(verifier.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(sha256).decode('utf-8').rstrip('=')

def start_callback_server(port=8080):
    """Pornește un server local pentru a primi callback-ul OAuth"""
    server = HTTPServer(('localhost', port), OAuthHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    return server, thread

def main():
    print("=" * 60)
    print("Ghid pentru obținerea Etsy OAuth Access Token")
    print("=" * 60)
    print()
    
    # Pasul 1: Informații de bază
    print("📋 PASUL 1: Informații necesare")
    print("-" * 60)
    print("Înainte de a continua, asigură-te că ai:")
    print("  1. Un cont Etsy")
    print("  2. O aplicație înregistrată pe Etsy Developer Portal")
    print("     → https://www.etsy.com/developers/register")
    print()
    print("Dacă nu ai o aplicație înregistrată:")
    print("  1. Mergi la: https://www.etsy.com/developers/register")
    print("  2. Completează formularul (nume aplicație, descriere, etc.)")
    print("  3. După înregistrare, vei primi:")
    print("     - API Key (Keystring) - acesta este Client ID-ul tău")
    print("     - Shared Secret - acesta este Client Secret-ul tău")
    print()
    
    input("Apasă ENTER când ai aplicația înregistrată și ai API Key-ul...")
    print()
    
    # Pasul 2: Colectare informații
    print("📝 PASUL 2: Introdu informațiile aplicației")
    print("-" * 60)
    client_id = input("Introdu API Key (Keystring) de la Etsy: ").strip()
    
    if not client_id:
        print("❌ API Key este obligatoriu!")
        return
    
    print()
    print("🔗 PASUL 3: Configurare Callback URL")
    print("-" * 60)
    print("În Etsy Developer Portal, la aplicația ta:")
    print("  1. Mergi la: https://www.etsy.com/developers/your-apps")
    print("  2. Selectează aplicația ta")
    print("  3. Adaugă în 'OAuth redirect URI' următoarea adresă:")
    print(f"     → http://localhost:8080/oauth/callback")
    print()
    
    input("Apasă ENTER când ai configurat Callback URL-ul...")
    print()
    
    # Pasul 4: Generare PKCE
    print("🔐 PASUL 4: Generare coduri de securitate")
    print("-" * 60)
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)
    state = secrets.token_urlsafe(32)
    
    print("✓ Code verifier generat")
    print("✓ Code challenge generat")
    print("✓ State generat")
    print()
    
    # Pasul 5: Construire URL autorizare
    print("🌐 PASUL 5: Deschidere browser pentru autorizare")
    print("-" * 60)
    
    redirect_uri = "http://localhost:8080/oauth/callback"
    scopes = "transactions_r shops_r"  # Permisiuni pentru a citi comenzile
    
    auth_params = {
        'response_type': 'code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'scope': scopes,
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256'
    }
    
    auth_url = f"https://www.etsy.com/oauth/connect?{urllib.parse.urlencode(auth_params)}"
    
    print("Voi deschide browser-ul pentru a autoriza aplicația...")
    print(f"URL: {auth_url}")
    print()
    
    # Pornește serverul pentru callback
    server, thread = start_callback_server(8080)
    print("✓ Server local pornit pe portul 8080")
    print()
    
    # Deschide browser-ul
    webbrowser.open(auth_url)
    
    print("⏳ Aștept autorizarea în browser...")
    print("   (După ce autorizezi, revino aici)")
    print()
    
    # Așteaptă callback-ul
    timeout = 300  # 5 minute
    start_time = time.time()
    
    while OAuthHandler.auth_code is None:
        if time.time() - start_time > timeout:
            print("❌ Timeout! Nu s-a primit codul de autorizare.")
            server.shutdown()
            return
        time.sleep(0.5)
    
    auth_code = OAuthHandler.auth_code
    server.shutdown()
    
    print("✓ Cod de autorizare primit!")
    print()
    
    # Pasul 6: Obținere Access Token
    print("🎫 PASUL 6: Obținere Access Token")
    print("-" * 60)
    
    try:
        import requests
    except ImportError:
        print("❌ Modulul 'requests' nu este instalat.")
        print("   Instalează-l cu: pip install requests")
        return
    
    token_url = "https://api.etsy.com/v3/public/oauth/token"
    token_data = {
        'grant_type': 'authorization_code',
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'code': auth_code,
        'code_verifier': code_verifier
    }
    
    print("Trimitere cerere pentru access token...")
    
    try:
        response = requests.post(token_url, data=token_data)
        response.raise_for_status()
        token_response = response.json()
        
        access_token = token_response.get('access_token')
        refresh_token = token_response.get('refresh_token')
        
        if access_token:
            print()
            print("=" * 60)
            print("✅ SUCCES! Access Token obținut!")
            print("=" * 60)
            print()
            print("📋 Informații pentru aplicație:")
            print("-" * 60)
            print(f"Access Token: {access_token}")
            print()
            print("💾 Salvează aceste informații:")
            print(f"   Client ID: {client_id}")
            print(f"   Access Token: {access_token}")
            if refresh_token:
                print(f"   Refresh Token: {refresh_token}")
            print()
            print("📝 Când adaugi credențialele în aplicație:")
            print("   - Account Label: orice nume (ex: 'Etsy Shop')")
            print("   - Platform: Etsy")
            print(f"   - Client ID: {access_token}  ← Access Token aici!")
            print("   - Client Secret: (poate fi lăsat gol)")
            print("   - Vendor Code: Shop ID-ul tău de pe Etsy")
            print()
            
            # Obține Shop ID
            print("🔍 Obținere Shop ID...")
            headers = {'Authorization': f'Bearer {access_token}'}
            shops_response = requests.get('https://api.etsy.com/v3/application/users/me/shops', headers=headers)
            
            if shops_response.status_code == 200:
                shops = shops_response.json().get('results', [])
                if shops:
                    shop_id = shops[0].get('shop_id')
                    shop_name = shops[0].get('shop_name', 'N/A')
                    print(f"✓ Shop ID găsit: {shop_id} ({shop_name})")
                    print()
                    print(f"   Vendor Code: {shop_id}  ← Folosește acest Shop ID!")
                else:
                    print("⚠️ Nu s-au găsit shop-uri. Va trebui să introduci Shop ID-ul manual.")
            else:
                print("⚠️ Nu s-a putut obține Shop ID automat. Va trebui să-l introduci manual.")
                print("   Găsește Shop ID-ul în URL-ul shop-ului tău Etsy (ex: etsy.com/shop/TU_SHOP_ID)")
            
        else:
            print("❌ Eroare: Nu s-a primit access_token în răspuns")
            print(f"Răspuns: {token_response}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Eroare la obținerea token-ului: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Răspuns: {e.response.text}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Operațiune anulată de utilizator.")
    except Exception as e:
        print(f"\n\n❌ Eroare neașteptată: {e}")
        import traceback
        traceback.print_exc()

