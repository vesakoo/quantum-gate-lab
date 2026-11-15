import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/ui/App';
import ProbabilityChart, { basisLabel, visibleRows } from '../../src/ui/ProbabilityChart';

beforeEach(() => {
  history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('chart helpers', () => {
  it('basisLabel puts q[0] leftmost', () => {
    expect(basisLabel(4, 4)).toBe('0100');
    expect(basisLabel(6, 4)).toBe('0110');
  });
  it('visibleRows hides rows that round to 0.0 %', () => {
    expect(visibleRows([0.5, 1e-17, 0.5, 0], true)).toEqual([0, 2]);
    expect(visibleRows([0.5, 1e-17, 0.5, 0], false)).toEqual([0, 1, 2, 3]);
  });
});

describe('ProbabilityChart', () => {
  it('renders title, checkbox and clean percentages', () => {
    const { container } = render(<ProbabilityChart probabilities={[0.5, -1e-17, 0.5, 0]} numQubits={2} />);
    expect(screen.getByText('Output probabilities')).toBeTruthy();
    expect(screen.getByLabelText('Hide 0% rows')).toBeTruthy();
    expect(container.textContent).not.toContain('-0.0');
    expect(container.textContent).toContain('50.0 %');
  });
  it('hiding zero rows removes them', () => {
    const { container } = render(<ProbabilityChart probabilities={[1, 0, 0, 0]} numQubits={2} />);
    expect(container.textContent).toContain('11');
    fireEvent.click(screen.getByLabelText('Hide 0% rows'));
    expect(container.textContent).not.toContain('11');
  });
});

describe('Load', () => {
  it('invalid JSON shows an error and keeps the circuit', async () => {
    render(<App />);
    const before = location.hash;
    const input = screen.getByLabelText('Load circuit file') as HTMLInputElement;
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('not json') });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid JSON'));
    expect(location.hash).toBe(before);
  });
});
