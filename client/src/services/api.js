// client/src/services/api.js

import axios from 'axios';

const API_URL = '/api';

export const submitERCProtest = async (formData) => {
  const response = await axios.post(`${API_URL}/erc-protest/submit`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
};

export const getSubmissions = async () => {
  const token = localStorage.getItem('admin_token'); // You'll need to handle authentication
  const response = await axios.get(`${API_URL}/erc-protest/admin/submissions`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  return response.data;
};

export const updateTracking = async (submissionId, trackingNumber) => {
  const token = localStorage.getItem('admin_token');
  const response = await axios.post(
    `${API_URL}/erc-protest/admin/update-tracking`,
    { submissionId, trackingNumber, status: 'mailed' },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
};

export const getSubmissionStatus = async (trackingId) => {
  try {
    const response = await axios.get(`${API_URL}/erc-protest/status/${trackingId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching submission status:', error);
    throw error;
  }
};

export const updateSubmissionStatus = async (trackingId, status, paths = {}) => {
  try {
    const response = await axios.post(`${API_URL}/erc-protest/update-status`, {
      trackingId,
      status,
      ...paths
    });
    return response.data;
  } catch (error) {
    console.error('Error updating submission status:', error);
    throw error;
  }
};