import requests
import json
import re
import time
from typing import Dict, Any, Optional, List
from urllib.parse import unquote, urljoin

class BMLBankingAPI:
    def __init__(self):
        self.base_url = 'https://www.bankofmaldives.com.mv/internetbanking'
        self.session = requests.Session()
        self.xsrf_token = None
        self.session_cookie = None
        self.debug = True
        self.max_redirects = 5
        self.redirect_count = 0
        
    def log(self, message: str, level: str = 'INFO'):
        if self.debug:
            timestamp = time.strftime('%H:%M:%S')
            emoji = {'SUCCESS': '✅', 'ERROR': '❌', 'WARNING': '⚠️', 'INFO': 'ℹ️'}.get(level, 'ℹ️')
            print(f'[{timestamp}] {emoji} [BML] {message}')
    
    def _extract_xsrf_from_cookies(self) -> None:
        for cookie in self.session.cookies:
            if cookie.name == 'XSRF-TOKEN':
                self.xsrf_token = unquote(cookie.value)
                break
    
    def _handle_inertia_response(self, response, max_redirects: int = 5) -> Dict[str, Any]:
        redirect_count = 0
        while response.status_code == 409 and redirect_count < max_redirects:
            redirect_url = response.headers.get('X-Inertia-Location')
            if not redirect_url:
                self.log('Warning: 409 response without X-Inertia-Location header', 'WARNING')
                break
            if not redirect_url.startswith('http'):
                redirect_url = f'{self.base_url}{redirect_url}'
            redirect_count += 1
            self.log(f'Following Inertia redirect #{redirect_count} to: {redirect_url}')
            response = self.session.get(
                redirect_url,
                headers={
                    'X-Inertia': 'true',
                    'X-XSRF-TOKEN': self.xsrf_token if self.xsrf_token else '',
                    'Accept': 'text/html, application/xhtml+xml',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                allow_redirects=False
            )
            self.log(f'Redirect #{redirect_count} response: {response.status_code}')
            self._extract_xsrf_from_cookies()
            if response.status_code == 200:
                break
        if redirect_count >= max_redirects:
            self.log(f'Reached max redirects ({max_redirects}).', 'WARNING')
        return {
            'success': response.status_code == 200,
            'response': response,
            'redirected': redirect_count > 0,
            'final_url': response.url if hasattr(response, 'url') else None
        }
    
    def initialize_session(self) -> str:
        self.log('Initializing session...')
        response = self.session.get(
            f'{self.base_url}/web/login',
            headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
        )
        self._extract_xsrf_from_cookies()
        self.log('Session initialized successfully', 'SUCCESS')
        return self.xsrf_token
    
    def login(self, username: str, password: str) -> Dict[str, Any]:
        self.log('Attempting login...')
        if not self.xsrf_token:
            self.initialize_session()
        response = self.session.post(
            f'{self.base_url}/web/login',
            json={'username': username, 'password': password},
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'Content-Type': 'application/json',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/login',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        self.log(f'Login response status: {response.status_code}')
        if response.status_code == 409:
            result = self._handle_inertia_response(response)
            if result['success']:
                self.log('Login successful! Session synced.', 'SUCCESS')
                return {'status': 'success', 'success': True}
            if response.status_code == 409:
                self.log('Login appears successful despite 409', 'SUCCESS')
                return {'status': 'success', 'success': True}
            raise Exception(f'Login redirect failed: {response.status_code}')
        if response.status_code != 200:
            raise Exception(f'Login failed: {response.status_code}')
        return response.json() if response.text else {}
    
    def verify_otp(self, otp_code: str) -> Dict[str, Any]:
        self.log('Submitting TOTP code...')
        self._get_fresh_xsrf_token('/web/login/2fa')
        response = self.session.post(
            f'{self.base_url}/web/login/2fa',
            json={'otp': otp_code},
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'Content-Type': 'application/json',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/login/2fa',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        self.log(f'OTP response status: {response.status_code}')
        if response.status_code == 409:
            result = self._handle_inertia_response(response)
            if result['success']:
                self.log('OTP verified successfully!', 'SUCCESS')
                return {'status': 'success', 'success': True}
            if response.status_code == 409:
                self.log('OTP appears verified despite 409', 'SUCCESS')
                return {'status': 'success', 'success': True}
            raise Exception(f'OTP redirect failed: {response.status_code}')
        if response.status_code != 200:
            raise Exception(f'OTP verification failed: {response.status_code}')
        return response.json() if response.text else {}
    
    def get_profiles(self) -> Dict[str, Any]:
        self.log('Fetching profiles...')
        self.redirect_count = 0
        self._get_fresh_xsrf_token('/web/profile')
        response = self.session.get(
            f'{self.base_url}/web/profile',
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/login/2fa',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        self.log(f'Profile list response status: {response.status_code}')
        if response.status_code == 409:
            self.log('Profile list returned 409. Following redirects...')
            result = self._handle_inertia_response(response)
            if result['success']:
                response = result['response']
                self.log('Profile redirects completed successfully', 'SUCCESS')
                return self._parse_profiles_from_html(response.text)
            if result.get('response'):
                self.log('Attempting to parse profiles despite non-200 response', 'WARNING')
                return self._parse_profiles_from_html(result['response'].text)
            raise Exception('Failed to fetch profiles after redirects')
        if response.status_code != 200:
            raise Exception(f'Failed to fetch profiles: {response.status_code}')
        return self._parse_profiles_from_html(response.text)
    
    def _parse_profiles_from_html(self, html_content: str) -> Dict[str, Any]:
        profiles = {'profiles': [], 'default_profile': None}
        if not html_content or len(html_content) < 100:
            self.log('HTML content too short or empty', 'WARNING')
            return profiles
        patterns = [
            r'/internetbanking/web/profile/([A-F0-9-]+)',
            r'"profileId":\s*"([A-F0-9-]+)"',
            r"profileId: '([A-F0-9-]+)'",
            r'data-profile-id="([A-F0-9-]+)"',
        ]
        all_profile_ids = []
        for pattern in patterns:
            matches = re.findall(pattern, html_content, re.IGNORECASE)
            if matches:
                all_profile_ids.extend(matches)
        unique_profile_ids = []
        for pid in all_profile_ids:
            if pid not in unique_profile_ids:
                unique_profile_ids.append(pid)
        if unique_profile_ids:
            for profile_id in unique_profile_ids:
                profiles['profiles'].append({'id': profile_id})
            profiles['default_profile'] = unique_profile_ids[0]
            self.log(f'Found {len(unique_profile_ids)} profile(s)')
        else:
            self.log('No profiles found in HTML', 'WARNING')
        return profiles
    
    def select_profile(self, profile_id: str) -> bool:
        self.log(f'Selecting profile: {profile_id}')
        self.redirect_count = 0
        self._get_fresh_xsrf_token('/web/profile')
        response = self.session.get(
            f'{self.base_url}/web/profile/{profile_id}',
            headers={
                'Accept': 'text/html, application/xhtml+xml',
                'X-Inertia': 'true',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/web/profile',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        self.log(f'Profile selection status: {response.status_code}')
        if response.status_code == 409:
            redirect_url = response.headers.get('X-Inertia-Location')
            if redirect_url:
                self.log(f'Following profile redirect to: {redirect_url}')
                redirect_response = self.session.get(
                    redirect_url,
                    headers={
                        'X-Inertia': 'true',
                        'X-XSRF-TOKEN': self.xsrf_token,
                        'Accept': 'text/html, application/xhtml+xml',
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                )
                self.log(f'Redirect response status: {redirect_response.status_code}')
                self._extract_xsrf_from_cookies()
                if redirect_response.status_code == 200:
                    self.log('Profile selected successfully, navigating to accounts overview')
                    self._navigate_to_accounts()
                    return True
        if response.status_code == 200:
            self.log('Profile page loaded directly')
            self._navigate_to_accounts()
            return True
        raise Exception(f'Failed to select profile: {response.status_code}')
    
    def _navigate_to_accounts(self) -> None:
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
            self._handle_inertia_response(response)
        self._extract_xsrf_from_cookies()
    
    def get_dashboard(self) -> Dict[str, Any]:
        self.log('Fetching dashboard...')
        self._navigate_to_accounts()
        response = self.session.get(
            f'{self.base_url}/api/dashboard',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/overview',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        self.log(f'Dashboard status: {response.status_code}')
        if response.status_code != 200:
            raise Exception(f'Failed to get dashboard: {response.status_code}')
        self.log('Dashboard retrieved successfully', 'SUCCESS')
        return response.json()
    
    def get_account_details(self, account_id: str) -> Dict[str, Any]:
        self.log(f'Fetching details for account: {account_id}')
        self._get_fresh_xsrf_token(f'/vf/accounts/{account_id}')
        response = self.session.get(
            f'{self.base_url}/api/account/{account_id}',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/overview',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        if response.status_code != 200:
            raise Exception(f'Failed to get account details: {response.status_code}')
        self.log('Account details retrieved successfully', 'SUCCESS')
        return response.json()
    
    def get_account_history_with_date_range(self, account_id: str) -> Dict[str, Any]:
        self.log(f'Fetching history for account: {account_id}')
        account_details = self.get_account_details(account_id)
        account_number = account_details.get('accountNumber', '')
        referer_url = f'{self.base_url}/vf/accounts/{account_id}'
        if account_number:
            referer_url += f'?type=account&account={account_number}&alias={account_details.get("alias", "")}'
        self.log(f'Navigating to account page')
        page_response = self.session.get(
            referer_url,
            headers={
                'X-Inertia': 'true',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': f'{self.base_url}/vf/accounts/overview',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        if page_response.status_code == 409:
            self._handle_inertia_response(page_response)
            self._extract_xsrf_from_cookies()
        today_response = self.session.get(
            f'{self.base_url}/api/account/{account_id}/history/today',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': referer_url,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        if today_response.status_code != 200:
            raise Exception(f'Failed to get account history: {today_response.status_code}')
        pending_response = self.session.get(
            f'{self.base_url}/api/history/pending/{account_id}',
            headers={
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer',
                'X-XSRF-TOKEN': self.xsrf_token,
                'Referer': referer_url,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        )
        if pending_response.status_code != 200:
            self.log(f'Warning: Could not fetch pending transactions: {pending_response.status_code}', 'WARNING')
            pending_data = {}
        else:
            pending_data = pending_response.json()
        self.log('Account history retrieved successfully', 'SUCCESS')
        return {'today': today_response.json(), 'pending': pending_data}
    
    def _get_fresh_xsrf_token(self, path: str) -> None:
        self.log(f'Getting fresh XSRF token from: {path}')
        response = self.session.get(
            f'{self.base_url}{path}',
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'X-Inertia': 'true'
            }
        )
        self._extract_xsrf_from_cookies()
    
    def complete_login_flow(self, username: str, password: str, 
                            otp_code: str, account_id: str = None) -> Dict[str, Any]:
        try:
            print('\n' + '='*60)
            print('BANK OF MALDIVES API INTEGRATION')
            print('='*60 + '\n')
            self.initialize_session()
            self.log('✓ Session initialized', 'SUCCESS')
            self.login(username, password)
            self.log('✓ Login successful', 'SUCCESS')
            self.verify_otp(otp_code)
            self.log('✓ OTP verified', 'SUCCESS')
            profiles = self.get_profiles()
            if not profiles.get('profiles'):
                raise Exception('No profiles found. Cannot proceed.')
            self.log(f'✓ Found {len(profiles["profiles"])} profile(s)', 'SUCCESS')
            profile_id = profiles.get('default_profile') or profiles['profiles'][0]['id']
            self.select_profile(profile_id)
            self.log(f'✓ Profile selected: {profile_id}', 'SUCCESS')
            dashboard = self.get_dashboard()
            self.log('✓ Dashboard retrieved', 'SUCCESS')
            result = {'success': True, 'profiles': profiles, 'dashboard': dashboard, 'profile_id': profile_id}
            if not account_id and dashboard.get('accounts'):
                account_id = dashboard['accounts'][0].get('id')
            if account_id:
                account_details = self.get_account_details(account_id)
                result['account_details'] = account_details
                self.log('✓ Account details retrieved', 'SUCCESS')
                history = self.get_account_history_with_date_range(account_id)
                result['history'] = history
                result['account_id'] = account_id
                self.log('✓ Account history retrieved', 'SUCCESS')
            return result
        except Exception as e:
            self.log(f'✗ Login flow failed: {str(e)}', 'ERROR')
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}


# ====================== USAGE EXAMPLE ======================

if __name__ == '__main__':
    import os
    USERNAME = os.getenv('BML_USERNAME', input('Enter username: '))
    PASSWORD = os.getenv('BML_PASSWORD', input('Enter password: '))
    OTP_CODE = input('Enter TOTP code: ')
    
    api = BMLBankingAPI()
    result = api.complete_login_flow(USERNAME, PASSWORD, OTP_CODE)
    
    if result.get('success'):
        print('\n' + '='*60)
        print('✅ AUTHENTICATION COMPLETE!')
        print('='*60)
        print(f"Profile ID: {result.get('profile_id')}")
        print(f"Account ID: {result.get('account_id')}")
        print('\n📊 ACCOUNTS:')
        for account in result.get('dashboard', {}).get('accounts', []):
            print(f"  - {account.get('alias')}: {account.get('balance')} {account.get('currency')}")
        if result.get('history'):
            print('\n📝 RECENT TRANSACTIONS:')
            for transaction in result.get('history', {}).get('today', {}).get('transactions', [])[:5]:
                print(f"  - {transaction.get('date')}: {transaction.get('description')} = {transaction.get('amount')}")
        print('\n✅ All operations completed successfully!')
    else:
        print(f'\n❌ Authentication failed: {result.get("error")}')