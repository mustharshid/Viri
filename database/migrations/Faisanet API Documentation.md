**Faisanet API Documentation**  
**Overview**  
**This document describes the HTTP endpoints used by the Faisanet banking system for authentication, profile management, and account operations.**  
## Base URL: https://faisanet.mib.com.mv  
##   
**1. Authentication**  
**1.1 Get Authentication Type**  
**Retrieves the authentication type and session token required for login.**  
## Endpoint: POST /aAuth/getAuthType  
**Headers:**  
```
text
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth

```
**Request Body:**  
##   
##   

| Parameter | Type    | Description                                 |
| --------- | ------- | ------------------------------------------- |
| rTag      | string  | Initial token (can be empty or fixed value) |
| pgf01     | string  | Username                                    |
| retain    | integer | Keep session (1 = yes)                      |
  
****Example Request:****  
```
text
rTag=04e626c972f38f42e551a139fe2eb209&pgf01=Yashfauu&retain=1

```
**Example Response:**  
```
json
{
  "rTag": "04e626c972f38f42e551a139fe2eb209",
  "authType": "password",
  "requires2FA": true
}

```
##   
**1.2 Primary Authentication (xAuth)**  
**Performs the main authentication with username and hashed password.**  
## Endpoint: POST /aAuth/xAuth  
**Headers:**  
```
text
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth

```
**Request Body:**  
##   
##   

| Parameter  | Type    | Description                      |
| ---------- | ------- | -------------------------------- |
| rTag       | string  | Session token from previous step |
| pgf01      | string  | Username                         |
| retain     | integer | Keep session (1 = yes)           |
| pgf03      | string  | SHA-256 hashed password          |
| clientSalt | string  | Client-generated salt            |
  
****Example Request:****  
```
text
rTag=04e626c972f38f42e551a139fe2eb209&pgf01=Yashfauu&retain=1&pgf03=A789C246840F8469C85AF9C173EF52652706548B707CEF4294AE1E28828C0265&clientSalt=yCjTNwhYGpw6DVSd3QFO8UrmKVeGIKsP

```
**Example Response:**  
```
json
{
  "success": true,
  "requires2FA": true,
  "otpType": 3
}

```
##   
**1.3 Verify Two-Factor Authentication (OTP)**  
**Verifies the OTP code for 2FA.**  
## Endpoint: POST /aAuth2FA/verifyOTP  
**Headers:**  
```
text
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/auth2FA

```
**Request Body:**  
##   
##   

| Parameter | Type    | Description                             |
| --------- | ------- | --------------------------------------- |
| otpType   | integer | OTP method type (3 = authenticator app) |
| otp       | string  | 6-digit verification code               |
  
****Example Request:****  
```
text
otpType=3&otp=795748

```
**Example Response:**  
```
json
{
  "success": true,
  "responseCode": "1",
  "reasonText": "OTP verified successfully"
}

```
**Status Codes:**  
##   
##   

| Status | Meaning                             |
| ------ | ----------------------------------- |
| 200    | Success                             |
| 203    | OTP verified (redirect to profiles) |
| 401    | Invalid OTP                         |
  
**2. Profile Management**  
**2.1 Get Profiles List**  
**Retrieves the list of available profiles for the logged-in user.**  
## Endpoint: GET /profiles  
**Headers:**  
```
text
Upgrade-Insecure-Requests: 1
Referer: https://faisanet.mib.com.mv/auth2FA

```
**Example Request:**  
```
text
GET /profiles

```
## Example Response: (HTML Page)  
```
html
<select id="profileSelector">
  <option value="10437">MYSTIC WEALTH INVESTMENTS PVT LTD</option>
  <option value="10438">Total Exchange Pvt Ltd</option>
  <option value="10439">Another Profile Name</option>
</select>

```
## Note: Parse the HTML to extract profileId values and corresponding profile names.  
##   
**2.2 Switch Profile**  
**Switches the current session to a different profile.**  
## Endpoint: POST /aProfileHandler/switchProfile  
**Headers:**  
```
text
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/profiles

```
**Request Body:**  
##   
##   

| Parameter   | Type    | Description                           |
| ----------- | ------- | ------------------------------------- |
| rTag        | string  | Session token                         |
| profileId   | integer | Numeric profile ID                    |
| profileType | integer | Profile type (1 = corporate/personal) |
  
****Example Request:****  
```
text
rTag=154b88761c192136a8aa457981650eb3&profileId=10437&profileType=1

```
**Example Response:**  
```
json
{
  "success": true,
  "responseCode": "1",
  "reasonText": "Profile switched successfully",
  "profileName": "MYSTIC WEALTH INVESTMENTS PVT LTD"
}

```
##   
**3. Account Operations**  
**3.1 Get Accounts List**  
**Loads the accounts page with all accounts for the current profile.**  
## Endpoint: GET /accounts  
**Headers:**  
```
text
Upgrade-Insecure-Requests: 1
Referer: https://faisanet.mib.com.mv/profiles

```
**Example Request:**  
```
text
GET /accounts

```
## Example Response: (HTML Page containing account list)  
```
html
<div class="account-item" data-account="90101480038562000">
  <span class="currency">USD</span>
  <span class="balance">$15,390.00</span>
</div>
<div class="account-item" data-account="90101480038561000">
  <span class="currency">MVR</span>
  <span class="balance">MVR 45,200.00</span>
</div>

```
## Note: Parse the HTML to extract account numbers and their details.  
##   
**3.2 View Account Details**  
**Loads detailed information for a specific account.**  
## Endpoint: GET /accountDetails  
**Query Parameters:**  
##   
##   

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| accountNo | string | Account number (16-18 digits) |
  
****Example Request:****  
```
text
GET /accountDetails?accountNo=90101480038562000

```
## Example Response: (HTML Page with account details)  
* Account balance  
* Transaction history  
* Account holder information  
* Currency information  
##   
**3.3 Get Transaction History**  
**Retrieves paginated transaction history for an account.**  
## Endpoint: POST /ajaxAccounts/trxHistory  
**Headers:**  
```
text
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accountDetails?accountNo={accountNo}

```
**Request Body:**  
##   
##   

| Parameter    | Type    | Default | Description                  |
| ------------ | ------- | ------- | ---------------------------- |
| accountNo    | string  | -       | Account number               |
| trxNo        | string  | (empty) | Filter by transaction number |
| trxType      | integer | 0       | Transaction type (0 = all)   |
| sortTrx      | string  | date    | Sort field                   |
| sortDir      | string  | desc    | Sort direction (asc/desc)    |
| fromDate     | string  | (empty) | Start date filter            |
| toDate       | string  | (empty) | End date filter              |
| start        | integer | 1       | Pagination start index       |
| end          | integer | 10      | Pagination end index         |
| includeCount | integer | 1       | Include total count          |
  
****Example Request:****  
```
text
accountNo=90101480038562000&trxNo=&trxType=0&sortTrx=date&sortDir=desc&fromDate=&toDate=&start=1&end=10&includeCount=1

```
**Example Response:**  
```
json
{
  "success": true,
  "responseCode": "1",
  "reasonText": "Trx History Retrieval Success!",
  "reasonCode": "103",
  "data": [
    {
      "accountNo": "90101480038562000",
      "curCode": "840",
      "curCodeDesc": "USD",
      "trxNumber": "1-147434781-85412557-2",
      "trxDate": "2026-07-01 15:36:45",
      "trxValDate": "2026-07-01 00:00:00",
      "absAmount": "153950",
      "baseAmount": "-153950",
      "foreignAmount": "-10000",
      "descr1": "IB Acc to Acc",
      "descr2": "-",
      "trxType": "205",
      "bankName": "Maldives Islamic Bank",
      "benefName": "MU Store",
      "otherAccountNo": "90101480043462002",
      "fromAcc": "MYSTIC WEALTH INVESTMENTS PVT LTD",
      "bankColor": "#FE860E"
    }
  ],
  "total_count": "3908",
  "pos": "1"
}

```
**Currency Codes:**  
##   
##   

| Code | Currency |
| ---- | -------- |
| 840  | USD      |
| 462  | MVR      |
  
**3.4 Get Account Alerts**  
**Retrieves recent alerts/notifications for the account.**  
## Endpoint: POST /aProfile/getLastNAlerts  
**Headers:**  
```
text
X-Requested-With: XMLHttpRequest
Referer: https://faisanet.mib.com.mv/accountDetails?accountNo={accountNo}

```
## Request Body: (Empty)  
**Example Request:**  
```
text
POST /aProfile/getLastNAlerts
Content-Length: 0

```
**Example Response:**  
```
json
{
  "success": true,
  "responseCode": "1",
  "reasonText": "Alerts fetched successfully.",
  "reasonCode": "107",
  "data": [
    {
      "aid": "2127421",
      "alertType": "Authenticator Token Changed",
      "color": "#B30000",
      "date": "07 Jul 2026 17:08",
      "alertMessage": "You reset your two factor authenticator token",
      "entity": null,
      "entityId": null
    },
    {
      "aid": "1535621",
      "alertType": "Swift Transfer Approved",
      "color": "#99172f",
      "date": "07 Dec 2025 19:24",
      "alertMessage": "Admin approved and processed your swift request to transfer of USD 35,000.00 from 90101480038562000 to SUZHOU JINGTAI",
      "entity": "2",
      "entityId": "30966"
    }
  ],
  "total_count": "18",
  "pos": 0
}

```
##   
**Error Codes**  
##   
##   

| Code | Meaning                       |
| ---- | ----------------------------- |
| 1    | Success                       |
| 101  | Invalid request               |
| 102  | Authentication failed         |
| 103  | Transaction history retrieved |
| 107  | Alerts fetched successfully   |
  
**Authentication Flow Diagram**  
```
text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: /aAuth/getAuthType                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Request:  rTag, pgf01=username, retain=1                          │    │
│  │  Response: rTag (session token)                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Step 2: /aAuth/xAuth                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Request:  rTag, pgf01=username, pgf03=password_hash, clientSalt   │    │
│  │  Response: requires2FA=true, otpType=3                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Step 3: /aAuth2FA/verifyOTP                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Request:  otpType=3, otp=123456                                   │    │
│  │  Response: success=true                                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

```
