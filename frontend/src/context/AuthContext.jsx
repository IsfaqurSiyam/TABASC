import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';
import { installUnauthorizedInterceptor } from './authInterceptor';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const savedUser = localStorage.getItem('tabascUser');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.token}`;
    }
    const interceptorId = installUnauthorizedInterceptor(
      axios,
      () => {
        setUser(null);
        localStorage.removeItem('tabascUser');
        delete axios.defaults.headers.common['Authorization'];
      }
    );
    setLoading(false);
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  const login = async (email, password) => {
    const res = await axios.post(
      `${API_URL}/auth/login`,
      { email, password }
    );
    setUser(res.data);
    localStorage.setItem('tabascUser', JSON.stringify(res.data));
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    return res.data;
  };

  const register = async (formData) => {
    const res = await axios.post(
      `${API_URL}/auth/register`,
      formData
    );
    setUser(res.data);
    localStorage.setItem('tabascUser', JSON.stringify(res.data));
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    return res.data;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('tabascUser');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);