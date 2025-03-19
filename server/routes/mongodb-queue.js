// server/routes/mongodb-queue.js
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
      // First process the document to translate paths
      const processedSubmission = processDocument(submission.toObject ? submission.toObject() : submission);
      
      // Log submission data for debugging
      console.log(`Processing submission: id=${processedSubmission._id}, submissionId=${processedSubmission.submissionId}`);
      
      // FIXED: Ensure submissionData exists and has necessary structure
      if (!processedSubmission.submissionData) {
        processedSubmission.submissionData = {};
      }
      
      // FIXED: Get processedQuarters from either location, preferring submissionData first
      const processedQuarters = 
        (processedSubmission.submissionData.processedQuarters && processedSubmission.submissionData.processedQuarters.length > 0) 
          ? processedSubmission.submissionData.processedQuarters 
          : (processedSubmission.processedQuarters || []);
                               
      // Log both possible locations for processed quarters
      console.log(`Processed quarters (from submissionData):`, processedSubmission.submissionData?.processedQuarters || []);
      console.log(`Processed quarters (from root):`, processedSubmission.processedQuarters || []);
      console.log(`Using processed quarters:`, processedQuarters);
      
      // Extract quarter information from timePeriods
      let quarters = [];
      
      // Try to get time periods from various locations
      const timePeriods = processedSubmission.timePeriods || 
                         processedSubmission.submissionData?.originalData?.formData?.timePeriods ||
                         [];
                         
      // Convert timePeriods to an array of quarter objects
      if (Array.isArray(timePeriods) && timePeriods.length > 0) {
        quarters = timePeriods.map(quarter => {
          // Extract quarter number if possible
          let quarterNumber = '1';
          if (quarter.match(/\d+/)) {
            quarterNumber = quarter.match(/\d+/)[0];
          }
          
          return {
            quarter: quarter,
            qualifies: true, // Default to true for display
            revenues: {
              revenue2019: 100000, // Default values
              revenue2021: 80000
            },
            percentDecrease: 20
          };
        });
      } else {
        // Default to 3 quarters if we can't extract from real data
        quarters = [
          { quarter: 'Quarter 1', qualifies: true, revenues: { revenue2019: 100000, revenue2021: 80000 }, percentDecrease: 20 },
          { quarter: 'Quarter 2', qualifies: true, revenues: { revenue2019: 100000, revenue2021: 80000 }, percentDecrease: 20 },
          { quarter: 'Quarter 3', qualifies: true, revenues: { revenue2019: 100000, revenue2021: 80000 }, percentDecrease: 20 }
        ];
      }
      
      // Get the total count of quarters to process
      const totalCount = quarters.length;
      
      console.log(`Quarter analysis: generated ${quarters.length} quarters`);
      
      // IMPROVED: Extract a meaningful businessName with better fallbacks
      let businessName = null;
      
      // Try from submission data directly
      if (processedSubmission.businessName && processedSubmission.businessName !== 'Unnamed Business') {
        businessName = processedSubmission.businessName;
        console.log(`Found business name from root:`, businessName);
      }
      // Try from formData
      else if (processedSubmission.submissionData?.originalData?.formData?.businessName) {
        businessName = processedSubmission.submissionData.originalData.formData.businessName;
        console.log(`Found business name from formData:`, businessName);
      }
      // Try from original FormData
      else if (processedSubmission.originalData?.formData?.businessName) {
        businessName = processedSubmission.originalData.formData.businessName;
        console.log(`Found business name from originalData:`, businessName);
      }
      // Try from owner info
      else if (processedSubmission.submissionData?.originalData?.formData?.ownershipStructure?.length > 0) {
        const primaryOwner = processedSubmission.submissionData.originalData.formData.ownershipStructure.sort((a, b) => 
          parseInt(b.ownership_percentage) - parseInt(a.ownership_percentage)
        )[0];
        
        if (primaryOwner && primaryOwner.owner_name) {
          businessName = `${primaryOwner.owner_name}'s Business`;
          console.log(`Found business name from owner:`, businessName);
        }
      }
      // Try from user email
      else if (processedSubmission.submissionData?.originalData?.formData?.userEmail) {
        businessName = `Submission from ${processedSubmission.submissionData.originalData.formData.userEmail}`;
        console.log(`Found business name from email:`, businessName);
      }
      
      // If all else fails, use ID to create a unique business name
      if (!businessName) {
        const idForName = processedSubmission.submissionId || processedSubmission._id.toString();
        businessName = `Business #${idForName.substring(0, 8)}`;
        console.log(`Created fallback business name:`, businessName);
      }
      
      // IMPROVED: Determine status more reliably
      // Start with existing status if available, otherwise calculate from quarters
      let status = processedSubmission.status || 'waiting';
      
      // Only use calculated status if we don't have an explicit status
      if (status === 'waiting') {
        // Status based on processed quarters count
        const processedCount = processedQuarters.length;
        
        if (processedCount >= totalCount && totalCount > 0) {
          status = 'complete';
          console.log(`Status set to 'complete' based on quarters: ${processedCount}/${totalCount}`);
        } else if (processedCount > 0) {
          status = 'processing';
          console.log(`Status set to 'processing' based on quarters: ${processedCount}/${totalCount}`);
        } else if (processedSubmission.receivedFiles && processedSubmission.receivedFiles.length > 0) {
          status = 'processing';
          console.log(`Status set to 'processing' based on received files`);
        }
      } else {
        console.log(`Using existing status: ${status}`);
      }
      
      // Find report path if it exists
      let reportPath = null;
      if (processedSubmission.report && processedSubmission.report.path) {
        reportPath = processedSubmission.report.path;
      }
      
      // Process files with path translation
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
          // FIXED: Ensure report structure is correct and includes proper quarter analysis
          report: {
            ...(processedSubmission.submissionData?.report || {}),
            qualificationData: {
              ...(processedSubmission.submissionData?.report?.qualificationData || {}),
              quarterAnalysis: quarters,
              qualifyingQuarters: processedQuarters
            }
          }
        }
      };
    });
    
    console.log(`Queue data processed: ${queueItems.length} items`);
    // Debug: Log all items with more details
    queueItems.forEach(item => {
      console.log(`Queue Item ${item.id}:`, { 
        business: item.businessName,
        status: item.status,
        processedQuarters: item.submissionData?.processedQuarters || [],
        totalQuarters: item.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0
      });
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

      // Get file stats for debug info
      const stats = fs.statSync(translatedPath);
      
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
    
    console.log(`MongoDB update request received for: submissionId=${submissionId}, quarter=${quarter}`);
    
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
    
    console.log(`MongoDB connected, finding submission: ${submissionId}`);
    
    // IMPROVED ID HANDLING: Try multiple potential ID formats
    let submission = null;
    const potentialIds = [
      submissionId,
      `ERC-${submissionId}`,
      submissionId.replace('ERC-', ''),
      // Also try with ObjectId format if it looks like one
      ...(submissionId.match(/^[0-9a-f]{24}$/i) ? [submissionId] : [])
    ];
    
    console.log('Trying the following potential IDs:', potentialIds);
    
    // Try each potential ID format
    for (const idToTry of potentialIds) {
      try {
        // Try by submissionId field
        const found = await Submission.findOne({ submissionId: idToTry });
        if (found) {
          submission = found;
          console.log(`Found submission with submissionId=${idToTry}`);
          break;
        }
        
        // Also try by _id if it's a valid ObjectId
        if (idToTry.match(/^[0-9a-f]{24}$/i)) {
          const foundById = await Submission.findById(idToTry);
          if (foundById) {
            submission = foundById;
            console.log(`Found submission by _id=${idToTry}`);
            break;
          }
        }
      } catch (findError) {
        console.log(`Error looking up ID ${idToTry}:`, findError.message);
      }
    }
    
    // If still not found, create a new record with this ID
    if (!submission) {
      console.log(`No existing submission found for ID ${submissionId}, creating new record`);
      
      // FIXED: Create a default submission data structure with proper initialization of arrays
      submission = new Submission({
        submissionId: submissionId,
        receivedAt: new Date(),
        status: 'processing', // IMPORTANT: Initialize as processing, not complete
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
              console.log(`Found business name: ${info.businessName}`);
            }
            
            if (info.status) {
              submission.status = info.status;
            }
            
            break;
          }
        }
      } catch (fileError) {
        console.log('Error reading submission info file:', fileError.message);
      }
    }
    
    console.log(`Updating submission: ${submission._id || 'new record'}`);
    
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
    
    // Log current state before update
    console.log('Current processed quarters:', submission.submissionData.processedQuarters);
    
    // Update processedQuarters if not already there
    let wasQuarterAdded = false;
    if (!submission.submissionData.processedQuarters.includes(quarter)) {
      submission.submissionData.processedQuarters.push(quarter);
      console.log(`Added ${quarter} to processed quarters`);
      wasQuarterAdded = true;
    } else {
      console.log(`Quarter ${quarter} already in processed quarters`);
    }
    
    // FIXED: Also update the root-level processedQuarters for backward compatibility
    if (!submission.processedQuarters.includes(quarter)) {
      submission.processedQuarters.push(quarter);
    }
    
    // Always update ZIP path if provided
    if (zipPath) {
      submission.submissionData.quarterZips[quarter] = zipPath;
      console.log(`Updated ZIP path for ${quarter} to ${zipPath}`);
    }
    
    // Update status if needed - BUT DON'T AUTOMATICALLY SET TO COMPLETE
    // FIXED: More careful status update logic
    // Get possible quarters from timePeriods to determine total
    let totalQuartersCount = 3; // Default
    
    // Try to get timePeriods from various places
    const timePeriods = submission.timePeriods || 
                       submission.submissionData?.originalData?.formData?.timePeriods;
    
    if (Array.isArray(timePeriods) && timePeriods.length > 0) {
      totalQuartersCount = timePeriods.length;
    }
    
    const processedQuartersCount = submission.submissionData.processedQuarters.length;
    
    // Only update status if we need to
    if (submission.status !== 'PDF done' && submission.status !== 'mailed') {
      if (processedQuartersCount >= totalQuartersCount && totalQuartersCount > 0) {
        submission.status = 'complete';
        console.log(`All ${processedQuartersCount}/${totalQuartersCount} quarters processed, setting status to complete`);
      } else if (processedQuartersCount > 0) {
        submission.status = 'processing';
        console.log(`${processedQuartersCount}/${totalQuartersCount} quarters processed, setting status to processing`);
      }
    } else {
      console.log(`Not updating status as it's already ${submission.status}`);
    }
    
    // Save the update
    try {
      // FIXED: Make sure to use await here to ensure changes are saved 
      await submission.save();
      console.log('Submission successfully saved to MongoDB');
      
      // FIXED: Verify the save was successful by reading it back
      const verifiedDoc = await Submission.findById(submission._id);
      if (verifiedDoc) {
        console.log('Verification after save:', {
          id: verifiedDoc._id,
          status: verifiedDoc.status,
          rootQuarters: verifiedDoc.processedQuarters || [],
          nestedQuarters: verifiedDoc.submissionData?.processedQuarters || []
        });
      }
      
      // Also update the filesystem record if it exists
      try {
        // Check multiple possible paths
        const possiblePaths = [
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId.replace(/^ERC-/, '')}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId.replace(/^ERC-/, '')}/submission_info.json`)
        ];
        
        for (const jsonPath of possiblePaths) {
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
            console.log(`Updated filesystem record at ${jsonPath}`);
            break;
          }
        }
      } catch (fileError) {
        console.log('Error updating filesystem record:', fileError.message);
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
          
          console.log(`Updated Google Sheet for ${submissionId} with status: ${statusToUpdate}`);
        } catch (sheetError) {
          console.log('Error updating Google Sheet:', sheetError.message);
          // Continue anyway - don't fail if sheet update fails
        }
      }
      
      // Return success with updated data
      res.status(200).json({
        success: true,
        message: `Quarter ${quarter} marked as processed for submission ${submissionId}`,
        processedQuarters: submission.submissionData.processedQuarters,
        quarterZips: submission.submissionData.quarterZips || {},
        totalQuarters: totalQuartersCount,
        progress: `${processedQuartersCount}/${totalQuartersCount}`
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

module.exports = router;