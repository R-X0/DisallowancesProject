// server/routes/mongodb-queue.js - Updated version with completion tracking
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { connectToDatabase, Submission } = require('../db-connection');
const { translatePath, processDocument } = require('../utils/pathTranslator');

// Get all submissions for queue display
router.get('/', async (req, res) => {
  try {
    // Ensure connected to database
    await connectToDatabase();
    
    // Fetch submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({})
      .sort({ receivedAt: -1 })
      .limit(50);
    
    // Transform data to match expected format for QueueDisplay with path translation
    const queueItems = submissions.map(submission => {
      // Process the document to translate paths
      const processedSubmission = processDocument(submission.toObject ? submission.toObject() : submission);
      
      // FIXED: Get processedQuarters from either location, preferring submissionData first
      const processedQuarters = 
        (processedSubmission.submissionData?.processedQuarters && processedSubmission.submissionData.processedQuarters.length > 0) 
          ? processedSubmission.submissionData.processedQuarters 
          : (processedSubmission.processedQuarters || []);
      
      // Find business name - try multiple locations
      let businessName = null;
      
      if (processedSubmission.businessName) {
        businessName = processedSubmission.businessName;
      } else if (processedSubmission.originalData?.formData?.businessName) {
        businessName = processedSubmission.originalData.formData.businessName;
      } else if (processedSubmission.userEmail) {
        businessName = `Business for ${processedSubmission.userEmail}`;
      } else {
        // Create from ID if nothing else available
        const idForName = processedSubmission.submissionId || processedSubmission._id.toString();
        businessName = `Business #${idForName.substring(0, 8)}`;
      }
      
      // *** FIND QUARTER ANALYSIS DATA - CHECK MULTIPLE LOCATIONS ***
      let quarters = [];
      
      // Option 1: Check report.qualificationData.quarterAnalysis (per schema)
      if (processedSubmission.report && 
          processedSubmission.report.qualificationData &&
          Array.isArray(processedSubmission.report.qualificationData.quarterAnalysis) &&
          processedSubmission.report.qualificationData.quarterAnalysis.length > 0) {
        
        quarters = processedSubmission.report.qualificationData.quarterAnalysis;
      }
      // Option 2: Check submissionData.report.qualificationData.quarterAnalysis
      else if (processedSubmission.submissionData?.report?.qualificationData &&
               Array.isArray(processedSubmission.submissionData.report.qualificationData.quarterAnalysis) &&
               processedSubmission.submissionData.report.qualificationData.quarterAnalysis.length > 0) {
        
        quarters = processedSubmission.submissionData.report.qualificationData.quarterAnalysis;
      }
      // REMOVED: No more fake data generation - if we don't have quarters data, just use an empty array
      
      // Determine status
      let status = processedSubmission.status || 'waiting';
      
      // Calculate status if not explicitly set
      if (status === 'waiting') {
        const processedCount = processedQuarters.length;
        
        if (processedCount > 0) {
          status = 'processing';
        } else if (processedSubmission.receivedFiles && processedSubmission.receivedFiles.length > 0) {
          status = 'processing';
        }
      }
      
      // Find report path
      let reportPath = null;
      if (processedSubmission.report && processedSubmission.report.path) {
        reportPath = processedSubmission.report.path;
      }
      
      // Process files
      const files = [];
      if (processedSubmission.receivedFiles && Array.isArray(processedSubmission.receivedFiles)) {
        processedSubmission.receivedFiles.forEach(file => {
          if (file && file.originalName && file.savedPath) {
            files.push({
              name: file.originalName,
              path: file.savedPath,
              type: file.mimetype || 'application/octet-stream',
              size: file.size || 0
            });
          }
        });
      }
      
      // Use submissionId field if it exists, otherwise use MongoDB _id
      const id = processedSubmission.submissionId || processedSubmission._id.toString();
      
      // Get qualifying quarters from our quarters data
      const qualifyingQuarters = quarters
        .filter(q => q.qualifies)
        .map(q => q.quarter);
      
      // Return the formatted queue item
      return {
        id: id,
        businessName,
        timestamp: processedSubmission.receivedAt,
        status,
        files,
        reportPath,
        // Include the complete submission data for detailed view
        submissionData: {
          ...processedSubmission.submissionData,
          processedQuarters: processedQuarters,
          // Ensure report structure is correct and includes proper quarter analysis
          report: {
            ...(processedSubmission.submissionData?.report || {}),
            qualificationData: {
              ...(processedSubmission.submissionData?.report?.qualificationData || {}),
              quarterAnalysis: quarters,
              qualifyingQuarters: qualifyingQuarters
            }
          }
        },
        // Add completion information
        isFullyComplete: processedSubmission.isFullyComplete || false,
        allFilesReady: processedSubmission.allFilesReady || false
      };
    });
    
    res.status(200).json({
      success: true,
      queue: queueItems
    });
  } catch (error) {
    console.error('Error fetching MongoDB queue:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching queue data: ${error.message}`
    });
  }
});

// Download file endpoint with path translation
router.get('/download', async (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required'
      });
    }
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      return res.redirect(filePath);
    }
    
    // Translate the path to local file system
    const translatedPath = translatePath(filePath);
    
    // Otherwise, handle as a local file
    try {
      if (!fs.existsSync(translatedPath)) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Get file extension to set the correct content type
      const ext = path.extname(translatedPath).toLowerCase();
      
      // Set appropriate content type based on file extension
      let contentType = 'application/octet-stream'; // Default
      
      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (ext === '.xls') {
        contentType = 'application/vnd.ms-excel';
      } else if (ext === '.csv') {
        contentType = 'text/csv';
      } else if (ext === '.json') {
        contentType = 'application/json';
      }
      
      // Set content disposition to force download
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(translatedPath)}"`);
      res.setHeader('Content-Type', contentType);
      
      // Create read stream and pipe to response
      const fileStream = fs.createReadStream(translatedPath);
      fileStream.pipe(res);
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: `Error accessing file: ${error.message}`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error in download endpoint: ${error.message}`
    });
  }
});

router.post('/update-processed-quarters', async (req, res) => {
  try {
    const { submissionId, quarter, zipPath } = req.body;
    
    if (!submissionId || !quarter) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID and quarter are required'
      });
    }
    
    // Ensure connected to database with more detailed logging
    const connected = await connectToDatabase();
    if (!connected) {
      console.error(`MongoDB connection failed for update: submissionId=${submissionId}`);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }
    
    // IMPROVED ID HANDLING: Try multiple potential ID formats
    let submission = null;
    const potentialIds = [
      submissionId,
      `ERC-${submissionId.replace(/^ERC-/, '')}`,
      submissionId.replace(/^ERC-/, ''),
      // Also try with ObjectId format if it looks like one
      ...(submissionId.match(/^[0-9a-f]{24}$/i) ? [submissionId] : [])
    ];
    
    // Try each potential ID format
    for (const idToTry of potentialIds) {
      try {
        // Try by submissionId field
        const found = await Submission.findOne({ submissionId: idToTry });
        if (found) {
          submission = found;
          break;
        }
        
        // Also try by _id if it's a valid ObjectId
        if (idToTry.match(/^[0-9a-f]{24}$/i)) {
          const foundById = await Submission.findById(idToTry);
          if (foundById) {
            submission = foundById;
            break;
          }
        }
      } catch (findError) {
        // Silent error handling
      }
    }
    
    // If still not found, create a new record with this ID
    if (!submission) {
      submission = new Submission({
        submissionId: submissionId,
        receivedAt: new Date(),
        status: 'processing',
        // Initialize arrays correctly
        processedQuarters: [],
        submissionData: {
          processedQuarters: [],
          quarterZips: {}
        }
      });
      
      // Try to get business name from filesystem
      try {
        // Look in multiple possible locations
        const possiblePaths = [
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId.replace(/^ERC-/, '')}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId.replace(/^ERC-/, '')}/submission_info.json`)
        ];
        
        for (const jsonPath of possiblePaths) {
          if (fs.existsSync(jsonPath)) {
            const jsonData = fs.readFileSync(jsonPath, 'utf8');
            const info = JSON.parse(jsonData);
            
            if (info.businessName) {
              submission.businessName = info.businessName;
            }
            
            if (info.status) {
              submission.status = info.status;
            }
            
            break;
          }
        }
      } catch (fileError) {
        // Silent error handling
      }
    }
    
    // FIXED: Ensure we have the required nested objects
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    // FIXED: Properly initialize arrays if they don't exist
    if (!Array.isArray(submission.submissionData.processedQuarters)) {
      submission.submissionData.processedQuarters = [];
    }
    
    if (!submission.submissionData.quarterZips) {
      submission.submissionData.quarterZips = {};
    }
    
    // FIXED: Ensure root-level processedQuarters is also an array
    if (!Array.isArray(submission.processedQuarters)) {
      submission.processedQuarters = [];
    }
    
    // Update processedQuarters if not already there
    let wasQuarterAdded = false;
    if (!submission.submissionData.processedQuarters.includes(quarter)) {
      submission.submissionData.processedQuarters.push(quarter);
      wasQuarterAdded = true;
    }
    
    // FIXED: Also update the root-level processedQuarters for backward compatibility
    if (!submission.processedQuarters.includes(quarter)) {
      submission.processedQuarters.push(quarter);
    }
    
    // Always update ZIP path if provided
    if (zipPath) {
      submission.submissionData.quarterZips[quarter] = zipPath;
    }
    
    // Get possible quarters to determine total
    let totalQuartersCount = 3; // Default
    
    // Try to get timePeriods from various places
    const timePeriods = submission.timePeriods || 
                       submission.originalData?.formData?.timePeriods;
    
    if (Array.isArray(timePeriods) && timePeriods.length > 0) {
      totalQuartersCount = timePeriods.length;
    }
    
    const processedQuartersCount = submission.submissionData.processedQuarters.length;
    
    // Only update status if we need to
    if (submission.status !== 'PDF done' && submission.status !== 'mailed') {
      if (processedQuartersCount >= totalQuartersCount && totalQuartersCount > 0) {
        submission.status = 'complete';
      } else if (processedQuartersCount > 0) {
        submission.status = 'processing';
      }
    }
    
    // ================ NEW CODE FOR COMPLETION TRACKING ================
    // Get an accurate count of expected quarters from multiple sources
    let expectedQuarterCount = totalQuartersCount; // Use the existing variable

    // If we have report data with quarter analysis, use that as the authoritative source
    if (submission.submissionData?.report?.qualificationData?.quarterAnalysis) {
      expectedQuarterCount = submission.submissionData.report.qualificationData.quarterAnalysis.length;
      console.log(`Using report quarter analysis for expected count: ${expectedQuarterCount}`);
    } else if (Array.isArray(submission.timePeriods) && submission.timePeriods.length > 0) {
      // Fallback to timePeriods array
      expectedQuarterCount = submission.timePeriods.length;
      console.log(`Using timePeriods array for expected count: ${expectedQuarterCount}`);
    } else if (submission.submissionData?.originalData?.formData?.timePeriods &&
              Array.isArray(submission.submissionData.originalData.formData.timePeriods)) {
      // Last resort - check original form data
      expectedQuarterCount = submission.submissionData.originalData.formData.timePeriods.length;
      console.log(`Using original form data for expected count: ${expectedQuarterCount}`);
    }

    // Check if all quarters are now processed
    if (processedQuartersCount >= expectedQuarterCount && expectedQuarterCount > 0) {
      // Add special fields to indicate completion
      submission.status = 'complete'; // Use 'complete' instead of 'allComplete'
      
      // Add a specific field that's easy to query
      submission.isFullyComplete = true;
      
      // Add completion timestamp
      if (!submission.submissionData.completedAt) {
        submission.submissionData.completedAt = new Date();
      }
      
      // Check if all ZIP files are available
      const allZipsAvailable = submission.submissionData.processedQuarters.every(quarter => 
        submission.submissionData.quarterZips && 
        submission.submissionData.quarterZips[quarter]
      );
      
      submission.allFilesReady = allZipsAvailable;
      
      console.log(`Marking submission ${submissionId} as fully complete. All ${processedQuartersCount}/${expectedQuarterCount} quarters processed.`);
    }
    // ================ END OF NEW CODE ================
    
    // Save the update
    try {
      // FIXED: Make sure to use await here to ensure changes are saved 
      await submission.save();
      
      // Also update the filesystem record if it exists - with better error handling
      try {
        // Check multiple possible paths
        const possiblePaths = [
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId.replace(/^ERC-/, '')}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId.replace(/^ERC-/, '')}/submission_info.json`)
        ];
        
        let updatedFile = false;
        
        for (const jsonPath of possiblePaths) {
          try {
            if (fs.existsSync(jsonPath)) {
              const jsonData = fs.readFileSync(jsonPath, 'utf8');
              const info = JSON.parse(jsonData);
              
              // Update the processed quarters in the file
              if (!info.processedQuarters) {
                info.processedQuarters = [];
              }
              
              if (!info.processedQuarters.includes(quarter)) {
                info.processedQuarters.push(quarter);
              }
              
              // Update status if needed - DON'T AUTOMATICALLY SET TO PDF DONE
              if (submission.status === 'complete' && info.status !== 'PDF done' && info.status !== 'mailed') {
                info.status = 'processing'; // Use processing, not PDF done
              } else if (processedQuartersCount > 0 && !['PDF done', 'mailed'].includes(info.status)) {
                info.status = 'processing';
              }
              
              // Write back to file
              fs.writeFileSync(jsonPath, JSON.stringify(info, null, 2));
              updatedFile = true;
              break;
            }
          } catch (fileError) {
            // Silent error handling
          }
        }
      } catch (fileError) {
        // Silent error handling
      }
      
      // If we added a new quarter, attempt to update Google Sheet
      if (wasQuarterAdded) {
        try {
          // Safely import the Google Sheets service
          const googleSheetsService = require('../services/googleSheetsService');
          
          // FIXED: Don't automatically set to PDF done
          const statusToUpdate = submission.status === 'complete' ? 'processing' : submission.status;
          
          // Update the Google Sheet with progress
          await googleSheetsService.updateSubmission(submissionId, {
            status: statusToUpdate,
            timestamp: new Date().toISOString()
          });
        } catch (sheetError) {
          // Silent error handling
        }
      }
      
      // Return success with updated data
      res.status(200).json({
        success: true,
        message: `Quarter ${quarter} marked as processed for submission ${submissionId}`,
        processedQuarters: submission.submissionData.processedQuarters,
        quarterZips: submission.submissionData.quarterZips || {},
        totalQuarters: expectedQuarterCount,
        progress: `${processedQuartersCount}/${expectedQuarterCount}`,
        isFullyComplete: submission.isFullyComplete || false,
        allFilesReady: submission.allFilesReady || false
      });
    } catch (saveError) {
      console.error('Error saving submission:', saveError);
      return res.status(500).json({
        success: false,
        message: `Database save failed: ${saveError.message}`
      });
    }
  } catch (error) {
    console.error(`Error updating processed quarters for submission ${req.body?.submissionId}:`, error);
    res.status(500).json({
      success: false,
      message: `Error updating processed quarters: ${error.message}`
    });
  }
});

// Add this new endpoint to server/routes/mongodb-queue.js

// Delete a submission from MongoDB
router.delete('/delete/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    
    if (!submissionId) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }
    
    // Ensure connected to database
    const connected = await connectToDatabase();
    if (!connected) {
      console.error(`MongoDB connection failed for deletion: submissionId=${submissionId}`);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }
    
    // IMPROVED ID HANDLING: Try multiple potential ID formats
    let submission = null;
    const potentialIds = [
      submissionId,
      `ERC-${submissionId.replace(/^ERC-/, '')}`,
      submissionId.replace(/^ERC-/, ''),
      // Also try with ObjectId format if it looks like one
      ...(submissionId.match(/^[0-9a-f]{24}$/i) ? [submissionId] : [])
    ];
    
    console.log(`Attempting to delete with these possible IDs: ${potentialIds.join(', ')}`);
    
    // Try to find and delete the document with any of the ID variations
    let deleteResult = null;
    for (const idToTry of potentialIds) {
      try {
        // Try by submissionId field
        deleteResult = await Submission.findOneAndDelete({ submissionId: idToTry });
        if (deleteResult) {
          console.log(`Successfully deleted document with submissionId=${idToTry}`);
          break;
        }
        
        // Also try by _id if it's a valid ObjectId
        if (idToTry.match(/^[0-9a-f]{24}$/i)) {
          deleteResult = await Submission.findByIdAndDelete(idToTry);
          if (deleteResult) {
            console.log(`Successfully deleted document with _id=${idToTry}`);
            break;
          }
        }
      } catch (deleteError) {
        console.log(`Error deleting with ID ${idToTry}:`, deleteError.message);
      }
    }
    
    if (!deleteResult) {
      return res.status(404).json({
        success: false,
        message: `No document found with ID ${submissionId}`
      });
    }
    
    // Return success response
    res.status(200).json({
      success: true,
      message: `Successfully deleted document with ID ${submissionId}`,
      deletedDocument: deleteResult
    });
    
  } catch (error) {
    console.error(`Error deleting submission ${req.params.submissionId}:`, error);
    res.status(500).json({
      success: false,
      message: `Error deleting submission: ${error.message}`
    });
  }
});

module.exports = router;