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
    
    // Check if the ID is a valid MongoDB ObjectId (24 character hex)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(submissionId);
    console.log(`Is valid ObjectId format: ${isValidObjectId}`);
    
    // Find the submission with expanded search capabilities
    let submission = null;
    
    // First, try to find by submissionId (string field)
    submission = await Submission.findOne({ submissionId: submissionId });
    
    // If not found and it's a valid ObjectId, try to find by _id
    if (!submission && isValidObjectId) {
      submission = await Submission.findById(submissionId);
    }
    
    // If still not found, try to find by numeric ID converted to string
    if (!submission) {
      // If the ID is numeric, try to find with additional formatting
      if (!isNaN(parseInt(submissionId))) {
        // Try formatted versions like "ERC-12345" or similar pattern
        const possibleFormats = [
          submissionId,
          `ERC-${submissionId}`,
          `ERC-${submissionId.substring(0, 8)}`
        ];
        
        for (const format of possibleFormats) {
          submission = await Submission.findOne({ submissionId: format });
          if (submission) {
            console.log(`Found submission using format: ${format}`);
            break;
          }
        }
      }
    }
    
    // If still not found, check if a map exists to resolve the ID
    if (!submission) {
      try {
        const mapDir = path.join(__dirname, '../data/id_mappings');
        // Check if directory exists
        if (fs.existsSync(mapDir)) {
          const files = fs.readdirSync(mapDir);
          for (const file of files) {
            if (file.startsWith(`${submissionId}_to_`)) {
              console.log(`Found ID mapping file: ${file}`);
              const mapPath = path.join(mapDir, file);
              const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
              if (mapData.formattedId) {
                console.log(`Looking up mapped ID: ${mapData.formattedId}`);
                submission = await Submission.findOne({ submissionId: mapData.formattedId });
                if (submission) {
                  console.log(`Found submission using mapped ID: ${mapData.formattedId}`);
                  break;
                }
              }
            }
          }
        }
      } catch (mapError) {
        console.error('Error checking ID mappings:', mapError);
      }
    }
    
    // If still not found, create a new record
    if (!submission) {
      console.log(`No existing submission found for ID ${submissionId}, creating new record`);
      
      // Create a new MongoDB record with this submissionId
      submission = new Submission({
        submissionId: submissionId,
        receivedAt: new Date(),
        status: 'processing',
        submissionData: {
          processedQuarters: [],
          quarterZips: {}
        }
      });
      
      // Try to get some info from the filesystem if available
      try {
        // Check if there's a submission_info.json file
        let jsonPath = '';
        // Check if it starts with ERC-
        if (submissionId.startsWith('ERC-')) {
          jsonPath = path.join(__dirname, `../data/ERC_Disallowances/${submissionId}/submission_info.json`);
        } else {
          jsonPath = path.join(__dirname, `../data/ERC_Disallowances/ERC-${submissionId}/submission_info.json`);
        }
        
        if (fs.existsSync(jsonPath)) {
          const jsonData = fs.readFileSync(jsonPath, 'utf8');
          const info = JSON.parse(jsonData);
          
          // Add business name if available
          if (info.businessName) {
            submission.businessName = info.businessName;
          }
          
          // Add status if available
          if (info.status) {
            submission.status = info.status;
          }
        }
      } catch (fileError) {
        console.error('Error reading submission info file:', fileError);
      }
    }
    
    console.log(`Found submission: ${submission._id}, creating update...`);
    
    // Log the full submission object for debugging
    console.log('Full submission data:', JSON.stringify(submission, null, 2));

    // Ensure submissionId is properly saved in the document
    if (!submission.submissionId && submissionId) {
      submission.submissionId = submissionId;
      console.log(`Added missing submissionId ${submissionId} to document`);
    }
    
    // Ensure we have a submissionData object
    if (!submission.submissionData) {
      submission.submissionData = {};
    }
    
    // Ensure we have a processedQuarters array
    if (!submission.submissionData.processedQuarters) {
      submission.submissionData.processedQuarters = [];
    }
    
    // Log current state before update
    console.log('Current processed quarters:', submission.submissionData.processedQuarters);
    
    // Check if the quarter is already in the processedQuarters array
    if (!submission.submissionData.processedQuarters.includes(quarter)) {
      // Add the quarter to the processedQuarters array
      submission.submissionData.processedQuarters.push(quarter);
      console.log(`Added ${quarter} to processed quarters`);
      
      // If zipPath is provided, store it in a new quarterZips object
      if (zipPath) {
        if (!submission.submissionData.quarterZips) {
          submission.submissionData.quarterZips = {};
        }
        submission.submissionData.quarterZips[quarter] = zipPath;
        console.log(`Stored zipPath for ${quarter}`);
      }
    } else {
      console.log(`Quarter ${quarter} already processed, updating zipPath if needed`);
      // Still update the zipPath if provided, even if quarter is already processed
      if (zipPath) {
        if (!submission.submissionData.quarterZips) {
          submission.submissionData.quarterZips = {};
        }
        submission.submissionData.quarterZips[quarter] = zipPath;
        console.log(`Updated zipPath for ${quarter}`);
      }
    }
    
    // Check if we should update the status based on processed quarters
    const allProcessedQuarters = submission.submissionData.processedQuarters;
    const totalQuarters = submission.submissionData?.report?.qualificationData?.quarterAnalysis?.length || 0;
    
    // If there are no quarters in the analysis, just check if we have ANY processed quarters
    if (totalQuarters === 0 && allProcessedQuarters.length > 0) {
      submission.status = 'complete';
      console.log('Updated status to complete (no quarter analysis, but quarters processed)');
    } 
    // If all quarters have been processed, mark as complete
    else if (totalQuarters > 0 && allProcessedQuarters.length >= totalQuarters) {
      submission.status = 'complete';
      console.log(`Updated status to complete (all ${totalQuarters} quarters processed)`);
    }
    // If we have some quarters processed but not all, mark as processing
    else if (allProcessedQuarters.length > 0) {
      submission.status = 'processing';
      console.log('Updated status to processing');
    }
    
    // Save the updated submission with explicit error handling
    try {
      console.log('Saving submission update to MongoDB...');
      await submission.save();
      console.log('Submission successfully saved');
    } catch (saveError) {
      console.error('Error saving submission:', saveError);
      return res.status(500).json({
        success: false,
        message: `Database save failed: ${saveError.message}`
      });
    }
    
    // Return success with updated data
    console.log(`Successfully updated processed quarters for ${submissionId}`);
    res.status(200).json({
      success: true,
      message: `Quarter ${quarter} marked as processed for submission ${submissionId}`,
      processedQuarters: submission.submissionData.processedQuarters,
      quarterZips: submission.submissionData.quarterZips || {}
    });
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