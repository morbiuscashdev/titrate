import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EncryptedField } from './EncryptedField.js';

describe('EncryptedField', () => {
  const longCiphertext = 'abcdef1234567890abcdef';

  it('renders truncated ciphertext', () => {
    render(<EncryptedField ciphertext={longCiphertext} />);
    expect(screen.getByText('abcdef123456...')).toBeInTheDocument();
  });

  it('does not display the full ciphertext', () => {
    render(<EncryptedField ciphertext={longCiphertext} />);
    expect(screen.queryByText(longCiphertext)).toBeNull();
  });

  it('renders short ciphertext without truncation', () => {
    render(<EncryptedField ciphertext="abc123" />);
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('shows the lock icon', () => {
    render(<EncryptedField ciphertext={longCiphertext} />);
    expect(screen.getByLabelText('Unlock')).toBeInTheDocument();
  });

  it('calls onUnlock when the lock is clicked', () => {
    const handleUnlock = vi.fn();
    render(<EncryptedField ciphertext={longCiphertext} onUnlock={handleUnlock} />);
    fireEvent.click(screen.getByLabelText('Unlock'));
    expect(handleUnlock).toHaveBeenCalledOnce();
  });
});
