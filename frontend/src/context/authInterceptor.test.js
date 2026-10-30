import axios from 'axios';
import { installUnauthorizedInterceptor } from './authInterceptor';

test('401 responses clear authentication and redirect to login', async () => {
  const client = axios.create();
  const onUnauthorized = vi.fn();
  const redirectToLogin = vi.fn();
  const interceptorId = installUnauthorizedInterceptor(
    client,
    onUnauthorized,
    redirectToLogin
  );
  client.defaults.adapter = async (config) => {
    const error = new Error('Unauthorized');
    error.config = config;
    error.response = { status: 401, config };
    throw error;
  };

  await expect(client.get('/private')).rejects.toThrow('Unauthorized');
  expect(onUnauthorized).toHaveBeenCalledOnce();
  expect(redirectToLogin).toHaveBeenCalledOnce();
  client.interceptors.response.eject(interceptorId);
});

test('non-401 responses do not clear authentication or redirect', async () => {
  const client = axios.create();
  const onUnauthorized = vi.fn();
  const redirectToLogin = vi.fn();
  const interceptorId = installUnauthorizedInterceptor(
    client,
    onUnauthorized,
    redirectToLogin
  );
  client.defaults.adapter = async (config) => {
    const error = new Error('Forbidden');
    error.config = config;
    error.response = { status: 403, config };
    throw error;
  };

  await expect(client.get('/private')).rejects.toThrow('Forbidden');
  expect(onUnauthorized).not.toHaveBeenCalled();
  expect(redirectToLogin).not.toHaveBeenCalled();
  client.interceptors.response.eject(interceptorId);
});
