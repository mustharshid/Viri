import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Calendar, 
  Clock, 
  Printer, 
  Users, 
  Building2, 
  Coins, 
  EyeOff, 
  ShieldAlert
} from 'lucide-react';

// Acronym dictionary with definitions and regulatory roles
const ACRONYMS: Record<string, { definition: string; note: string }> = {
  'MMA': { 
    definition: 'Maldives Monetary Authority', 
    note: 'The central bank of the Maldives and primary regulatory authority for banks, financial institutions, and licensed money changers.' 
  },
  'AML': { 
    definition: 'Anti-Money Laundering', 
    note: 'Statutory legal frameworks and procedures designed to prevent criminals from disguising illegally obtained funds as legitimate income.' 
  },
  'CFT': { 
    definition: 'Countering the Financing of Terrorism', 
    note: 'Specialized regulatory measures and monitoring systems to detect, intercept, and block financial flows intended for terrorist entities.' 
  },
  'CDD': { 
    definition: 'Customer Due Diligence', 
    note: 'Mandatory identity verification process: obtaining verified proof of name, date of birth, residential address, and transaction purpose.' 
  },
  'EDD': { 
    definition: 'Enhanced Due Diligence', 
    note: 'Intensive verification required for high-value or high-risk transactions (&ge; 200k MVR, PEPs), including proof of source of funds and senior approval.' 
  },
  'CTR': { 
    definition: 'Cash Transaction Report / Currency Transaction Report', 
    note: 'Statutory filing submitted to the FIU for any cash transaction equal to or exceeding MVR 200,000 (or foreign currency equivalent).' 
  },
  'STR': { 
    definition: 'Suspicious Transaction Report', 
    note: 'Mandatory confidential report submitted directly to the FIU within 3 working days whenever suspicion of criminal origin arises.' 
  },
  'FIU': { 
    definition: 'Financial Intelligence Unit', 
    note: 'The national autonomous agency established within the MMA that receives, analyzes, and disseminates financial disclosure reports.' 
  },
  'NIC': { 
    definition: 'National Identity Card', 
    note: 'Primary official identification card issued to citizens of the Republic of Maldives by the Department of National Registration (DNR).' 
  },
  'FX': { 
    definition: 'Foreign Exchange', 
    note: 'Trading, exchange, or conversion of one national fiat currency for another.' 
  },
  'MVR': { 
    definition: 'Maldivian Rufiyaa', 
    note: 'The official fiat currency and legal tender of the Republic of Maldives.' 
  },
  'USD': { 
    definition: 'United States Dollar', 
    note: 'Standard benchmark foreign exchange currency.' 
  },
  'EUR': { 
    definition: 'Euro', 
    note: 'Official European Union foreign exchange currency.' 
  },
  'GBP': { 
    definition: 'Great British Pound', 
    note: 'Official United Kingdom foreign exchange currency.' 
  },
  'MED': { 
    definition: 'Ministry of Economic Development', 
    note: 'The government ministry responsible for company registration, corporate records, and business licensing in the Maldives.' 
  },
  'PEP': { 
    definition: 'Politically Exposed Person', 
    note: 'Individuals entrusted with prominent public functions, their family members, and close associates, who represent higher risk.' 
  },
};

// Reusable Acronym component with hover/focus floating tooltip
interface AcroProps {
  term: keyof typeof ACRONYMS;
  children?: React.ReactNode;
}

const Acro: React.FC<AcroProps> = ({ term, children }) => {
  const info = ACRONYMS[term] || { definition: term, note: '' };
  return (
    <span className="relative inline-block group cursor-help select-none">
      <span className="border-b border-dotted border-zinc-500 group-hover:border-zinc-200 transition-colors text-zinc-200 font-medium">
        {children || term}
      </span>
      {/* Floating tooltip */}
      <span
        role="tooltip"
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block group-focus:block z-50 w-64 p-3 bg-zinc-950 border border-zinc-700 text-zinc-300 text-[11px] leading-snug rounded-lg shadow-2xl pointer-events-none text-left font-normal normal-case tracking-normal"
      >
        <span className="font-bold text-white block mb-0.5">
          {term}: {info.definition}
        </span>
        <span className="text-zinc-400 text-[10px] block mt-1 pt-1 border-t border-zinc-800 leading-relaxed">
          {info.note}
        </span>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-950 border-r border-b border-zinc-700 rotate-45" />
      </span>
    </span>
  );
};

export const MmaGuidelinesView: React.FC = () => {
  // Calculator state
  const [calcAmount, setCalcAmount] = useState<string>('50000');
  const [calcCurrency, setCalcCurrency] = useState<string>('MVR');
  const [calcExchangeRate, setCalcExchangeRate] = useState<string>('15.42');
  const [selectedDocCategory, setSelectedDocCategory] = useState<'individual' | 'foreigner' | 'corporate'>('individual');

  // MVR conversion calculation
  const mvrEquivalent = useMemo(() => {
    const amt = parseFloat(calcAmount) || 0;
    if (calcCurrency === 'MVR') return amt;
    const rate = parseFloat(calcExchangeRate) || 15.42;
    return amt * rate;
  }, [calcAmount, calcCurrency, calcExchangeRate]);

  // Determine active tier based on calculated MVR
  const activeTier = useMemo(() => {
    if (mvrEquivalent >= 200000) {
      return {
        level: 3,
        tierTag: 'TIER 3',
        clause: 'Act No. 10/2014 §16-17; MMA AML/CFT Reg §11-12 & §18-19',
        name: 'Cash Transaction Report (CTR) & Enhanced Due Diligence (EDD)',
        badge: 'MANDATORY CTR & EDD',
        thresholdText: 'Equal to or exceeding MVR 200,000 (or foreign currency equivalent)',
        summary: 'Transactions at or above MVR 200,000 require statutory CTR reporting to the MMA Financial Intelligence Unit (FIU), Enhanced Due Diligence (EDD), verified Source of Funds documentation, and Senior Management approval prior to completion.'
      };
    } else if (mvrEquivalent >= 50000) {
      return {
        level: 2,
        tierTag: 'TIER 2',
        clause: 'Act No. 10/2014 §4(b)(1); MMA AML/CFT Reg §7, §10, §15',
        name: 'Customer Due Diligence (CDD)',
        badge: 'CDD MANDATORY',
        thresholdText: 'MVR 50,000 to MVR 199,999 (or foreign currency equivalent)',
        summary: 'Occasional transactions between MVR 50,000 and MVR 199,999 require full customer identification, verification against original photo identification, recorded residential address, stated transaction purpose, and 5-year record archival.'
      };
    } else {
      return {
        level: 1,
        tierTag: 'TIER 1',
        clause: 'Act No. 10/2014 §4(a); MMA Reg §8-9; Money Changing Reg §14',
        name: 'Simplified Retail Exchange',
        badge: 'STANDARD RETAIL',
        thresholdText: 'Below MVR 50,000 (or foreign currency equivalent)',
        summary: 'Transactions below MVR 50,000 represent retail exchange. Standard serialized receipt issuance and recording of customer name and contact details are required.'
      };
    }
  }, [mvrEquivalent]);

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in overflow-y-auto font-sans text-zinc-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono tracking-wider uppercase text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60">
              Statutory Compliance
            </span>
            <span className="text-[10px] font-mono tracking-wider uppercase text-zinc-400">
              Law No. 10/2014 &bull; <Acro term="MMA" /> <Acro term="AML" />/<Acro term="CFT" /> Regulations
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            <Acro term="MMA" /> <Acro term="AML" />/<Acro term="CFT" /> Guidelines &amp; Reporting Framework
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Operational compliance standards, customer identification thresholds, and statutory reporting schedules for licensed money changers. Hover over underlined acronyms for definitions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="text-xs px-3 py-2 flex items-center gap-1.5 rounded-lg text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
            title="Print counter desk cheatsheet"
          >
            <Printer size={13} className="text-zinc-400" />
            <span>Print Cheatsheet</span>
          </button>
        </div>
      </div>

      {/* Statutory Legal Warning: Anti-Tipping Off Card */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 flex items-start gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 mt-0.5">
          <EyeOff size={16} />
        </div>
        <div className="space-y-1.5 text-xs w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-white text-xs tracking-tight uppercase">
                Statutory Prohibition on Tipping-Off
              </h4>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                Strict Liability
              </span>
            </div>
            {/* Clause Reference */}
            <span className="text-[10px] font-mono text-zinc-400">
              Clause: Act No. 10/2014 &sect;24 &bull; <Acro term="MMA" /> Reg &sect;21
            </span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Personnel are prohibited by law from disclosing to a customer or third party that an inquiry is being conducted, or that an internal report or <Acro term="STR" /> has been formed or transmitted to the <Acro term="FIU" />. Tipping off constitutes a criminal offense punishable under Section 24 of Act No. 10/2014 by imprisonment and substantial pecuniary penalties.
          </p>
        </div>
      </div>

      {/* SECTION 1: THE 3-TIER THRESHOLD FRAMEWORK */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Transaction Due Diligence Framework
            </h2>
            <p className="text-xs text-zinc-500">
              Statutory threshold hierarchy governing <Acro term="CDD" />, <Acro term="EDD" />, and <Acro term="FIU" /> filings.
            </p>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Clause: Act No. 10/2014 &sect;4, &sect;16; <Acro term="MMA" /> Reg &sect;7-12, &sect;18-19
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* TIER 1 */}
          <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  Tier 1
                </span>
                <span className="text-xs font-mono font-bold text-zinc-300">&lt; 50,000 <Acro term="MVR" /></span>
              </div>
              <div className="text-sm font-semibold text-white">
                Simplified Exchange
              </div>
              {/* Clause Reference */}
              <div className="text-[9px] font-mono text-zinc-400 bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/80 inline-block">
                Act 10/2014 &sect;4(a) &bull; <Acro term="MMA" /> Reg &sect;8-9; Money Changing Reg &sect;14
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Standard retail exchange below MVR 50,000 (approx. <Acro term="USD" /> 3,240).
              </p>
              
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 text-xs text-zinc-400">
                <div className="text-[11px] font-semibold text-zinc-300">Minimum Requirements:</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Numbered exchange receipt issued</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Customer name and contact number recorded</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Identity inspection recommended for unfamiliar customers</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-mono text-[10px]"><Acro term="FIU" /> Reporting:</span>
              <span className="text-zinc-400 font-mono">None</span>
            </div>
          </div>

          {/* TIER 2 */}
          <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider">
                  Tier 2
                </span>
                <span className="text-xs font-mono font-bold text-zinc-200">50K - 199,999 <Acro term="MVR" /></span>
              </div>
              <div className="text-sm font-semibold text-white">
                Mandatory <Acro term="CDD" />
              </div>
              {/* Clause Reference */}
              <div className="text-[9px] font-mono text-zinc-400 bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/80 inline-block">
                Act 10/2014 &sect;4(b)(1) &bull; <Acro term="MMA" /> Reg &sect;7, &sect;10; Archival &sect;15
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Occasional transactions between MVR 50,000 and MVR 199,999.
              </p>
              
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 text-xs text-zinc-400">
                <div className="text-[11px] font-semibold text-zinc-300">Mandatory Requirements:</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Valid <Acro term="NIC" /> (citizens) or Passport + Visa (foreigners)</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Permanent and local residential address verified</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Stated purpose of transaction recorded</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Written authorization verified if transacting for third party</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-mono text-[10px]">Retention Period:</span>
              <span className="text-zinc-300 font-mono">5 Years (&sect;15)</span>
            </div>
          </div>

          {/* TIER 3 */}
          <div className="rounded-xl bg-zinc-900/40 border border-zinc-800 p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-wider">
                  Tier 3
                </span>
                <span className="text-xs font-mono font-bold text-zinc-200">&ge; 200,000 <Acro term="MVR" /></span>
              </div>
              <div className="text-sm font-semibold text-white">
                Statutory <Acro term="CTR" /> &amp; <Acro term="EDD" />
              </div>
              {/* Clause Reference */}
              <div className="text-[9px] font-mono text-zinc-400 bg-zinc-950/60 px-2 py-0.5 rounded border border-zinc-800/80 inline-block">
                Act 10/2014 &sect;16-17 &bull; <Acro term="MMA" /> Reg &sect;11-12 &amp; &sect;18-19
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Large cash transactions reaching or exceeding MVR 200,000 (approx. <Acro term="USD" /> 12,970).
              </p>
              
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 text-xs text-zinc-400">
                <div className="text-[11px] font-semibold text-zinc-300">Enhanced Requirements:</div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>All Tier 2 <Acro term="CDD" /> identification documents</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Verified Source of Funds (bank withdrawal voucher &lt;30 days, salary slip)</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Senior Management approval recorded prior to settlement</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-zinc-600 font-mono mt-0.5">-</span>
                  <span>Consolidated into monthly <Acro term="CTR" /> submission to <Acro term="MMA" /></span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-mono text-[10px]"><Acro term="FIU" /> Filing:</span>
              <span className="text-zinc-300 font-mono font-bold">Monthly (by 15th)</span>
            </div>
          </div>
        </div>

        {/* Universal Standard: Suspicious Activity Card */}
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
              <ShieldAlert size={15} />
            </div>
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <span>Universal Trigger: Suspicious Transaction Report (<Acro term="STR" />)</span>
                <span className="text-[9px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                  Any Amount
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  Clause: Act No. 10/2014 &sect;18-19 &bull; <Acro term="MMA" /> Reg &sect;17
                </span>
              </div>
              <p className="text-zinc-400 mt-0.5">
                Regardless of transaction size, if there is reasonable ground to suspect funds are proceeds of an unlawful activity or intended for terrorism financing, an <Acro term="STR" /> must be submitted directly to the <Acro term="FIU" />.
              </p>
            </div>
          </div>

          <div className="text-right shrink-0 sm:pl-4 sm:border-l sm:border-zinc-800">
            <div className="text-[10px] font-mono text-zinc-500 uppercase">Statutory Deadline</div>
            <div className="text-xs font-mono font-bold text-zinc-200">Within 3 Working Days</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CASHIER COMPLIANCE CALCULATOR */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Threshold Determination Tool
            </h2>
            <p className="text-xs text-zinc-500">
              Enter transaction parameters to evaluate applicable regulatory tier and mandatory document requirements.
            </p>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Clause: Act No. 10/2014 &sect;4 &bull; <Acro term="MMA" /> Reg &sect;7, &sect;11, &sect;18
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Transaction Amount
            </label>
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-600"
              placeholder="50000"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              Currency
            </label>
            <select
              value={calcCurrency}
              onChange={(e) => setCalcCurrency(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-600"
            >
              <option value="MVR">MVR - Maldivian Rufiyaa</option>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </div>

          {calcCurrency !== 'MVR' ? (
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Conversion Rate to <Acro term="MVR" />
              </label>
              <input
                type="number"
                step="0.01"
                value={calcExchangeRate}
                onChange={(e) => setCalcExchangeRate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-zinc-600"
                placeholder="15.42"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                Calculated Equivalent
              </label>
              <div className="h-[34px] bg-zinc-950/60 border border-zinc-800/80 rounded-lg px-3 flex items-center font-mono text-xs text-zinc-300">
                MVR {mvrEquivalent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}
        </div>

        {/* Result Banner */}
        <div className="p-3.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded uppercase">
                {activeTier.tierTag}
              </span>
              <span className="font-semibold text-white">
                {activeTier.name}
              </span>
              <span className="text-[9px] font-mono text-zinc-400">
                Clause: {activeTier.clause}
              </span>
            </div>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              {activeTier.summary}
            </p>
          </div>

          <div className="text-right shrink-0 sm:pl-4 sm:border-l sm:border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase font-mono">Calculated <Acro term="MVR" /></div>
            <div className="text-sm font-bold font-mono text-zinc-200">
              MVR {mvrEquivalent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: DOCUMENT VERIFICATION MATRIX */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Customer Identification Documents Matrix
            </h2>
            <p className="text-xs text-zinc-500">
              Approved primary identification and verification records under <Acro term="MMA" /> <Acro term="AML" />/<Acro term="CFT" /> rules.
            </p>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Clause: Act No. 10/2014 &sect;6-7 &bull; <Acro term="MMA" /> Reg &sect;8, &sect;10, &sect;11(2)
          </span>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
          <button
            onClick={() => setSelectedDocCategory('individual')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              selectedDocCategory === 'individual'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users size={13} className="text-zinc-400" />
            <span>Maldivian Nationals</span>
          </button>
          <button
            onClick={() => setSelectedDocCategory('foreigner')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              selectedDocCategory === 'foreigner'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Coins size={13} className="text-zinc-400" />
            <span>Foreign Tourists &amp; Expatriates</span>
          </button>
          <button
            onClick={() => setSelectedDocCategory('corporate')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              selectedDocCategory === 'corporate'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Building2 size={13} className="text-zinc-400" />
            <span>Corporate / Business Entities</span>
          </button>
        </div>

        {/* Matrix Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {selectedDocCategory === 'individual' && (
            <>
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Primary Identification Document
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: Act 10/2014 &sect;6 &bull; <Acro term="MMA" /> Reg &sect;8(a)
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">National Identity Card (<Acro term="NIC" />):</strong> Original, unexpired card or authenticated eFaas digital identity. Cashiers must verify full legal name, photo likeness, ID number (AXXXXXX), and date of expiry.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Valid Passport:</strong> Acceptable secondary primary identity document if <Acro term="NIC" /> is undergoing renewal with official DNR receipt.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Supplementary Verification Records
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: <Acro term="MMA" /> Reg &sect;8(c) &amp; &sect;11(2)
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">Residential Address:</strong> Permanent island/atoll address as specified on <Acro term="NIC" /> and current verified living address in Male&apos; or atolls.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Telephone Number:</strong> Active mobile contact number recorded in <Acro term="CDD" /> register.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Source of Funds (&ge; 200,000 <Acro term="MVR" />):</strong> Official bank cash withdrawal voucher or statement dated within the preceding 30 days, authenticated payslip, or documented asset sales agreement.
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedDocCategory === 'foreigner' && (
            <>
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Primary Identity &amp; Immigration Status
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: Act 10/2014 &sect;6 &bull; <Acro term="MMA" /> Reg &sect;8(b)
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">Valid International Passport:</strong> Machine-readable international passport with a minimum of 6 months remaining validity. Record passport number, issuing jurisdiction, and full legal name.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Immigration Status (Expatriate Workers):</strong> Valid Work Permit Card or Resident Visa issued by Maldives Immigration.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Local Address &amp; Purpose
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: <Acro term="MMA" /> Reg &sect;8(d) &amp; &sect;11(2)
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">Tourists:</strong> Name and island location of confirmed resort, guesthouse, or hotel accommodation.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Resident Workers:</strong> Registered local employer, official workplace address, and contact number in Maldives.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Source of Funds (&ge; 200,000 <Acro term="MVR" />):</strong> Customs currency declaration slip, foreign <Acro term="ATM" /> withdrawal receipt, or verified bank statement.
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedDocCategory === 'corporate' && (
            <>
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Corporate Registration Records
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: Act 10/2014 &sect;7 &bull; <Acro term="MMA" /> Reg &sect;10
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">Certificate of Incorporation:</strong> Official business registration issued by Ministry of Economic Development (<Acro term="MED" />).
                  </div>
                  <div>
                    <strong className="text-zinc-200">Register of Directors (Form 8):</strong> Certified extract confirming active company directors and executive leadership.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Beneficial Ownership Record:</strong> Identification of natural persons holding 25% or greater equity or effective controlling interest.
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                  <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                    Representative Authorization Mandate
                  </span>
                  <span className="text-[9px] font-mono text-zinc-400">
                    Clause: Act 10/2014 &sect;7(3) &bull; <Acro term="MMA" /> Reg &sect;10(4)
                  </span>
                </div>
                <div className="space-y-2 text-zinc-400 leading-relaxed">
                  <div>
                    <strong className="text-zinc-200">Board Resolution / Power of Attorney:</strong> Written board resolution or authenticated authorization on company letterhead explicitly appointing the designated counter agent.
                  </div>
                  <div>
                    <strong className="text-zinc-200">Representative Identification:</strong> Valid <Acro term="NIC" /> or Passport of the individual physically executing the cash exchange.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SECTION 4: STATUTORY SUBMISSION TIMELINES */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Statutory Submission Schedules
            </h2>
            <p className="text-xs text-zinc-500">
              Mandatory filing deadlines to the Maldives Monetary Authority (<Acro term="MMA" />) and Financial Intelligence Unit (<Acro term="FIU" />).
            </p>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Clause: Act 10/2014 &sect;16-19 &bull; <Acro term="MMA" /> Reg &sect;17-20
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Daily Card */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1.5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px]">
                <span>SHIFT BALANCE</span>
                <Clock size={12} className="text-zinc-400" />
              </div>
              <div className="font-semibold text-white text-xs">Daily Reconciliation</div>
              <div className="text-[9px] font-mono text-zinc-400">
                Clause: Money Changing Reg &sect;16
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Foreign currency vault and till balance certified upon completion of each counter trading shift.
              </p>
            </div>
            <div className="pt-2 text-[10px] font-mono text-zinc-400 border-t border-zinc-800/80">
              End of trading day
            </div>
          </div>

          {/* Weekly Card */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1.5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px]">
                <span>MMA &sect;20 TURNOVER</span>
                <Calendar size={12} className="text-zinc-400" />
              </div>
              <div className="font-semibold text-white text-xs">Weekly Transfer Report</div>
              <div className="text-[9px] font-mono text-zinc-400">
                Clause: Act 10/2014 &sect;20 &bull; <Acro term="FX" /> Reg &sect;20
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Consolidated foreign currency purchase and sales volume report submitted to <Acro term="MMA" />.
              </p>
            </div>
            <div className="pt-2 text-[10px] font-mono text-zinc-400 border-t border-zinc-800/80">
              Weekly (Every Sunday)
            </div>
          </div>

          {/* Monthly CTR Card */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1.5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px]">
                <span>STATUTORY CTR</span>
                <FileText size={12} className="text-zinc-400" />
              </div>
              <div className="font-semibold text-white text-xs">Monthly <Acro term="CTR" /> Filing</div>
              <div className="text-[9px] font-mono text-zinc-400">
                Clause: Act 10/2014 &sect;16 &bull; <Acro term="MMA" /> Reg &sect;18-19
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Registry of all cash transactions reaching or exceeding MVR 200,000 transmitted to the <Acro term="FIU" />.
              </p>
            </div>
            <div className="pt-2 text-[10px] font-mono text-zinc-400 border-t border-zinc-800/80">
              15th of following month
            </div>
          </div>

          {/* Event-Driven STR Card */}
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-1.5 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px]">
                <span>MMA &sect;17 STR</span>
                <ShieldAlert size={12} className="text-zinc-400" />
              </div>
              <div className="font-semibold text-white text-xs">Suspicious Report (<Acro term="STR" />)</div>
              <div className="text-[9px] font-mono text-zinc-400">
                Clause: Act 10/2014 &sect;18 &bull; <Acro term="MMA" /> Reg &sect;17
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Event-driven filing transmitted confidentially to the <Acro term="FIU" /> upon forming reasonable suspicion.
              </p>
            </div>
            <div className="pt-2 text-[10px] font-mono text-zinc-400 border-t border-zinc-800/80">
              Within 3 working days
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5: STRUCTURING DETECTION */}
      <div className="p-4 sm:p-5 rounded-xl bg-zinc-900/40 border border-zinc-800 space-y-2 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="font-bold text-white uppercase tracking-wider text-xs">
            5. Detection of Transaction Structuring (Smurfing)
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Clause: Act No. 10/2014 &sect;4(c) &amp; &sect;53 &bull; <Acro term="MMA" /> Reg &sect;7(4)
          </span>
        </div>
        <p className="text-zinc-400 leading-relaxed">
          Structuring is the deliberate fragmentation of a single commercial transaction into multiple smaller transfers (e.g. MVR 48,000 or MVR 195,000) within 24 to 48 hours to evade statutory <Acro term="CDD" /> or <Acro term="CTR" /> reporting thresholds.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-zinc-400 border-t border-zinc-800/80">
          <div>
            <strong className="text-zinc-300 block mb-1">Indicators of Structuring:</strong>
            <div className="space-y-1">
              <div>- Requesting multiple separate receipts below reporting thresholds</div>
              <div>- Repeated counter visits within a short time frame by the same party</div>
              <div>- Customer abruptly terminating exchange when requested for identity card</div>
              <div>- Third parties coordinating cash exchange outside counter premises</div>
            </div>
          </div>
          <div>
            <strong className="text-zinc-300 block mb-1">Counter Action Protocol:</strong>
            <div className="space-y-1">
              <div>- Aggregate linked transactions occurring within 48 hours into unified assessment (&sect;7(4))</div>
              <div>- Apply mandatory <Acro term="CDD" /> verification if combined total exceeds MVR 50,000</div>
              <div>- File internal suspicious transaction escalation (<Acro term="STR" />) if structuring is apparent</div>
              <div>- Strictly maintain customer confidentiality under anti-tipping off rules (&sect;24)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
