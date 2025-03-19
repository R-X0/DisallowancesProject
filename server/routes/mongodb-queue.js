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
      console.log(`Processed quarters:`, processedSubmission.submissionData?.processedQuarters || []);
      console.log(`Quarter analysis:`, processedSubmission.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0);
      
      // Extract a meaningful identifier based on data structure
      let businessName = 'Unnamed Business';
      
      try {
        const originalData = processedSubmission.originalData || {};
        const formData = originalData.formData || {};
        
        // Try to create a business identifier from owner information
        if (formData.ownershipStructure && formData.ownershipStructure.length > 0) {
          const primaryOwner = formData.ownershipStructure.sort((a, b) => 
            parseInt(b.ownership_percentage) - parseInt(a.ownership_percentage)
          )[0];
          
          if (primaryOwner && primaryOwner.owner_name) {
            businessName = `${primaryOwner.owner_name}'s Business`;
          }
        }
        
        // If we have a user email, use that instead
        if (formData.userEmail && formData.userEmail.trim()) {
          businessName = `Submission from ${formData.userEmail}`;
        }
        
        // Try to get business name directly if it exists
        if (formData.businessName) {
          businessName = formData.businessName;
        }
        
        // Check if we have a business name directly on the submission
        if (processedSubmission.businessName) {
          businessName = processedSubmission.businessName;
        }
        
        // Use timestamp as last resort
        if (businessName === 'Unnamed Business') {
          const date = new Date(processedSubmission.receivedAt);
          if (!isNaN(date.getTime())) {
            businessName = `Submission from ${date.toLocaleDateString()}`;
          }
        }
      } catch (err) {
        console.log('Error extracting business name:', err);
        businessName = `Submission #${processedSubmission.submissionId || processedSubmission._id}`;
      }
      
      // Determine status based on report generation and files
      let status = 'waiting';
      if (processedSubmission.status) {
        // If we have a status field, use it directly
        status = processedSubmission.status;
      } else if (processedSubmission.report && processedSubmission.report.generated) {
        status = 'complete';
      } else if (processedSubmission.receivedFiles && processedSubmission.receivedFiles.length > 0) {
        status = 'processing';
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
      
      return {
        id: id,
        businessName,
        timestamp: processedSubmission.receivedAt,
        status,
        files,
        reportPath,
        // Include the complete submission data for detailed view
        submissionData: processedSubmission
      };
    });
    
    console.log(`Queue data processed: ${queueItems.length} items`);
    // Debug: Log all items with their processedQuarters for debugging
    queueItems.forEach(item => {
      console.log(`Item ${item.id}: processedQuarters=`, 
        item.submissionData?.processedQuarters || [],
        "totalQuarters=", 
        item.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0
      );
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
      
      // Create a default submission data structure
      submission = new Submission({
        submissionId: submissionId,
        receivedAt: new Date(),
        status: 'processing',
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
          path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId.replace('ERC-', '')}/submission_info.json`)
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
    
    // Ensure we have the required nested objects
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    if (!submission.submissionData.processedQuarters) {
      submission.submissionData.processedQuarters = [];
    }
    
    if (!submission.submissionData.quarterZips) {
      submission.submissionData.quarterZips = {};
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
    
    // Always update ZIP path if provided
    if (zipPath) {
      submission.submissionData.quarterZips[quarter] = zipPath;
      console.log(`Updated ZIP path for ${quarter} to ${zipPath}`);
    }
    
    // Update status if needed
    const processedQuartersCount = submission.submissionData.processedQuarters.length;
    const totalQuartersCount = submission.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 3; // Default to 3 if not specified
    
    if (processedQuartersCount >= totalQuartersCount) {
      submission.status = 'complete';
      console.log(`All ${processedQuartersCount}/${totalQuartersCount} quarters processed, setting status to complete`);
    } else if (processedQuartersCount > 0) {
      submission.status = 'processing';
      console.log(`${processedQuartersCount}/${totalQuartersCount} quarters processed, setting status to processing`);
    }
    
    // Save the update
    try {
      await submission.save();
      console.log('Submission successfully saved to MongoDB');
      
      // Also update the filesystem record if it exists
      try {
        // Check multiple possible paths
        const possiblePaths = [
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId}/submission_info.json`),
          path.join(__dirname, `../data/ERC_Disallowances/${submissionId.replace('ERC-', '')}/submission_info.json`)
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
            
            // Update status if needed
            if (submission.status === 'complete') {
              info.status = 'PDF done';
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
          
          // Update the Google Sheet with progress
          await googleSheetsService.updateSubmission(submissionId, {
            status: submission.status === 'complete' ? 'PDF done' : 'processing',
            timestamp: new Date().toISOString()
          });
          
          console.log(`Updated Google Sheet for ${submissionId}`);
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

// Delete a submission
router.delete('/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    
    if (!submissionId) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }
    
    // Ensure connected to database
    await connectToDatabase();
    
    // Check if the ID is a valid MongoDB ObjectId (24 character hex)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(submissionId);
    
    // Find the submission, but be careful about the query to avoid ObjectId casting errors
    let submission;
    
    if (isValidObjectId) {
      // If it's a valid ObjectId format, we can query by either field
      submission = await Submission.findOne({
        $or: [
          { submissionId: submissionId },
          { _id: submissionId }
        ]
      });
    } else {
      // If it's not a valid ObjectId, only query by submissionId
      submission = await Submission.findOne({ submissionId: submissionId });
    }
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: `Submission with ID ${submissionId} not found`
      });
    }
    
    // Log what we're about to delete
    console.log(`Found submission to delete: ${submission.submissionId || submission._id}`);
    
    // Optional: Delete associated files
    const filesToDelete = [];
    
    // Check received files
    if (submission.receivedFiles && Array.isArray(submission.receivedFiles)) {
      submission.receivedFiles.forEach(file => {
        if (file.savedPath) {
          // Translate the path to local file system path
          const translatedPath = translatePath(file.savedPath);
          filesToDelete.push(translatedPath);
        }
      });
    }
    
    // Check report file
    if (submission.report && submission.report.path) {
      const translatedReportPath = translatePath(submission.report.path);
      filesToDelete.push(translatedReportPath);
    }
    
    // Delete the submission from MongoDB - use the same query approach as above
    let deleteResult;
    
    if (isValidObjectId) {
      deleteResult = await Submission.deleteOne({
        $or: [
          { submissionId: submissionId },
          { _id: submissionId }
        ]
      });
    } else {
      deleteResult = await Submission.deleteOne({ submissionId: submissionId });
    }
    
    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No submission was deleted with ID ${submissionId}`
      });
    }
    
    // Attempt to delete files (don't fail if files can't be deleted)
    const fileResults = [];
    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          fileResults.push({ path: filePath, deleted: true });
        } else {
          fileResults.push({ path: filePath, deleted: false, reason: 'File not found' });
        }
      } catch (fileError) {
        fileResults.push({ path: filePath, deleted: false, reason: fileError.message });
      }
    }
    
    console.log(`Successfully deleted submission ${submissionId} from MongoDB`);
    
    res.status(200).json({
      success: true,
      message: `Submission ${submissionId} successfully deleted`,
      filesDeleted: fileResults
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