# BML Mobile API Reference

Base URL: `https://www.bankofmaldives.com.mv/internetbanking`

Authentication: `Authorization: Bearer <access_token>`

User-Agent: `bml-mobile-banking/348 (samsung; Android 14; SM-G998B)`

---

## 1. Dashboard

Returns all user accounts with their current balances and metadata.

```
GET /api/mobile/dashboard
```

### Sample Response

```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "dashboard": [
            {
                "customer": "111524",
                "account_type": "SavingAccount",
                "product": "SAVINGS ACCOUNT",
                "product_code": "A1101",
                "currency": "MVR",
                "product_group": "1101",
                "primary_supplementary": null,
                "account_status": "Active",
                "actions": {
                    "transfer": true,
                    "history": true,
                    "pay": false,
                    "topup": false
                },
                "account_visible": true,
                "prepaid_card": false,
                "id": "AD2ADF9D-46CE-E511-80D7-00155D020F0A",
                "account": "7730000XXXX",
                "alias": "My Account",
                "contact_type": "CCA",
                "workingBalance": 1234.56,
                "ledgerBalance": 1234.56,
                "currency": "MVR"
            },
            {
                "customer": "111524",
                "account_type": "Card",
                "product": "MASTERCARD PREPAID",
                "currency": "MVR",
                "account_status": "Active",
                "actions": {
                    "transfer": true,
                    "history": true,
                    "pay": false,
                    "topup": true
                },
                "id": "30F20707-E739-F011-B821-00155D0C4810",
                "account": "533294XXXXXX2029",
                "alias": "M MUSTHARSHID",
                "cardBalance": {
                    "CurrentBalance": 626.86,
                    "AvailableLimit": 626.86
                },
                "success": true,
                "category": "cards"
            }
        ]
    }
}
```

---

## 2. User Info

Returns the authenticated user's profile information.

```
GET /api/mobile/userinfo
```

### Sample Response

```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "userInfo": {
            "user": {
                "fullname": "John Doe",
                "username": "johndoe@example.com"
            }
        }
    }
}
```

---

## 3. Profile

Health check / session validation endpoint.

```
GET /api/mobile/profile
```

### Sample Response

```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "profile": {
            "name": "John Doe"
        }
    }
}
```

---

## 4. Account Detail (Loan Detail)

Returns detailed information for a specific account.

```
GET /api/mobile/account/{account_id}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account_id | UUID | Account ID from dashboard |

---

## 5. Account History (Today)

Returns today's transactions for a specific account.

```
GET /api/mobile/account/{account_id}/history/today
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account_id | UUID | Account ID from dashboard |

### Sample Response

```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "history": [
            {
                "date": "20260714",
                "narrative3": "POS Purchase",
                "amount": 150.00,
                "minus": true,
                "balance": "1234.56",
                "reference": "FT20260714001",
                "transactionId": "txn_abc123"
            },
            {
                "date": "20260714",
                "narrative3": "Salary Credit",
                "amount": 5000.00,
                "minus": false,
                "balance": "6234.56",
                "reference": "FT20260714002",
                "transactionId": "txn_def456"
            }
        ]
    }
}
```

---

## 6. Account History (Paged)

Returns paginated transaction history.

```
GET /api/mobile/account/{account_id}/history/{page}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account_id | UUID | Account ID from dashboard |
| page | int | Page number (1-based) |

### Sample Response (same structure as /today)

```json
{
    "success": true,
    "code": 0,
    "message": "Success",
    "payload": {
        "history": [
            {
                "date": "20260713",
                "narrative3": "ATM Withdrawal",
                "amount": 500.00,
                "minus": true,
                "balance": "1000.00",
                "reference": "TX20260713001",
                "transactionId": "txn_ghi789"
            }
        ]
    }
}
```

### Transaction Fields

| Field | Type | Description |
|-------|------|-------------|
| date | string | Transaction date (YYYYMMDD) |
| narrative3 | string | Transaction description/name |
| amount | number | Transaction amount |
| minus | boolean | true = debit (outgoing), false = credit (incoming) |
| balance | string | Running account balance after transaction |
| reference | string | Transaction reference number |
| transactionId | string | Unique transaction ID |

---

## 7. Pending History

Returns pending/unsettled transactions for an account.

```
GET /api/mobile/history/pending/{account_id}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account_id | UUID | Account ID from dashboard |

---

## 8. History for Date Range (Server-Side)

This is a custom server-side helper (not a native BML endpoint). It loops through all history pages and returns transactions filtered by date range.

```
GET /?action=api-history-range&account_id={account_id}&from={from_date}&to={to_date}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| account_id | UUID | Account ID from dashboard |
| from | string | Start date (YYYY-MM-DD) |
| to | string | End date (YYYY-MM-DD) |

### Sample Response

```json
{
    "success": true,
    "transactions": [
        {
            "date": "20260714",
            "narrative3": "Salary Credit",
            "amount": 5000.00,
            "minus": false,
            "balance": "6234.56",
            "reference": "FT20260714002"
        }
    ],
    "count": 1
}
```

### Download as CSV

```
GET /?action=api-csv&account_id={account_id}&from={from_date}&to={to_date}
```

Returns a CSV file download with columns: `Date, Description, Amount, Running Balance, Reference, Transaction ID`.

---

## 9. OAuth Token Exchange

Exchanges an authorization code for OAuth tokens.

```
POST /internetbanking/oauth/token
```

### Request Body (application/x-www-form-urlencoded)

| Field | Value |
|-------|-------|
| grant_type | `authorization_code` |
| code | Auth code from authorize step |
| code_verifier | PKCE code verifier |
| client_id | `98C83590-513F-4716-B02B-EC68B7D9E7E7` |
| redirect_uri | `https://app.bankofmaldives.com.mv/oauth/mobile-callback` |
| Device-ID | 16 hex chars |
| User-Agent | `bml-mobile-banking/348 (samsung; Android 14; SM-G998B)` |
| x-app-version | `2.1.44.348` |

### Sample Response

```json
{
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
    "refresh_token": "def50200a1b2c3d4...",
    "expires_in": 2592000,
    "device_id": "a1b2c3d4e5f6a7b8"
}
```

---

## 10. OAuth Refresh

Refreshes an expired access token.

```
POST /internetbanking/oauth/token
```

### Request Body (application/x-www-form-urlencoded)

| Field | Value |
|-------|-------|
| grant_type | `refresh_token` |
| refresh_token | Refresh token from initial exchange |
| client_id | `98C83590-513F-4716-B02B-EC68B7D9E7E7` |
| Device-ID | Device ID from initial exchange |
| User-Agent | `bml-mobile-banking/348 (samsung; Android 14; SM-G998B)` |
| x-app-version | `2.1.44.348` |

---

## 11. OAuth Authorize

Initiates the PKCE authorization flow.

```
GET /internetbanking/oauth/authorize?redirect_uri={uri}&client_id={id}&response_type=code&state={state}&nonce={nonce}&code_challenge={challenge}&code_challenge_method=S256
```

---

## 12. Error Response Format

```json
{
    "success": false,
    "code": 8,
    "message": "An error occurred. Please try again",
    "payload": null
}
```

### Common Error Codes

| Code | Message |
|------|---------|
| 8 | An error occurred. Please try again |
| 25 | No access to Account |

---

## Headers Required

All mobile API requests require these headers:

| Header | Value |
|--------|-------|
| User-Agent | `bml-mobile-banking/348 (samsung; Android 14; SM-G998B)` |
| Accept | `application/json` |
| Authorization | `Bearer {access_token}` |
| x-app-version | `2.1.44.348` |

> Note: Do NOT send cookies with mobile API requests. Only the Bearer token is needed.
