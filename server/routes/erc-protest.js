// server/routes/erc-protest.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const googleSheetsService = require('../services/googleSheetsService');
const googleDriveService = require('../services/googleDriveService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/temp'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Submit ERC protest form
router.post('/submit', upload.array('disallowanceNotices', 5), async (req, res) => {
  try {
    const { businessName, ein, location, businessWebsite, naicsCode, timePeriod, additionalInfo } = req.body;
    const files = req.files;
    
    // Generate tracking ID
    const trackingId = `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Create directory for this submission
    const submissionDir = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}`);
    await fs.mkdir(submissionDir, { recursive: true });
    
    // Move uploaded files to submission directory
    const fileInfo = [];
    for (const file of files) {
      const newPath = path.join(submissionDir, file.originalname);
      await fs.rename(file.path, newPath);
      fileInfo.push({
        originalName: file.originalname,
        path: newPath,
        mimetype: file.mimetype,
        size: file.size
      });
    }
    
    // Save submission info
    const submissionInfo = {
      trackingId,
      businessName,
      ein,
      location,
      businessWebsite,
      naicsCode,
      timePeriod,
      additionalInfo,
      files: fileInfo,
      timestamp: new Date().toISOString(),
      status: 'Gathering data'
    };
    
    // Create a Google Drive folder for this submission
    try {
      const driveFolder = await googleDriveService.createSubmissionFolder(trackingId, businessName);
      
      // Add Google Drive folder link to submission info
      submissionInfo.googleDriveLink = driveFolder.folderLink;
      
      console.log(`Created Google Drive folder for ${trackingId}: ${driveFolder.folderLink}`);
    } catch (driveError) {
      console.error('Error creating Google Drive folder:', driveError);
      // Continue anyway, not a critical error
    }
    
    await fs.writeFile(
      path.join(submissionDir, 'submission_info.json'),
      JSON.stringify(submissionInfo, null, 2)
    );
    
    // Add to Google Sheet for tracking
    try {
      await googleSheetsService.addSubmission({
        trackingId,
        businessName,
        ein,                  // Pass all these fields
        location,
        businessWebsite,
        naicsCode,
        timePeriod,
        additionalInfo,       // Pass additional info
        status: 'Gathering data',
        timestamp: new Date().toISOString(),
        googleDriveLink: submissionInfo.googleDriveLink || '',
        protestLetterPath: '',
        zipPath: ''
      });
      
      console.log('Added submission to Google Sheet with all fields');
    } catch (sheetError) {
      console.error('Error adding to Google Sheet:', sheetError);
      // Continue anyway, not a critical error
    }
    
    res.status(201).json({
      success: true,
      message: 'Submission received successfully',
      trackingId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({
      success: false,
      message: `Error processing submission: ${error.message}`
    });
  }
});

// Get submission status
router.get('/status/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    if (!trackingId) {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID is required'
      });
    }
    
    // Look up submission status
    try {
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`);
      const submissionData = await fs.readFile(submissionPath, 'utf8');
      const submissionInfo = JSON.parse(submissionData);
      
      res.status(200).json({
        success: true,
        status: submissionInfo.status,
        timestamp: submissionInfo.timestamp,
        businessName: submissionInfo.businessName,
        timePeriod: submissionInfo.timePeriod
      });
    } catch (err) {
      // If file doesn't exist, check Google Sheet
      try {
        const submissions = await googleSheetsService.getAllSubmissions();
        const submission = submissions.find(s => s.trackingId === trackingId);
        
        if (submission) {
          res.status(200).json({
            success: true,
            status: submission.status,
            timestamp: submission.timestamp,
            businessName: submission.businessName,
            timePeriod: submission.timePeriod
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'Submission not found'
          });
        }
      } catch (sheetError) {
        console.error('Error checking Google Sheet:', sheetError);
        res.status(404).json({
          success: false,
          message: 'Submission not found'
        });
      }
    }
  } catch (error) {
    console.error('Error fetching submission status:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching submission status: ${error.message}`
    });
  }
});

// Update submission status (for testing or API usage)
router.post('/update-status', async (req, res) => {
  try {
    const { trackingId, status, protestLetterPath, zipPath, googleDriveLink } = req.body;
    
    if (!trackingId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Tracking ID and status are required'
      });
    }
    
    // Update the local file if it exists
    try {
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`);
      const submissionData = await fs.readFile(submissionPath, 'utf8');
      const submissionInfo = JSON.parse(submissionData);
      
      submissionInfo.status = status;
      submissionInfo.timestamp = new Date().toISOString();
      
      if (protestLetterPath) {
        submissionInfo.protestLetterPath = protestLetterPath;
      }
      
      if (zipPath) {
        submissionInfo.zipPath = zipPath;
      }
      
      if (googleDriveLink) {
        submissionInfo.googleDriveLink = googleDriveLink;
      }
      
      await fs.writeFile(
        submissionPath,
        JSON.stringify(submissionInfo, null, 2)
      );
    } catch (err) {
      console.log(`Local file for ${trackingId} not found, skipping update`);
    }
    
    // Update Google Sheet
    try {
      await googleSheetsService.updateSubmission(trackingId, {
        status,
        protestLetterPath,
        zipPath,
        googleDriveLink,
        timestamp: new Date().toISOString()
      });
      
      res.status(200).json({
        success: true,
        message: 'Status updated successfully'
      });
    } catch (sheetError) {
      console.error('Error updating Google Sheet:', sheetError);
      res.status(500).json({
        success: false,
        message: `Error updating status: ${sheetError.message}`
      });
    }
  } catch (error) {
    console.error('Error updating submission status:', error);
    res.status(500).json({
      success: false,
      message: `Error updating status: ${error.message}`
    });
  }
});

module.exports = router;