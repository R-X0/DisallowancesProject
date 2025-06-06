// server/routes/erc-protest.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
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

// Public download endpoint
router.get('/download', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }
    
    console.log(`Public download requested for file: ${filePath}`);
    
    // Check if it's a Google Drive URL or a local path
    if (filePath.startsWith('http')) {
      console.log('Detected Google Drive URL, redirecting to it');
      // If it's a URL (Google Drive link), redirect to it
      return res.redirect(filePath);
    }
    
    // Otherwise, handle it as a local file
    console.log('Handling as local file download');
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      console.error(`File not found at ${filePath}:`, error);
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`File exists, sending download: ${filePath}`);
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

router.post('/submit', upload.array('disallowanceNotices', 5), async (req, res) => {
  try {
    let { businessName, ein, location, businessWebsite, naicsCode, additionalInfo, protestPackagePath, protestLetterPath, trackingId: existingTrackingId, processedQuarter } = req.body;
    let timePeriods = req.body.timePeriods;
    const files = req.files;
    
    // DEBUG: Log received paths and tracking ID
    console.log('=== DEBUG PATH INFO ===');
    console.log('Received protestPackagePath:', protestPackagePath);
    console.log('Received protestLetterPath:', protestLetterPath);
    console.log('Received existingTrackingId:', existingTrackingId);
    console.log('Received processedQuarter:', processedQuarter);
    console.log('=====================');
    
    // Normalize paths to handle Windows backslashes
    if (protestPackagePath) {
      protestPackagePath = protestPackagePath.replace(/\\/g, '/');
      console.log('Normalized protestPackagePath:', protestPackagePath);
    }
    
    if (protestLetterPath) {
      protestLetterPath = protestLetterPath.replace(/\\/g, '/');
      console.log('Normalized protestLetterPath:', protestLetterPath);
    }
    
    // CRITICAL FIX: Ensure tracking ID is a clean string and not an array
    if (existingTrackingId) {
      // Check if it's an array or comma-separated string
      if (Array.isArray(existingTrackingId)) {
        existingTrackingId = existingTrackingId[0]; // Take first value
        console.log(`Fixed array tracking ID, using: ${existingTrackingId}`);
      } else if (typeof existingTrackingId === 'string' && existingTrackingId.includes(',')) {
        existingTrackingId = existingTrackingId.split(',')[0]; // Take first value
        console.log(`Fixed comma-separated tracking ID, using: ${existingTrackingId}`);
      }
    }
    
    // Parse timePeriods from JSON string (from FormData) if needed
    if (typeof timePeriods === 'string') {
      try {
        timePeriods = JSON.parse(timePeriods);
      } catch (e) {
        console.error('Error parsing timePeriods:', e);
        timePeriods = [timePeriods]; // Fallback to treating as single value in array
      }
    }
    
    // If timePeriods is still not an array, handle the error
    if (!Array.isArray(timePeriods)) {
      return res.status(400).json({
        success: false,
        message: 'Time periods must be provided as an array'
      });
    }
    
    // Add the processed quarter to timePeriods if it's not already there
    if (processedQuarter && !timePeriods.includes(processedQuarter)) {
      console.log(`Adding processedQuarter ${processedQuarter} to timePeriods`);
      timePeriods.push(processedQuarter);
    }
    
    // Check if this is an update to an existing submission or a new one
    let trackingId = existingTrackingId;
    
    if (!trackingId) {
      // Generate a new tracking ID for new submissions
      trackingId = `ERC-${uuidv4().substring(0, 8).toUpperCase()}`;
      console.log(`Generated new tracking ID: ${trackingId}`);
    } else {
      console.log(`Using existing tracking ID: ${trackingId}`);
    }
    
    // First look for an existing submission with this trackingId to determine if it's an update
    let isUpdate = false;
    
    // Try multiple possible paths to find existing submission
    const possiblePaths = [
      path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`),
      path.join(__dirname, `../data/ERC_Disallowances/ERC-${trackingId.replace(/^ERC-/, '')}/submission_info.json`),
      path.join(__dirname, `../data/ERC_Disallowances/${trackingId.replace(/^ERC-/, '')}/submission_info.json`)
    ];
    
    let submissionPath = null;
    let submissionInfo = {};
    
    for (const testPath of possiblePaths) {
      try {
        if (fsSync.existsSync(testPath)) {
          const existingData = await fs.readFile(testPath, 'utf8');
          submissionInfo = JSON.parse(existingData);
          submissionPath = testPath;
          isUpdate = true;
          console.log(`Found existing submission data at ${testPath}`);
          break;
        }
      } catch (readError) {
        console.log(`Error checking path ${testPath}:`, readError.message);
      }
    }
    
    if (!isUpdate) {
      console.log(`No existing data found for ${trackingId}, creating new entry`);
    }
    
    // Create directory for this submission if it doesn't exist
    const submissionDir = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}`);
    await fs.mkdir(submissionDir, { recursive: true });
    
    if (!submissionPath) {
      submissionPath = path.join(submissionDir, 'submission_info.json');
    }
    
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
    
    // For display in the Google Sheet, join multiple time periods with a comma
    const timePeriodsDisplay = timePeriods.join(', ');
    
    // Ensure processedQuarters exists and includes the current quarter if specified
    if (!submissionInfo.processedQuarters) {
      submissionInfo.processedQuarters = [];
    }
    
    if (processedQuarter && !submissionInfo.processedQuarters.includes(processedQuarter)) {
      submissionInfo.processedQuarters.push(processedQuarter);
      console.log(`Added ${processedQuarter} to processed quarters`);
    }
    
    // Update or create submission info
    submissionInfo = {
      ...submissionInfo, // Keep existing data for updates
      trackingId,
      businessName,
      ein,
      location,
      businessWebsite,
      naicsCode,
      timePeriods, // Store the full array
      timePeriodsDisplay, // Add this for display purposes
      additionalInfo,
      files: [...(submissionInfo.files || []), ...fileInfo], // Append new files to existing ones
      timestamp: new Date().toISOString(),
      status: submissionInfo.status || 'Gathering data' // Keep existing status for updates
    };
    
    // Update status if we have a protest package
    if (protestPackagePath) {
      submissionInfo.status = 'PDF done';
    }
    
    // Create a Google Drive folder for this submission or use existing one
    let driveFolder = { folderId: null, folderLink: submissionInfo.googleDriveLink };
    
    try {
      // Initialize Google Drive service if needed
      if (!googleDriveService.initialized) {
        console.log('Initializing Google Drive service before upload...');
        await googleDriveService.initialize();
      }
      
      // Create folder only if we don't already have a Google Drive link
      if (!submissionInfo.googleDriveLink) {
        driveFolder = await googleDriveService.createSubmissionFolder(trackingId, businessName);
        
        // Add Google Drive folder link to submission info
        submissionInfo.googleDriveLink = driveFolder.folderLink;
        
        console.log(`Created Google Drive folder for ${trackingId}: ${driveFolder.folderLink}`);
      } else {
        console.log(`Using existing Google Drive folder: ${submissionInfo.googleDriveLink}`);
        // Extract folder ID from the link
        const folderIdMatch = submissionInfo.googleDriveLink.match(/folders\/([^\/]+)$/);
        if (folderIdMatch && folderIdMatch[1]) {
          driveFolder.folderId = folderIdMatch[1];
        }
      }
      
      // Upload the disallowance notice files to Google Drive
      console.log(`Uploading ${fileInfo.length} disallowance notices to Google Drive...`);
      
      // Upload each PDF file to the Google Drive folder
      for (const file of fileInfo) {
        try {
          console.log(`Uploading file: ${file.originalName} from path: ${file.path}`);
          
          // Use the drive service to upload the file to the folder
          const uploadedFile = await googleDriveService.uploadFile(
            file.path,
            `${trackingId}_Disallowance_${file.originalName}`,
            driveFolder.folderId,
            file.mimetype
          );
          
          console.log(`Successfully uploaded ${file.originalName} to Google Drive with ID: ${uploadedFile.id}`);
          
          // Add the Google Drive URL to the file info
          file.googleDriveUrl = uploadedFile.webViewLink;
        } catch (fileUploadError) {
          console.error(`Error uploading file ${file.originalName} to Google Drive:`, fileUploadError);
          // Continue with next file even if this one fails
        }
      }
      
      // Check if we have protest package zip path to upload - with enhanced file checking
      if (protestPackagePath) {
        // Try multiple path formats to find the file
        const pathsToCheck = [
          protestPackagePath,
          path.normalize(protestPackagePath),
          // Try removing leading slash if it exists
          protestPackagePath.startsWith('/') ? protestPackagePath.substring(1) : protestPackagePath,
          // Try adding data directory prefix if it's a relative path
          path.join(__dirname, '../data', protestPackagePath)
        ];
        
        let foundZipPath = null;
        for (const pathToCheck of pathsToCheck) {
          console.log(`Checking if ZIP exists at: ${pathToCheck}`);
          try {
            if (fsSync.existsSync(pathToCheck)) {
              console.log(`Found ZIP file at: ${pathToCheck}`);
              foundZipPath = pathToCheck;
              break;
            }
          } catch (checkErr) {
            console.error(`Error checking path ${pathToCheck}:`, checkErr);
          }
        }
        
        if (foundZipPath) {
          console.log(`Uploading protest package ZIP from: ${foundZipPath}`);
          try {
            const uploadedZip = await googleDriveService.uploadFile(
              foundZipPath,
              `${trackingId}_Complete_Package.zip`,
              driveFolder.folderId,
              'application/zip'
            );
            
            console.log(`Successfully uploaded protest package ZIP with ID: ${uploadedZip.id}`);
            submissionInfo.zipPath = uploadedZip.webViewLink;
            
            // Update status since we have a complete package
            submissionInfo.status = 'PDF done';
          } catch (zipUploadError) {
            console.error(`Error uploading protest package ZIP:`, zipUploadError);
          }
        } else {
          console.error(`ZIP file not found at any of the attempted paths`);
        }
      }
      
      // Check if we have protest letter PDF to upload - with enhanced file checking
      if (protestLetterPath) {
        // Try multiple path formats to find the file
        const pathsToCheck = [
          protestLetterPath,
          path.normalize(protestLetterPath),
          // Try removing leading slash if it exists
          protestLetterPath.startsWith('/') ? protestLetterPath.substring(1) : protestLetterPath,
          // Try adding data directory prefix if it's a relative path
          path.join(__dirname, '../data', protestLetterPath)
        ];
        
        let foundPdfPath = null;
        for (const pathToCheck of pathsToCheck) {
          console.log(`Checking if PDF exists at: ${pathToCheck}`);
          try {
            if (fsSync.existsSync(pathToCheck)) {
              console.log(`Found PDF file at: ${pathToCheck}`);
              foundPdfPath = pathToCheck;
              break;
            }
          } catch (checkErr) {
            console.error(`Error checking path ${pathToCheck}:`, checkErr);
          }
        }
        
        if (foundPdfPath) {
          console.log(`Uploading protest letter PDF from: ${foundPdfPath}`);
          try {
            const uploadedPdf = await googleDriveService.uploadFile(
              foundPdfPath,
              `${trackingId}_Protest_Letter.pdf`,
              driveFolder.folderId,
              'application/pdf'
            );
            
            console.log(`Successfully uploaded protest letter PDF with ID: ${uploadedPdf.id}`);
            submissionInfo.protestLetterPath = uploadedPdf.webViewLink;
          } catch (pdfUploadError) {
            console.error(`Error uploading protest letter PDF:`, pdfUploadError);
          }
        } else {
          console.error(`PDF file not found at any of the attempted paths`);
        }
      }
      
    } catch (driveError) {
      console.error('Error creating Google Drive folder or uploading files:', driveError);
      // Continue anyway, not a critical error
    }
    
    // Save updated submission info
    await fs.writeFile(
      submissionPath,
      JSON.stringify(submissionInfo, null, 2)
    );
    
    // Add to Google Sheet for tracking
    try {
      // For updates, use updateSubmission instead of addSubmission
      if (isUpdate) {
        console.log(`Updating existing record in Google Sheet for ${trackingId}`);
        await googleSheetsService.updateSubmission(trackingId, {
          businessName,
          ein,
          location,
          businessWebsite,
          naicsCode,
          timePeriod: timePeriodsDisplay,
          additionalInfo,
          status: submissionInfo.status,
          timestamp: new Date().toISOString(),
          googleDriveLink: submissionInfo.googleDriveLink || '',
          protestLetterPath: submissionInfo.protestLetterPath || '',
          zipPath: submissionInfo.zipPath || ''
        });
      } else {
        // For new submissions - ensure trackingId is a string, not an array
        console.log(`Adding new record to Google Sheet for ${trackingId}`);
        await googleSheetsService.addSubmission({
          trackingId: trackingId.toString(), // Ensure it's a string
          businessName,
          ein,
          location,
          businessWebsite,
          naicsCode,
          timePeriod: timePeriodsDisplay, // Use the joined string for the Google Sheet
          additionalInfo,
          status: submissionInfo.status, // Use the possibly updated status
          timestamp: new Date().toISOString(),
          googleDriveLink: submissionInfo.googleDriveLink || '',
          protestLetterPath: submissionInfo.protestLetterPath || '',
          zipPath: submissionInfo.zipPath || ''
        });
      }
      
      console.log(`${isUpdate ? 'Updated' : 'Added'} submission in Google Sheet with all fields`);
      
    } catch (sheetError) {
      console.error('Error updating Google Sheet:', sheetError);
      // Continue anyway, not a critical error
    }
    
    res.status(201).json({
      success: true,
      message: isUpdate ? 'Submission updated successfully' : 'Submission received successfully',
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
        timePeriods: submissionInfo.timePeriods || [submissionInfo.timePeriod], // Handle both formats
        timePeriodsDisplay: submissionInfo.timePeriodsDisplay || submissionInfo.timePeriod
      });
    } catch (err) {
      // If file doesn't exist, check Google Sheet
      try {
        const submissions = await googleSheetsService.getAllSubmissions();
        const submission = submissions.find(s => s.trackingId === trackingId);
        
        if (submission) {
          // For backward compatibility, split by comma if it's a comma-separated string
          const timePeriods = submission.timePeriod.includes(',') 
            ? submission.timePeriod.split(',').map(t => t.trim())
            : [submission.timePeriod];
            
          res.status(200).json({
            success: true,
            status: submission.status,
            timestamp: submission.timestamp,
            businessName: submission.businessName,
            timePeriods: timePeriods,
            timePeriodsDisplay: submission.timePeriod
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