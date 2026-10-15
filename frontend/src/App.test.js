import { render, screen } from '@testing-library/react';
import App from './App';

test('redirects unauthenticated users to the login page', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
});
