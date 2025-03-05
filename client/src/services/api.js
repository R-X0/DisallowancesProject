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

// Generate an ERC protest letter using our ChatGPT scraper
export const generateERCProtestLetter = async (letterData) => {
  try {
    console.log('Generating protest letter with data:', letterData);
    
    // Make sure we have the ChatGPT link
    if (!letterData.chatGptLink) {
      throw new Error('ChatGPT conversation link is required');
    }
    
    // Call the ChatGPT scraper endpoint
    const response = await axios.post(
      `${API_URL}/erc-protest/chatgpt/process-chatgpt`,
      letterData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        // Increase timeout for the scraping process which may take time
        // This is extra important now that we're generating PDFs for each link
        timeout: 300000 // 5 minutes
      }
    );
    
    console.log('Successfully received response from ChatGPT scraper');
    return response.data;
  } catch (error) {
    console.error('Error in generateERCProtestLetter:', error);
    
    // Provide a more helpful error message
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Server responded with error:', error.response.data);
      throw new Error(error.response.data.message || 'Server error occurred');
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server:', error.request);
      throw new Error('No response received from server. The process might be taking longer than expected due to PDF generation. Try again or check with administrator.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
      throw error;
    }
  }
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