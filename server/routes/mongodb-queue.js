// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { connectToDatabase, Submission } = require('../db-connection');
const { translatePath, processDocument } = require('../utils/pathTranslator');
const { ensureConsistentId } = require('../services/protestDriveUploader');

/**
 * Simple quarter normalization - just get the quarter number
 * @param {string} quarter - Any quarter format (Quarter 3, Q3, etc.)
 * @returns {string} - Normalized quarter number (3, 2, etc.)
 */
function normalizeQuarter(quarter) {
  if (!quarter) return '';
  
  // Just get the quarter number
  const match = String(quarter).match(/[1-4]/);
  return match ? match[0] : '';
}

// Get all submissions for queue display
router.get('/', async (req, res) => {
  try {
    // Ensure connected to database
    await connectToDatabase();
    
    // ADDED: Query parameter to force refresh
    const forceRefresh = req.query.refresh === 'true';
    
    // Fetch submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({})
      .sort({ receivedAt: -1 })
      .limit(50);
    
    // Transform data to match expected format for QueueDisplay with path translation
    const queueItems = submissions.map(submission => {
      // First process the document to translate paths
      const processedSubmission = processDocument(submission.toObject ? submission.toObject() : submission);
      
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
        
        // Use timestamp as last resort
        if (businessName === 'Unnamed Business') {
          const date = new Date(processedSubmission.receivedAt);
          if (!isNaN(date.getTime())) {
            businessName = `Submission from ${date.toLocaleDateString()}`;
          }
        }
      } catch (err) {
        businessName = `Submission #${processedSubmission.submissionId || processedSubmission._id}`;
      }
      
      // Determine status based on report generation and files
      let status = 'waiting';
      if (processedSubmission.report && processedSubmission.report.generated) {
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
      
      return {
        id: processedSubmission.submissionId || processedSubmission._id,
        businessName,
        timestamp: processedSubmission.receivedAt,
        status,
        files,
        reportPath,
        // Include the complete submission data for detailed view
        submissionData: processedSubmission
      };
    });
    
    res.status(200).json({
      success: true,
      queue: queueItems,
      refreshed: forceRefresh
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

// Key fixed route: Update processed quarters for a submission with simple, reliable approach
router.post('/update-processed-quarters', async (req, res) => {
  try {
    const { submissionId, quarter, zipPath } = req.body;
    
    if (!submissionId || !quarter) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID and quarter are required'
      });
    }
    
    console.log(`Processing update request for submission ${submissionId}, quarter ${quarter}`);
    if (zipPath) {
      console.log(`With ZIP path: ${zipPath}`);
    }
    
    // Ensure connected to database
    await connectToDatabase();
    
    // FIXED: Simple ID handling - just try multiple formats directly
    // Don't do complex transformations
    const possibleIds = [
      submissionId,
      `ERC-${submissionId}`,
      submissionId.toString().replace('ERC-', ''),
      submissionId.toString().replace(/\D/g, '') // Just the numeric part
    ];
    
    // Try each ID format until we find a match
    let submission = null;
    for (const idToTry of possibleIds) {
      try {
        const result = await Submission.findOne({
          $or: [
            { submissionId: idToTry },
            { trackingId: idToTry },
            { _id: idToTry }
          ]
        });
        
        if (result) {
          submission = result;
          console.log(`Found submission with ID format: ${idToTry}`);
          break;
        }
      } catch (err) {
        console.log(`Error trying ID format ${idToTry}:`, err.message);
      }
    }
    
    // If still not found, try a more aggressive approach with partial matching
    if (!submission) {
      console.log('No exact ID match found, trying partial matching...');
      
      // Get all submissions
      const allSubmissions = await Submission.find({});
      console.log(`Checking ${allSubmissions.length} submissions for partial matches`);
      
      // Extract numeric part of the ID for matching
      const numericPart = submissionId.toString().replace(/\D/g, '');
      
      // Find any submission that contains the numeric part in any ID field
      for (const sub of allSubmissions) {
        const subId = sub.submissionId || '';
        const subTrackingId = sub.trackingId || '';
        const subObjId = sub._id?.toString() || '';
        
        if (subId.includes(numericPart) || 
            subTrackingId.includes(numericPart) || 
            subObjId.includes(numericPart) ||
            numericPart.includes(subId) ||
            numericPart.includes(subTrackingId) ||
            numericPart.includes(subObjId)) {
          submission = sub;
          console.log(`Found partial match: submission._id = ${sub._id}`);
          break;
        }
      }
    }
    
    if (!submission) {
      console.error(`Submission with ID ${submissionId} not found in MongoDB after all attempts`);
      return res.status(404).json({
        success: false,
        message: `Submission with ID ${submissionId} not found`
      });
    }
    
    // Make sure we have the necessary data structures
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    if (!submission.submissionData.processedQuarters) {
      submission.submissionData.processedQuarters = [];
    }
    
    // FIXED: Store quarter in multiple simple formats
    // Original format
    if (!submission.submissionData.processedQuarters.includes(quarter)) {
      submission.submissionData.processedQuarters.push(quarter);
    }
    
    // Also store just the number for simple matching
    const quarterNum = normalizeQuarter(quarter);
    if (quarterNum && !submission.submissionData.processedQuarters.includes(quarterNum)) {
      submission.submissionData.processedQuarters.push(quarterNum);
    }
    
    // FIXED: Store ZIP path in multiple ways for reliable access
    if (zipPath) {
      // Store at top level for backwards compatibility
      submission.zipPath = zipPath;
      
      // Create quarterZips structure if it doesn't exist
      if (!submission.submissionData.quarterZips) {
        submission.submissionData.quarterZips = {};
      }
      
      // Store under original format
      submission.submissionData.quarterZips[quarter] = zipPath;
      
      // Also store under quarter number for simple access
      if (quarterNum) {
        submission.submissionData.quarterZips[quarterNum] = zipPath;
      }
      
      console.log(`Updated ZIP path for ${quarter} to: ${zipPath}`);
    }
    
    // Save the updated submission
    console.log(`Saving changes to MongoDB...`);
    try {
      await submission.save();
      console.log(`Successfully saved submission with updated data`);
    } catch (saveErr) {
      console.error('Error saving to MongoDB:', saveErr);
      
      // Fallback: Try updateOne if save fails
      try {
        const updateResult = await Submission.updateOne(
          { _id: submission._id },
          { 
            $set: { 
              submissionData: submission.submissionData,
              zipPath: zipPath || submission.zipPath
            } 
          }
        );
        console.log('Used updateOne as fallback, result:', updateResult);
      } catch (updateErr) {
        console.error('Even updateOne failed:', updateErr);
        throw updateErr;
      }
    }
    
    // Return success with the updated data
    res.status(200).json({
      success: true,
      message: `Quarter ${quarter} marked as processed for submission ${submissionId}`,
      processedQuarters: submission.submissionData.processedQuarters,
      quarterZips: submission.submissionData.quarterZips || {},
      submissionId: submission.id || submission._id
    });
  } catch (error) {
    console.error(`Error updating processed quarters for submission ${req.body.submissionId}:`, error);
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
    
    // Use consistent ID format
    const formattedId = ensureConsistentId(submissionId);
    
    // Ensure connected to database
    await connectToDatabase();
    
    // Build flexible query to find by any ID format
    const orConditions = [
      { submissionId: submissionId },
      { submissionId: formattedId }
    ];
    
    // Add ObjectId condition only if valid
    if (/^[0-9a-fA-F]{24}$/.test(submissionId)) {
      orConditions.push({ _id: submissionId });
    }
    if (/^[0-9a-fA-F]{24}$/.test(formattedId)) {
      orConditions.push({ _id: formattedId });
    }
    
    // Find the submission with flexible query
    const submission = await Submission.findOne({ $or: orConditions });
    
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
    
    // Delete the submission from MongoDB - using the same flexible query
    const deleteResult = await Submission.deleteOne({ $or: orConditions });
    
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