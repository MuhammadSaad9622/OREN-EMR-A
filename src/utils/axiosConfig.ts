import axios from 'axios';
import { API_URL } from '../config/constants';

// Set default base URL for all axios requests
axios.defaults.baseURL = API_URL;

// Set default timeout for all requests (90 seconds)
// This is especially important for operations like PDF generation and email sending
axios.defaults.timeout = 90000;

// Add a request interceptor to include auth token if available
axios.interceptors.request.use(
  (config) => {
    // Get the token from localStorage
    const token = localStorage.getItem('token');
    
    // If token exists, add it to the Authorization header
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle common errors
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('Axios error:', error);
    
    // Handle specific error cases
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log('Error data:', error.response.data);
      console.log('Error status:', error.response.status);
      
      // If token is invalid (403), clear it from localStorage
      if (error.response.status === 403 && error.response.data.message === 'Invalid token') {
        console.log('Invalid token detected, clearing authentication data');
        localStorage.removeItem('token');
        // Reload the page to reset the app state
        window.location.href = '/login';
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.log('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log('Error message:', error.message);
    }
    
    return Promise.reject(error);
  }
);

export default axios;