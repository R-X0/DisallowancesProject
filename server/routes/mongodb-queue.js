// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { connectToDatabase, Submission } = require('../db-connection');
const { translatePath, processDocument } = require('../utils/pathTranslator');
const { ensureConsistentId } = require('../services/protestDriveUploader');

/**
 * Normalize quarter format to a consistent standard for comparison
 * @param {string} quarter - Any quarter format (Quarter 1, Q1, etc.)
 * @returns {string} - Normalized format (q1, q2, etc.)
 */
const normalizeQuarter = (quarter) => {
  if (!quarter) return '';
  
  // Convert to string first in case a number is passed
  const quarterStr = String(quarter).trim();
  
  // Special case for empty strings
  if (!quarterStr) return '';
  
  // Convert to lowercase and remove non-essential characters
  const clean = quarterStr.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Special case for "Quarter X" format - most common in our app
  if (clean.includes('quarter')) {
    const quarterMatch = clean.match(/quarter([1-4])/);
    if (quarterMatch && quarterMatch[1]) {
      return `q${quarterMatch[1]}`;
    }
  }
  
  // Extract quarter number from "qX" format
  const qMatch = clean.match(/q([1-4])/);
  if (qMatch && qMatch[1]) {
    return `q${qMatch[1]}`;
  }
  
  // Handle year-specific formats (e.g., "q2 2021")
  const quarterYearMatch = clean.match(/q?([1-4]).*20([0-9]{2})/);
  if (quarterYearMatch && quarterYearMatch[1]) {
    return `q${quarterYearMatch[1]}`;
  }
  
  // Last attempt - look for a single digit 1-4 anywhere in the string
  const digitMatch = clean.match(/[1-4]/);
  if (digitMatch) {
    return `q${digitMatch[0]}`;
  }
  
  // If we couldn't normalize it, return a standardized version of original
  return clean;
};

/**
 * Add ALL possible standard formats of a quarter to an array
 * @param {string} quarter - The quarter to standardize
 * @returns {Array} - Array of standardized quarter formats
 */
const getAllQuarterFormats = (quarter) => {
  const formats = [];
  
  // Start with the original format
  formats.push(quarter);
  
  // Extract just the quarter number, ignoring year
  const normalizedQuarter = normalizeQuarter(quarter);
  
  // Get quarter number (1-4)
  const qNumber = normalizedQuarter.match(/q([1-4])/);
  if (qNumber && qNumber[1]) {
    const num = qNumber[1];
    
    // Generate comprehensive list of formats
    formats.push(`q${num}`);
    formats.push(`Q${num}`);
    formats.push(`quarter${num}`);
    formats.push(`Quarter${num}`);
    formats.push(`quarter ${num}`);
    formats.push(`Quarter ${num}`);
    formats.push(`q${num}_2020`);
    formats.push(`q${num}_2021`);
    formats.push(`Q${num} 2020`);
    formats.push(`Q${num} 2021`);
    formats.push(`Quarter ${num} 2020`);
    formats.push(`Quarter ${num} 2021`);
    formats.push(`quarter${num}2020`);
    formats.push(`quarter${num}2021`);
    
    // Add format with just the number
    formats.push(num);
  }
  
  // Remove duplicates
  return [...new Set(formats)];
};

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
      
      // Add normalized processedQuarters for more reliable matching
      if (processedSubmission.submissionData?.processedQuarters) {
        // Normalize each quarter for better matching
        processedSubmission.submissionData.normalizedProcessedQuarters = 
          processedSubmission.submissionData.processedQuarters.map(quarter => normalizeQuarter(quarter));
      }
      
      // Also add standardized quarter data to the quarterAnalysis for easier matching
      if (processedSubmission.submissionData?.report?.qualificationData?.quarterAnalysis) {
        processedSubmission.submissionData.report.qualificationData.quarterAnalysis.forEach(qAnalysis => {
          // Add normalized version of the quarter for comparison
          if (qAnalysis.quarter) {
            qAnalysis.normalizedQuarter = normalizeQuarter(qAnalysis.quarter);
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

// Key fixed function: Update processed quarters for a submission with deduplication
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
    
    // IMPROVED: More flexible ID handling - try multiple formats
    const originalId = submissionId;
    const formattedId = ensureConsistentId(submissionId);
    const numericId = submissionId.toString().replace(/\D/g, ''); // Extract only numbers
    
    console.log(`ID formats: Original=${originalId}, Formatted=${formattedId}, Numeric=${numericId}`);
    
    // Build a more comprehensive query to find the submission by any potential ID format
    const orConditions = [
      // Check all fields that might contain the ID
      { submissionId: originalId },
      { submissionId: formattedId },
      { trackingId: originalId },
      { trackingId: formattedId },
      // Add numeric ID if we have one
      { submissionId: numericId },
      { trackingId: numericId }
    ];
    
    // Add ObjectId condition only if valid format (24 hex chars)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(originalId) || /^[0-9a-fA-F]{24}$/.test(formattedId);
    if (isValidObjectId) {
      if (/^[0-9a-fA-F]{24}$/.test(originalId)) orConditions.push({ _id: originalId });
      if (/^[0-9a-fA-F]{24}$/.test(formattedId)) orConditions.push({ _id: formattedId });
    }
    
    console.log(`Searching with query:`, JSON.stringify(orConditions));
    
    // Find submission with more flexible query
    let submission = await Submission.findOne({ $or: orConditions });
    
    if (!submission) {
      // If still not found, try a more aggressive approach with a partial text search
      console.log(`No exact match found, attempting partial ID search...`);
      
      // Get all submissions
      const allSubmissions = await Submission.find({});
      console.log(`Checking ${allSubmissions.length} total submissions for partial matches`);
      
      // Look for partial matches in ID fields
      for (const sub of allSubmissions) {
        const subId = sub.submissionId || sub.trackingId || sub._id?.toString() || '';
        const subOriginalId = sub.originalData?.trackingId || '';
        
        if (subId.includes(numericId) || numericId.includes(subId) || 
            subOriginalId.includes(numericId) || numericId.includes(subOriginalId)) {
          console.log(`Found partial match: ${subId}`);
          submission = sub;
          break;
        }
      }
      
      if (!submission) {
        console.error(`Submission with ID ${submissionId} not found in MongoDB`);
        return res.status(404).json({
          success: false,
          message: `Submission with ID ${submissionId} not found`
        });
      }
    }
    
    console.log(`Found submission: ${submission.id || submission._id}`);
    
    // IMPROVED: Create the proper data structure if it doesn't exist
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    if (!submission.submissionData.processedQuarters) {
      submission.submissionData.processedQuarters = [];
    }
    
    // Get normalized version of the quarter
    const normalizedQuarter = normalizeQuarter(quarter);
    
    // Check if we already processed this quarter (normalized comparison)
    const existingNormalizedQuarters = submission.submissionData.processedQuarters.map(q => normalizeQuarter(q));
    const alreadyProcessed = existingNormalizedQuarters.includes(normalizedQuarter);
    
    // Log existing processed quarters for debugging
    console.log(`Existing processed quarters:`, submission.submissionData.processedQuarters);
    
    if (!alreadyProcessed) {
      // Get ALL possible standardized formats of this quarter
      const quarterFormats = getAllQuarterFormats(quarter);
      console.log(`Adding standardized formats:`, quarterFormats);
      
      // Add ALL formats to the processedQuarters array
      submission.submissionData.processedQuarters.push(...quarterFormats);
      console.log(`Added ${quarterFormats.length} formats for ${quarter} to processed quarters`);
    } else {
      console.log(`Quarter ${quarter} (normalized: ${normalizedQuarter}) is already processed, skipping`);
    }
    
    // IMPROVED: Enhanced ZIP path storage
    if (zipPath) {
      if (!submission.submissionData.quarterZips) {
        submission.submissionData.quarterZips = {};
      }
      
      // Store under both the original format and normalized format for better matching
      submission.submissionData.quarterZips[quarter] = zipPath;
      submission.submissionData.quarterZips[normalizedQuarter] = zipPath;
      
      // Also store under common format variations
      const qNum = normalizedQuarter.match(/q([1-4])/);
      if (qNum && qNum[1]) {
        submission.submissionData.quarterZips[`Q${qNum[1]}`] = zipPath;
        submission.submissionData.quarterZips[`Quarter ${qNum[1]}`] = zipPath;
      }
      
      console.log(`Updated ZIP path for ${quarter} to: ${zipPath}`);
    }
    
    // IMPROVED: Also store the quarter info in a top-level field for easier querying
    if (!submission.processedQuarters) {
      submission.processedQuarters = [];
    }
    
    if (!submission.processedQuarters.includes(normalizedQuarter)) {
      submission.processedQuarters.push(normalizedQuarter);
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
              processedQuarters: submission.processedQuarters
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