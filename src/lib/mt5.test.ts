// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseMt5Html } from './mt5';

const MT5_REPORT = `
<html><body>
<table>
  <tr><td>Positions</td></tr>
  <tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td><td>Commission</td><td>Swap</td><td>Profit</td></tr>
  <tr><td>2026.10.05 10:15:00</td><td>123456</td><td>EURUSD</td><td>buy</td><td>0.50</td><td>1.10000</td><td>1.09500</td><td>1.11000</td><td>2026.10.05 11:30:00</td><td>1.10800</td><td>-3.50</td><td>0.00</td><td>40.00</td></tr>
  <tr><td>2026.10.06 16:00:00</td><td>123457</td><td>XAUUSD</td><td>sell</td><td>0.10</td><td>2000.00</td><td>0.00</td><td>0.00</td><td>2026.10.06 16:45:00</td><td>2010.00</td><td>-1.00</td><td>-0.50</td><td>-100.00</td></tr>
  <tr><td>Orders</td></tr>
  <tr><td>Time</td><td>Order</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>State</td></tr>
  <tr><td>2026.10.05 10:15:00</td><td>1</td><td>EURUSD</td><td>buy</td><td>0.50</td><td>1.10000</td><td>filled</td></tr>
  <tr><td>Deals</td></tr>
  <tr><td>Time</td><td>Deal</td><td>Symbol</td><td>Type</td><td>Direction</td><td>Volume</td><td>Price</td><td>Order</td><td>Commission</td><td>Swap</td><td>Profit</td><td>Balance</td></tr>
  <tr><td>2026.10.05 10:15:00</td><td>1</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.50</td><td>1.10000</td><td>1</td><td>-3.50</td><td>0.00</td><td>0.00</td><td>10000.00</td></tr>
  <tr><td>2026.10.01 00:00:00</td><td>0</td><td></td><td>balance</td><td></td><td></td><td></td><td></td><td></td><td></td><td>10000.00</td><td>10000.00</td></tr>
</table>
</body></html>`;

describe('parseMt5Html', () => {
  it('importe les positions clôturées et ignore ordres et deals', () => {
    const result = parseMt5Html(MT5_REPORT, 'acc-1', 'UTC');
    expect(result.errors).toEqual([]);
    expect(result.total).toBe(2);
    expect(result.trades).toHaveLength(2);

    const [eur, xau] = result.trades;
    expect(eur.instrument).toBe('EURUSD');
    expect(eur.direction).toBe('long');
    expect(eur.opened_at).toBe('2026-10-05T10:15:00.000Z');
    expect(eur.closed_at).toBe('2026-10-05T11:30:00.000Z');
    expect(eur.entry_price).toBe(1.1);
    expect(eur.exit_price).toBe(1.108);
    expect(eur.stop_loss).toBe(1.095);
    expect(eur.take_profit).toBe(1.11);
    expect(eur.size).toBe(0.5);
    expect(eur.gross_pnl).toBe(40);
    expect(eur.fees).toBe(3.5);
    expect(eur.external_id).toBe('mt:123456');
    expect(eur.source).toBe('import');

    expect(xau.direction).toBe('short');
    expect(xau.gross_pnl).toBe(-100);
    // Frais = commission + taxes − swap ; un swap négatif (−0,50) ajoute 0,50 aux frais
    expect(xau.fees).toBe(1.5);
    expect(xau.stop_loss).toBeNull();
  });

  it('accepte le format MT4 « Account History » (Ticket / Item)', () => {
    const mt4 = `
      <table>
        <tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
        <tr><td>987</td><td>2026.10.05 10:15:00</td><td>buy</td><td>1.00</td><td>GBPUSD</td><td>1.25000</td><td>0.00000</td><td>0.00000</td><td>2026.10.05 12:00:00</td><td>1.25500</td><td>-7.00</td><td>0.00</td><td>0.00</td><td>50.00</td></tr>
      </table>`;
    const result = parseMt5Html(mt4, 'acc-1', 'UTC');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].instrument).toBe('GBPUSD');
    expect(result.trades[0].external_id).toBe('mt:987');
    expect(result.trades[0].fees).toBe(7);
  });

  it('signale un fichier sans tableau de positions', () => {
    const result = parseMt5Html('<p>Rapport vide</p>', 'acc-1', 'UTC');
    expect(result.trades).toHaveLength(0);
    expect(result.errors[0]).toContain('Aucun tableau de positions');
  });
});
