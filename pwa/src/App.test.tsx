import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('Viri Dashboard PWA', () => {
  beforeEach(() => {
    render(<App />);
  });

  it('renders the Viri Zero-Knowledge trust badge', () => {
    expect(screen.getByText(/Viri Zero-Knowledge Architecture/i)).toBeDefined();
  });

  it('allows selecting the receiving account', () => {
    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();
    
    // Default selected should be Business Checking
    expect((select as HTMLSelectElement).value).toBe('acc_1');
    
    // Change to Savings
    fireEvent.change(select, { target: { value: 'acc_2' } });
    expect((select as HTMLSelectElement).value).toBe('acc_2');
  });

  it('toggles bank selection between BML and MIB', () => {
    const bmlBtn = screen.getByText('BML');
    const mibBtn = screen.getByText('MIB');

    // MIB selected
    fireEvent.click(mibBtn);
    expect(mibBtn.className).toContain('text-[var(--bg-canvas)]'); // Active style

    // Back to BML
    fireEvent.click(bmlBtn);
    expect(bmlBtn.className).toContain('text-[var(--bg-canvas)]'); // Active style
  });

  it('renders the Daily Totals analytics node', () => {
    expect(screen.getByText('Daily Totals')).toBeDefined();
    expect(screen.getByText(/Checking/i)).toBeDefined();
    expect(screen.getByText(/Savings/i)).toBeDefined();
  });
});
