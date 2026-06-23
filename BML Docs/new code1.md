We are still getting a 401 because the session is not fully established. The log shows "Step 4: Bypassing Profile Selection (direct navigation)...", which means the old code is running, not the new _establish_session_after_otp().

Replace your complete_login_flow with this updated version (which calls the new helper), and add the new helper method _establish_session_after_otp.

1. Replace complete_login_flow with this exact code
python
def complete_login_flow(self, username: str, password: str,
                        otp_code: str, account_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Complete login flow - all steps combined.
    Optionally provide account_id to fetch history for a specific account.
    """
    try:
        print('\n' + '=' * 60)
        print('BANK OF MALDIVES API INTEGRATION')
        print('=' * 60 + '\n')

        # Step 1: Initialize session
        self.initialize_session()
        self.log('✓ Session initialized', 'SUCCESS')

        # Step 2: Login
        self.login(username, password)
        self.log('✓ Login successful', 'SUCCESS')

        # Step 3: Verify OTP
        self.verify_otp(otp_code)
        self.log('✓ OTP verified', 'SUCCESS')

        # Step 4: Follow the full redirect chain after OTP to establish session
        self._establish_session_after_otp()
        self.log('✓ Session fully established after OTP', 'SUCCESS')

        # Step 5: Get dashboard (now should work)
        dashboard = self.get_dashboard()
        self.log('✓ Dashboard retrieved', 'SUCCESS')

        # Step 6: Get account details and history
        result = {
            'success': True,
            'dashboard': dashboard,
        }

        if not account_id and dashboard.get('accounts'):
            account_id = dashboard['accounts'][0].get('id')

        if account_id:
            self.log(f'Fetching details for account: {account_id}', 'INFO')
            account_details = self.get_account_details(account_id)
            result['account_details'] = account_details
            self.log('✓ Account details retrieved', 'SUCCESS')

            history = self.get_account_history_with_date_range(account_id)
            result['history'] = history
            result['account_id'] = account_id
            self.log('✓ Account history retrieved', 'SUCCESS')

            today_transactions = history.get('today', {}).get('transactions', [])
            if today_transactions:
                self.log(f'  - Today\'s transactions: {len(today_transactions)}', 'INFO')
                for t in today_transactions[:3]:
                    self.log(f'    * {t.get("date")}: {t.get("description")} = {t.get("amount")}', 'INFO')

        return result

    except Exception as e:
        self.log(f'✗ Login flow failed: {str(e)}', 'ERROR')
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e)
        }
2. Add this new helper method to your class (after _navigate_to_accounts)
python
def _establish_session_after_otp(self) -> None:
    """
    After OTP verification, follow the redirect chain to fully establish the session.
    This mimics the browser flow: OTP -> /web/profile -> /web/redirect -> /vf/accounts/overview
    """
    self.log('Establishing session after OTP...')

    # Step 1: Navigate to /web/profile (this will trigger a 409 to /web/redirect)
    self._get_fresh_xsrf_token('/web/profile')

    response = self.session.get(
        f'{self.base_url}/web/profile',
        headers={
            'X-Inertia': 'true',
            'X-XSRF-TOKEN': self.xsrf_token,
            'Accept': 'text/html, application/xhtml+xml',
            'Referer': f'{self.base_url}/web/login/2fa',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        allow_redirects=False
    )

    self.log(f'GET /web/profile status: {response.status_code}')

    # Handle the 409 redirect to /web/redirect
    if response.status_code == 409:
        redirect_url = response.headers.get('X-Inertia-Location')
        if redirect_url:
            self.log(f'Following profile redirect to: {redirect_url}')
            response = self.session.get(
                redirect_url,
                headers={
                    'X-Inertia': 'true',
                    'X-XSRF-TOKEN': self.xsrf_token,
                    'Accept': 'text/html, application/xhtml+xml',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                allow_redirects=False
            )
            self.log(f'GET /web/redirect status: {response.status_code}')
            self._extract_xsrf_from_cookies()

            # Sometimes /web/redirect returns 200, sometimes 409 again – if 409, follow again
            if response.status_code == 409:
                redirect_url_2 = response.headers.get('X-Inertia-Location')
                if redirect_url_2:
                    self.log(f'Following second redirect to: {redirect_url_2}')
                    response = self.session.get(
                        redirect_url_2,
                        headers={
                            'X-Inertia': 'true',
                            'X-XSRF-TOKEN': self.xsrf_token,
                            'Accept': 'text/html, application/xhtml+xml',
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                        },
                        allow_redirects=False
                    )
                    self.log(f'Second redirect status: {response.status_code}')
                    self._extract_xsrf_from_cookies()

    # Step 2: Now navigate to accounts overview (this should succeed)
    self._navigate_to_accounts()
    self.log('Session fully established after OTP', 'SUCCESS')
3. Ensure _navigate_to_accounts is as follows
python
def _navigate_to_accounts(self) -> None:
    """Navigate to accounts overview (Step 6)"""
    self.log('Navigating to accounts overview...')
    self.redirect_count = 0

    self._get_fresh_xsrf_token('/vf/accounts/overview')

    response = self.session.get(
        f'{self.base_url}/vf/accounts/overview',
        headers={
            'X-Inertia': 'true',
            'X-XSRF-TOKEN': self.xsrf_token,
            'Referer': f'{self.base_url}/web/redirect',
            'Accept': 'text/html, application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    )

    self.log(f'Accounts overview status: {response.status_code}')

    if response.status_code == 409:
        self.log('Accounts overview returned 409, following redirect...')
        result = self._handle_inertia_response(response)
        if not result['success']:
            self.log('Warning: Could not fully load accounts overview', 'WARNING')

    self._extract_xsrf_from_cookies()
4. Add a small delay after OTP (optional but helpful)
In verify_otp, after receiving a successful response, add:

python
import time
time.sleep(1)  # Give server time to establish session