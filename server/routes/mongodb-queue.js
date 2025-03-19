// server/routes/mongodb-queue.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { connectToDatabase, Submission } = require('../db-connection');
const { translatePath, processDocument } = require('../utils/pathTranslator');

/**
 * Normalize quarter format to a consistent standard for comparison
 * @param {string} quarter - Any quarter format (Quarter 1, Q1, etc.)
 * @returns {string} - Normalized format (q1_2021, q2_2020, etc.)
 */
const normalizeQuarter = (quarter) => {
  if (!quarter) return '';
  
  // Convert to string, lowercase, and clean up non-alphanumeric except underscore
  const clean = quarter.toString().toLowerCase().replace(/[^a-z0-9_]/g, '');
  
  // Special case for "Quarter X" format
  if (clean.startsWith('quarter')) {
    // Extract quarter number
    const match = clean.match(/quarter([1-4])/);
    if (match && match[1]) {
      const qNum = match[1];
      
      // If there's a year in the string, extract and append it
      const yearMatch = clean.match(/(20\d{2})/);
      if (yearMatch && yearMatch[1]) {
        return `q${qNum}_${yearMatch[1]}`;
      }
      
      // Without year, just return the quarter number
      return `q${qNum}`;
    }
  }
  
  // Handle "QX 20XX" format (most common)
  const qYearMatch = clean.match(/q([1-4])[\s_]*(20\d{2})/);
  if (qYearMatch && qYearMatch[1] && qYearMatch[2]) {
    return `q${qYearMatch[1]}_${qYearMatch[2]}`;
  }
  
  // Handle just "QX" format
  const justQMatch = clean.match(/q([1-4])$/);
  if (justQMatch && justQMatch[1]) {
    return `q${justQMatch[1]}`;
  }
  
  // If we still can't normalize it, return the cleaned version
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
  
  // Try to extract the quarter number and year
  const normalized = normalizeQuarter(quarter);
  
  // Pattern: q1_2021
  const fullMatch = normalized.match(/q([1-4])_?(20\d{2})/);
  if (fullMatch && fullMatch[1] && fullMatch[2]) {
    const qNum = fullMatch[1];
    const year = fullMatch[2];
    
    // Add every possible format
    formats.push(`q${qNum}_${year}`);
    formats.push(`q${qNum}${year}`);
    formats.push(`q${qNum} ${year}`);
    formats.push(`Q${qNum}_${year}`);
    formats.push(`Q${qNum}${year}`);
    formats.push(`Q${qNum} ${year}`);
    formats.push(`Quarter ${qNum}_${year}`);
    formats.push(`Quarter ${qNum} ${year}`);
    formats.push(`Quarter${qNum}`);
    formats.push(`Quarter ${qNum}`);
    formats.push(`q${qNum}`);
    formats.push(`Q${qNum}`);
    
    // Also add year-first formats
    formats.push(`${year}_q${qNum}`);
    formats.push(`${year} q${qNum}`);
    formats.push(`${year}_Q${qNum}`);
    formats.push(`${year} Q${qNum}`);
  } else {
    // Pattern: q1 (no year)
    const qMatch = normalized.match(/q([1-4])/);
    if (qMatch && qMatch[1]) {
      const qNum = qMatch[1];
      
      formats.push(`q${qNum}`);
      formats.push(`Q${qNum}`);
      formats.push(`Quarter ${qNum}`);
      formats.push(`Quarter${qNum}`);
    }
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
        // Add normalized versions for comparison
        processedSubmission.submissionData.normalizedProcessedQuarters = 
          processedSubmission.submissionData.processedQuarters.map(quarter => normalizeQuarter(quarter));
          
        // Log normalized quarters for debugging
        console.log(`Normalized processedQuarters for ${processedSubmission.submissionId || processedSubmission._id}:`, 
          processedSubmission.submissionData.normalizedProcessedQuarters);
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

// Update processed quarters for a submission
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
      console.error(`Submission with ID ${submissionId} not found in MongoDB`);
      return res.status(404).json({
        success: false,
        message: `Submission with ID ${submissionId} not found`
      });
    }
    
    console.log(`Found submission: ${submission.id || submission._id}`);
    
    // Ensure we have a submissionData object
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    // Ensure we have a processedQuarters array
    if (!submission.submissionData.processedQuarters) {
      submission.submissionData.processedQuarters = [];
    }
    
    // Get ALL possible standardized formats of this quarter
    const quarterFormats = getAllQuarterFormats(quarter);
    
    // Log existing processed quarters for debugging
    console.log(`Existing processed quarters:`, submission.submissionData.processedQuarters);
    console.log(`Adding standardized formats:`, quarterFormats);
    
    // Check if any format of this quarter is already processed
    const normalizedExisting = submission.submissionData.processedQuarters.map(q => normalizeQuarter(q));
    const normalizedQuarter = normalizeQuarter(quarter);
    
    if (!normalizedExisting.includes(normalizedQuarter)) {
      // Add ALL formats to the processedQuarters array
      submission.submissionData.processedQuarters.push(...quarterFormats);
      console.log(`Added ${quarterFormats.length} formats for ${quarter} to processed quarters`);
    } else {
      console.log(`Quarter ${quarter} (normalized: ${normalizedQuarter}) is already processed, skipping`);
    }
    
    // If zipPath is provided, store it in a new quarterZips object
    if (zipPath) {
      if (!submission.submissionData.quarterZips) {
        submission.submissionData.quarterZips = {};
      }
      
      // Store under both the original format and normalized format
      submission.submissionData.quarterZips[quarter] = zipPath;
      submission.submissionData.quarterZips[normalizedQuarter] = zipPath;
      console.log(`Updated ZIP path for ${quarter} to: ${zipPath}`);
    }
    
    // Save the updated submission
    console.log(`Saving changes to MongoDB...`);
    await submission.save();
    console.log(`Successfully saved submission with updated data`);
    
    res.status(200).json({
      success: true,
      message: `Quarter ${quarter} marked as processed for submission ${submissionId}`,
      processedQuarters: submission.submissionData.processedQuarters,
      quarterZips: submission.submissionData.quarterZips || {}
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