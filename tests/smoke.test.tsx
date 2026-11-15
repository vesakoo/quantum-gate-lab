import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/ui/App';

describe('App', () => {
  it('renders the drag hint', () => {
    render(<App />);
    expect(screen.getByText('Drag gate to circuit')).toBeInTheDocument();
  });
});
