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
    console.log('Connected to MongoDB, fetching submissions...');
    
    // Fetch submissions, sorted by receivedAt (newest first)
    const submissions = await Submission.find({})
      .sort({ receivedAt: -1 })
      .limit(50);
    
    console.log(`Found ${submissions.length} submissions in MongoDB`);
    
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
        console.error(`Error extracting business name for submission ${processedSubmission.submissionId}:`, err);
        businessName = `Submission #${processedSubmission.submissionId || processedSubmission._id}`;
      }
      
      // Determine status based on report generation and files
      let status = 'waiting';
      if (processedSubmission.report && processedSubmission.report.generated) {
        status = 'complete';
      } else if (processedSubmission.receivedFiles && processedSubmission.receivedFiles.length > 0) {
        status = 'processing';
      }
      
      // Log report path if it exists to help with debugging
      let reportPath = null;
      if (processedSubmission.report && processedSubmission.report.path) {
        reportPath = processedSubmission.report.path;
        console.log(`Found report path for submission ${processedSubmission.submissionId || processedSubmission._id}: ${reportPath}`);
        
        // Check if report file exists at the translated path
        try {
          if (fs.existsSync(reportPath)) {
            console.log(`Report file exists at: ${reportPath}`);
          } else {
            console.log(`Report file NOT found at: ${reportPath}`);
          }
        } catch (err) {
          console.error(`Error checking report file: ${err.message}`);
        }
      }
      
      // Use the ID from the right place based on your structure
      const submissionId = processedSubmission.submissionId || processedSubmission._id;
      
      // Process files with path translation
      const files = [];
      if (processedSubmission.receivedFiles && Array.isArray(processedSubmission.receivedFiles)) {
        processedSubmission.receivedFiles.forEach(file => {
          if (file && file.originalName && file.savedPath) {
            const fileEntry = {
              name: file.originalName,
              path: file.savedPath, // This is now the translated path
              type: file.mimetype || 'application/octet-stream',
              size: file.size || 0
            };
            
            // Check if file exists at the translated path
            try {
              if (fs.existsSync(file.savedPath)) {
                console.log(`File exists at: ${file.savedPath}`);
              } else {
                console.log(`File NOT found at: ${file.savedPath}`);
              }
            } catch (err) {
              console.error(`Error checking file: ${err.message}`);
            }
            
            files.push(fileEntry);
          }
        });
      }
      
      console.log(`Processed submission ${submissionId}:`);
      console.log(`- Business Name: ${businessName}`);
      console.log(`- Files Found: ${files.length}`);
      console.log(`- Report Path: ${reportPath || 'None'}`);
      
      return {
        id: submissionId,
        businessName,
        timestamp: processedSubmission.receivedAt,
        status,
        files,
        reportPath,
        // RESTORED: Include the complete submission data for detailed view
        submissionData: processedSubmission
      };
    });
    
    // Log the first item's structure if available
    if (queueItems.length > 0) {
      console.log('Sample queue item structure:');
      console.log('- ID:', queueItems[0].id);
      console.log('- Business Name:', queueItems[0].businessName);
      console.log('- reportPath:', queueItems[0].reportPath);
      console.log('- Has files:', queueItems[0].files?.length > 0);
      console.log('- Complete data included: Yes');
    }
    
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
    
    console.log(`Download requested for: ${filePath}`);
    
    // Check if it's a URL or a local path
    if (filePath.startsWith('http')) {
      console.log('URL detected, redirecting');
      return res.redirect(filePath);
    }
    
    // Translate the path to local file system
    const translatedPath = translatePath(filePath);
    console.log(`Translated path: ${translatedPath}`);
    
    // Otherwise, handle as a local file
    try {
      if (!fs.existsSync(translatedPath)) {
        console.error(`File not found at path: ${translatedPath}`);
        return res.status(404).json({
          success: false,
          message: 'File not found after path translation. Original: ' + filePath + ', Translated: ' + translatedPath
        });
      }

      // Get file stats for debug info
      const stats = fs.statSync(translatedPath);
      console.log(`File exists (${stats.size} bytes), sending download`);
      
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
      
      console.log(`Using content type: ${contentType} for extension: ${ext}`);
      
      // Set content disposition to force download
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(translatedPath)}"`);
      res.setHeader('Content-Type', contentType);
      
      // Create read stream and pipe to response
      const fileStream = fs.createReadStream(translatedPath);
      fileStream.pipe(res);
      
    } catch (error) {
      console.error(`Error accessing file ${translatedPath}:`, error);
      return res.status(500).json({
        success: false,
        message: `Error accessing file: ${error.message}`,
        path: filePath,
        translatedPath: translatedPath
      });
    }
  } catch (error) {
    console.error('Error in download endpoint:', error);
    res.status(500).json({
      success: false,
      message: `Error in download endpoint: ${error.message}`
    });
  }
});


// Add this to your server/routes/mongodb-queue.js file

// Replace the delete endpoint in your server/routes/mongodb-queue.js file

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
    console.log(`Attempting to delete submission with ID: ${submissionId}`);
    
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
    console.log(`Received at: ${submission.receivedAt}`);
    
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
          console.log(`Deleted file: ${filePath}`);
        } else {
          fileResults.push({ path: filePath, deleted: false, reason: 'File not found' });
          console.log(`File not found for deletion: ${filePath}`);
        }
      } catch (fileError) {
        fileResults.push({ path: filePath, deleted: false, reason: fileError.message });
        console.error(`Error deleting file ${filePath}:`, fileError);
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