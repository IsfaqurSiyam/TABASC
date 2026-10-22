import axios from 'axios';

export const installUnauthorizedInterceptor = (
  client,
  onUnauthorized,
  redirectToLogin = () => {
    if (window.location.pathname === '/login') return;
    window.history.replaceState({}, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
) => client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      onUnauthorized();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);
