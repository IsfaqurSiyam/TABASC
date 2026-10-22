import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { useAuth } from '../context/AuthContext';

vi.mock('axios');
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn()
}));

test('successful registration shows pending approval instead of crashing or logging in', async () => {
  const logout = vi.fn();
  const register = vi.fn().mockResolvedValue({ approvalStatus: 'pending' });
  useAuth.mockReturnValue({ register, logout });
  axios.get.mockResolvedValue({
    data: { version: '1.0', terms: ['Follow the network rules.'] }
  });

  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  await screen.findByText('Follow the network rules.');
  fireEvent.change(document.querySelector('input[name="name"]'), {
    target: { value: 'Example stakeholder' }
  });
  fireEvent.change(document.querySelector('input[name="email"]'), {
    target: { value: 'stakeholder@example.test' }
  });
  fireEvent.change(document.querySelector('input[name="password"]'), {
    target: { value: 'password123' }
  });

  const agreementCheckbox = await screen.findByRole('checkbox');
  fireEvent.click(agreementCheckbox);
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(/awaiting administrator approval/i);
  });
  expect(register).toHaveBeenCalledWith(expect.objectContaining({
    agreementAccepted: true,
    agreementVersion: '1.0'
  }));
  expect(logout).toHaveBeenCalled();
});
