// server/routes/admin.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');

// Get all submissions
router.get('/submissions', async (req, res) => {
  try {
    // Get data from Google Sheets (admin dashboard)
    const submissions = await googleSheetsService.getAllSubmissions();
    
    res.status(200).json({
      success: true,
      submissions
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching submissions: ${error.message}`
    });
  }
});

// Update tracking number
router.post('/update-tracking', async (req, res) => {
  try {
    const { submissionId, trackingNumber, status } = req.body;
    
    if (!submissionId || !trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID and tracking number are required'
      });
    }
    
    // Update Google Sheets
    await googleSheetsService.updateSubmission(submissionId, {
      status: status || 'mailed',
      trackingNumber,
      timestamp: new Date().toISOString()
    });
    
    // Also update the local file if it exists
    try {
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`);
      const submissionData = await fs.readFile(submissionPath, 'utf8');
      const submissionInfo = JSON.parse(submissionData);
      
      submissionInfo.status = status || 'mailed';
      submissionInfo.trackingNumber = trackingNumber;
      submissionInfo.timestamp = new Date().toISOString();
      
      await fs.writeFile(
        submissionPath,
        JSON.stringify(submissionInfo, null, 2)
      );
    } catch (fileErr) {
      console.log(`Local file for ${submissionId} not found, skipping update`);
    }
    
    res.status(200).json({
      success: true,
      message: 'Tracking number updated successfully'
    });
  } catch (error) {
    console.error('Error updating tracking number:', error);
    res.status(500).json({
      success: false,
      message: `Error updating tracking number: ${error.message}`
    });
  }
});

// Download file
router.get('/download', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Send file
    res.download(filePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: `Error downloading file: ${error.message}`
    });
  }
});

module.exports = router;