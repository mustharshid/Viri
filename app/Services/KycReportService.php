<?php

namespace App\Services;

use App\Models\KycRecord;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Collection;

class KycReportService
{
    /**
     * Generate a pre-filled Suspicious Transaction Report (STR) PDF.
     * Required by MMA §17 — submitted to Financial Intelligence Unit within 3 working days.
     */
    public function generateStrPdf(KycRecord $record): \Barryvdh\DomPDF\PDF
    {
        $html = $this->strHtml($record);
        return Pdf::loadHTML($html)->setPaper('a4', 'portrait');
    }

    /**
     * Generate a Cash Transaction Report (CTR) PDF for transactions ≥ MVR 200,000.
     * Required by MMA §18-19.
     */
    public function generateCtrReport(Collection $records, string $dateFrom, string $dateTo, $tenant): \Barryvdh\DomPDF\PDF
    {
        $html = $this->ctrHtml($records, $dateFrom, $dateTo, $tenant);
        return Pdf::loadHTML($html)->setPaper('a4', 'landscape');
    }

    /**
     * Generate a Weekly Fund Transfer Report PDF.
     * Required by MMA §20 — all money transfer institutions must report weekly.
     */
    public function generateWeeklyTransferReport(Collection $records, string $weekStart, string $weekEnd, $tenant): \Barryvdh\DomPDF\PDF
    {
        $html = $this->weeklyTransferHtml($records, $weekStart, $weekEnd, $tenant);
        return Pdf::loadHTML($html)->setPaper('a4', 'landscape');
    }

    // ── HTML Templates ────────────────────────────────────────────────────────

    private function strHtml(KycRecord $record): string
    {
        $c = $record->customer;
        $date = $record->created_at->format('d M Y');
        $strDate = $record->str_flagged_at?->format('d M Y H:i') ?? $date;
        $deadline = $record->str_flagged_at?->addWeekdays(3)->format('d M Y') ?? '—';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Times New Roman, serif; font-size: 11px; color: #111; margin: 0; padding: 20px; }
  h1 { font-size: 14px; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  h2 { font-size: 11px; text-align: center; color: #555; margin-top: 0; }
  .section { margin: 14px 0; border: 1px solid #bbb; border-radius: 3px; }
  .section-title { background: #1a3a5c; color: white; padding: 5px 10px; font-weight: bold; font-size: 10px; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; padding: 10px 12px; gap: 6px 20px; }
  .field label { font-weight: bold; color: #444; font-size: 9px; text-transform: uppercase; display: block; }
  .field span { font-size: 11px; }
  .full { grid-column: 1 / -1; }
  .notes { padding: 10px 12px; white-space: pre-wrap; background: #fffbe6; border-top: 1px solid #e0d080; }
  .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 8px 12px; border-radius: 3px; font-size: 10px; margin: 10px 0; }
  .footer { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 10px; }
  .sig-box { border-top: 1px solid #333; padding-top: 4px; }
</style>
</head>
<body>
  <h1>Suspicious Transaction Report (STR)</h1>
  <h2>Pursuant to MMA Regulation on Prevention of Money Laundering and Financing of Terrorism §17</h2>

  <div class="warning">
    ⚠ This report must be submitted to the Financial Intelligence Unit (FIU) within <strong>3 working days</strong> of forming suspicion.
    Deadline: <strong>{$deadline}</strong>. Do not disclose this report to the customer (§21 — Tipping Off Prohibition).
  </div>

  <div class="section">
    <div class="section-title">1. Reporting Institution</div>
    <div class="grid">
      <div class="field"><label>Date of Report</label><span>{$strDate}</span></div>
      <div class="field"><label>KYC Record ID</label><span>KYC-{$record->id}</span></div>
      <div class="field"><label>Cashier / Reporter</label><span>{$record->cashier?->name ?? '—'}</span></div>
      <div class="field"><label>Terminal</label><span>{$record->terminal?->terminal_name ?? '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">2. Customer Information</div>
    <div class="grid">
      <div class="field"><label>Full Name</label><span>{$c->full_name}</span></div>
      <div class="field"><label>Aliases</label><span>{$c->aliases ?? '—'}</span></div>
      <div class="field"><label>NIC Number</label><span>{$c->nic_number ?? '—'}</span></div>
      <div class="field"><label>Passport Number</label><span>{$c->passport_number ?? '—'}</span></div>
      <div class="field"><label>Nationality</label><span>{$c->nationality}</span></div>
      <div class="field"><label>Date of Birth</label><span>{$c->dob?->format('d M Y') ?? '—'}</span></div>
      <div class="field full"><label>Address</label><span>{$c->address}</span></div>
      <div class="field"><label>Contact</label><span>{$c->contact_number}</span></div>
      <div class="field"><label>Email</label><span>{$c->email ?? '—'}</span></div>
      <div class="field"><label>PEP</label><span>{$this->bool($c->is_pep)}</span></div>
      <div class="field"><label>High-Risk Country</label><span>{$this->bool($c->is_high_risk_country)}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">3. Transaction Details</div>
    <div class="grid">
      <div class="field"><label>Transaction Type</label><span>{$this->label($record->transaction_type)}</span></div>
      <div class="field"><label>Transaction Date</label><span>{$date}</span></div>
      <div class="field"><label>Amount</label><span>{$record->transaction_currency} {$this->money($record->transaction_amount)}</span></div>
      <div class="field"><label>Reference</label><span>{$record->transaction_reference ?? '—'}</span></div>
      <div class="field"><label>CDD Type</label><span>{$this->label($record->cdd_type)}</span></div>
      <div class="field"><label>Not Physically Present</label><span>{$this->bool($record->is_not_physically_present)}</span></div>
      <div class="field full"><label>Purpose</label><span>{$record->transaction_purpose ?? '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">4. Grounds for Suspicion</div>
    <div class="notes">{$record->str_notes}</div>
  </div>

  <div class="footer">
    <div class="sig-box">Reporting Officer Signature</div>
    <div class="sig-box">Senior Management Signature</div>
    <div class="sig-box">Date of Submission to FIU</div>
  </div>
</body>
</html>
HTML;
    }

    private function ctrHtml(Collection $records, string $dateFrom, string $dateTo, $tenant): string
    {
        $rows = $records->map(function ($r) {
            $c = $r->customer;
            return "<tr>
                <td>{$r->created_at->format('d M Y')}</td>
                <td>" . e($c->full_name) . "</td>
                <td>{$c->nic_number}</td>
                <td>{$c->passport_number}</td>
                <td>" . e($c->nationality) . "</td>
                <td>{$r->transaction_currency} {$this->money($r->transaction_amount)}</td>
                <td>" . $this->label($r->transaction_type) . "</td>
                <td>{$r->transaction_reference}</td>
            </tr>";
        })->implode('');

        $total = $records->sum('transaction_amount');

        return <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 15px; }
  h1 { font-size: 13px; text-align: center; }
  h2 { font-size: 10px; text-align: center; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #1a3a5c; color: white; padding: 5px 6px; text-align: left; }
  td { border: 1px solid #ccc; padding: 4px 6px; }
  tr:nth-child(even) td { background: #f5f5f5; }
  .total { font-weight: bold; text-align: right; margin-top: 8px; font-size: 10px; }
</style></head><body>
  <h1>Cash Transaction Report (CTR)</h1>
  <h2>MMA §18-19 — Period: {$dateFrom} to {$dateTo}</h2>
  <p>Transactions of MVR 200,000 or more</p>
  <table>
    <thead><tr><th>Date</th><th>Customer Name</th><th>NIC</th><th>Passport</th><th>Nationality</th><th>Amount</th><th>Type</th><th>Reference</th></tr></thead>
    <tbody>{$rows}</tbody>
  </table>
  <div class="total">Total: MVR {$this->money($total)} ({$records->count()} transactions)</div>
</body></html>
HTML;
    }

    private function weeklyTransferHtml(Collection $records, string $weekStart, string $weekEnd, $tenant): string
    {
        $rows = $records->map(function ($r) {
            $c = $r->customer;
            return "<tr>
                <td>{$r->created_at->format('d M Y H:i')}</td>
                <td>" . e($c->full_name) . "</td>
                <td>{$c->nic_number}</td>
                <td>" . e($r->beneficiary_name ?? '—') . "</td>
                <td>" . e($r->beneficiary_institution ?? '—') . "</td>
                <td>" . $this->label($r->transfer_direction ?? '') . "</td>
                <td>{$r->transaction_currency} {$this->money($r->transaction_amount)}</td>
                <td>{$r->transaction_reference}</td>
            </tr>";
        })->implode('');

        $total = $records->sum('transaction_amount');

        return <<<HTML
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 15px; }
  h1 { font-size: 13px; text-align: center; }
  h2 { font-size: 10px; text-align: center; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #1a3a5c; color: white; padding: 5px 6px; text-align: left; }
  td { border: 1px solid #ccc; padding: 4px 6px; }
  tr:nth-child(even) td { background: #f5f5f5; }
  .total { font-weight: bold; text-align: right; margin-top: 8px; font-size: 10px; }
</style></head><body>
  <h1>Weekly Fund Transfer Report</h1>
  <h2>MMA §20 — Week: {$weekStart} to {$weekEnd}</h2>
  <table>
    <thead><tr><th>Date/Time</th><th>Originator</th><th>NIC</th><th>Beneficiary</th><th>Beneficiary Institution</th><th>Direction</th><th>Amount</th><th>Reference</th></tr></thead>
    <tbody>{$rows}</tbody>
  </table>
  <div class="total">Total: MVR {$this->money($total)} ({$records->count()} transfers)</div>
</body></html>
HTML;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function bool(bool $val): string
    {
        return $val ? 'Yes' : 'No';
    }

    private function money(float $val): string
    {
        return number_format($val, 2);
    }

    private function label(string $val): string
    {
        return ucwords(str_replace('_', ' ', $val));
    }
}
