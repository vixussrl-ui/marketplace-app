# Ghid pentru obținerea Etsy OAuth Access Token

Acest ghid te ajută să obții un OAuth Access Token de la Etsy pentru a putea integra shop-ul tău Etsy în aplicație.

## 📋 Pași preliminari

### 1. Înregistrare aplicație pe Etsy Developer Portal

1. Mergi la: **https://www.etsy.com/developers/register**
2. Autentifică-te cu contul tău Etsy
3. Completează formularul de înregistrare:
   - **Nume aplicație**: orice nume (ex: "My Marketplace Integration")
   - **Descriere**: descriere scurtă a aplicației
   - **Website**: poate fi orice URL valid
4. După înregistrare, vei primi:
   - **API Key (Keystring)** - acesta este **Client ID**-ul tău
   - **Shared Secret** - acesta este **Client Secret**-ul tău

### 2. Configurare Callback URL

1. Mergi la: **https://www.etsy.com/developers/your-apps**
2. Selectează aplicația ta
3. În secțiunea "OAuth redirect URI", adaugă:
   ```
   http://localhost:8080/oauth/callback
   ```
4. Salvează modificările

## 🚀 Utilizare script helper

### Opțiunea 1: Folosind scriptul Python (Recomandat)

1. **Instalează dependențele** (dacă nu ai deja):
   ```bash
   pip install requests
   ```

2. **Rulează scriptul**:
   ```bash
   python get_etsy_token.py
   ```

3. **Urmează instrucțiunile**:
   - Scriptul te va ghida pas cu pas
   - Va deschide automat browser-ul pentru autorizare
   - Va captura automat codul de autorizare
   - Va obține access token-ul pentru tine

### Opțiunea 2: Manual (dacă scriptul nu funcționează)

#### Pasul 1: Generează code_verifier și code_challenge

Poți folosi acest cod Python:

```python
import secrets
import hashlib
import base64

# Generează code_verifier
code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

# Generează code_challenge
sha256 = hashlib.sha256(code_verifier.encode('utf-8')).digest()
code_challenge = base64.urlsafe_b64encode(sha256).decode('utf-8').rstrip('=')

print(f"Code Verifier: {code_verifier}")
print(f"Code Challenge: {code_challenge}")
```

#### Pasul 2: Construiește URL-ul de autorizare

Înlocuiește valorile și deschide în browser:

```
https://www.etsy.com/oauth/connect?response_type=code&client_id=YOUR_API_KEY&redirect_uri=http://localhost:8080/oauth/callback&scope=transactions_r%20shops_r&state=RANDOM_STATE&code_challenge=YOUR_CODE_CHALLENGE&code_challenge_method=S256
```

**Înlocuiește:**
- `YOUR_API_KEY` cu API Key-ul tău (Keystring)
- `RANDOM_STATE` cu un string aleatoriu (pentru securitate)
- `YOUR_CODE_CHALLENGE` cu code_challenge generat mai sus

#### Pasul 3: Autorizează aplicația

1. După ce deschizi URL-ul, vei fi redirecționat către pagina de autorizare Etsy
2. Autorizează aplicația
3. Etsy te va redirecționa către `http://localhost:8080/oauth/callback?code=AUTHORIZATION_CODE`
4. **Copiază codul** din parametrul `code` din URL

#### Pasul 4: Obține Access Token

Fă un POST request la:

**URL:** `https://api.etsy.com/v3/public/oauth/token`

**Body (form-data):**
```
grant_type=authorization_code
client_id=YOUR_API_KEY
redirect_uri=http://localhost:8080/oauth/callback
code=AUTHORIZATION_CODE_FROM_STEP_3
code_verifier=YOUR_CODE_VERIFIER_FROM_STEP_1
```

**Exemplu cu curl:**
```bash
curl -X POST https://api.etsy.com/v3/public/oauth/token \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_API_KEY" \
  -d "redirect_uri=http://localhost:8080/oauth/callback" \
  -d "code=AUTHORIZATION_CODE" \
  -d "code_verifier=YOUR_CODE_VERIFIER"
```

Răspunsul va conține:
```json
{
  "access_token": "YOUR_ACCESS_TOKEN",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

#### Pasul 5: Obține Shop ID

Fă un GET request la:

**URL:** `https://api.etsy.com/v3/application/users/me/shops`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

Răspunsul va conține lista de shop-uri. Folosește `shop_id` din primul rezultat.

## 📝 Adăugare credențiale în aplicație

După ce ai obținut Access Token-ul și Shop ID-ul:

1. Mergi în aplicație la **Platforms → Add Credential**
2. Completează:
   - **Account Label**: orice nume (ex: "Etsy Shop")
   - **Platform**: selectează **Etsy**
   - **Client ID**: **Access Token**-ul obținut (NU API Key-ul!)
   - **Client Secret**: poate fi lăsat gol sau poate fi Shared Secret-ul
   - **Vendor Code**: **Shop ID**-ul obținut

## ⚠️ Note importante

1. **Access Token expiră**: Access Token-urile Etsy expiră după 1 oră. Pentru producție, va trebui să implementezi refresh token logic.

2. **Refresh Token**: Dacă ai primit un refresh token, îl poți folosi pentru a obține un nou access token când cel vechi expiră:
   ```
   POST https://api.etsy.com/v3/public/oauth/token
   grant_type=refresh_token
   client_id=YOUR_API_KEY
   refresh_token=YOUR_REFRESH_TOKEN
   ```

3. **Permisiuni (Scopes)**:
   - `transactions_r` - pentru a citi comenzile (receipts)
   - `shops_r` - pentru a citi informații despre shop

4. **Testare**: După ce adaugi credențialele, testează cu butonul "Refresh" pentru a vedea dacă se preiau comenzile.

## 🆘 Probleme comune

### "Invalid redirect_uri"
- Asigură-te că ai configurat exact `http://localhost:8080/oauth/callback` în Etsy Developer Portal
- URL-ul trebuie să fie identic (fără trailing slash, fără HTTPS)

### "Invalid code"
- Codul de autorizare expiră rapid (câteva minute)
- Asigură-te că folosești codul imediat după ce îl primești

### "Access token expired"
- Access Token-urile expiră după 1 oră
- Va trebui să obții unul nou sau să implementezi refresh token logic

### Scriptul nu deschide browser-ul
- Deschide manual URL-ul de autorizare generat de script
- Copiază codul din URL după autorizare

## 📚 Resurse utile

- [Etsy Developer Portal](https://www.etsy.com/developers)
- [Etsy API Documentation](https://developer.etsy.com/documentation/)
- [Etsy OAuth Authentication Guide](https://developer.etsy.com/documentation/essentials/authentication/)


















