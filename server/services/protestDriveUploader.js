// server/services/protestDriveUploader.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const googleDriveService = require('./googleDriveService');
const googleSheetsService = require('./googleSheetsService');

/**
 * Convert any ID format to a consistent ERC format
 * SIMPLIFIED: Use a straightforward prefix approach without complex transformations
 * @param {string} trackingId - The original tracking ID (numeric or formatted)
 * @returns {string} - A consistently formatted ERC ID
 */
function ensureConsistentId(trackingId) {
  // For empty/undefined values, return a fallback
  if (!trackingId) {
    console.warn('Empty tracking ID provided to ensureConsistentId');
    return 'ERC-UNKNOWN';
  }
  
  // Convert to string in case a number is passed directly
  const idStr = String(trackingId).trim();
  
  // If it's already in ERC-XXXXXXXX format, return it as is
  if (idStr.startsWith('ERC-')) {
    return idStr;
  }
  
  // Simply add the prefix - no complex transformations
  return `ERC-${idStr}`;
}

/**
 * Upload files to Google Drive and update tracking info
 * @param {string} trackingId - Tracking ID for the submission
 * @param {string} businessName - Business name
 * @param {string} pdfPath - Path to the PDF document
 * @param {string} zipPath - Path to the ZIP package
 * @returns {Object} - Object with links to the uploaded files
 */
async function uploadToGoogleDrive(trackingId, businessName, pdfPath, zipPath) {
  try {
    console.log(`Uploading protest files to Google Drive for ${trackingId}...`);
    console.log(`PDF path: ${pdfPath}`);
    console.log(`ZIP path: ${zipPath}`);
    
    // FIXED: Use consistent ID approach - don't transform the ID
    const formattedTrackingId = ensureConsistentId(trackingId);
    console.log(`Using consistent tracking ID format: ${formattedTrackingId} (original: ${trackingId})`);
    
    // Store mapping between original and formatted ID
    if (formattedTrackingId !== trackingId) {
      try {
        const mappingDir = path.join(__dirname, '../data/id_mappings');
        if (!fsSync.existsSync(mappingDir)) {
          await fs.mkdir(mappingDir, { recursive: true });
        }
        
        const mapping = {
          originalId: trackingId,
          formattedId: formattedTrackingId,
          timestamp: new Date().toISOString()
        };
        
        // Save mapping file using both IDs to make it findable both ways
        await fs.writeFile(
          path.join(mappingDir, `${trackingId}_to_${formattedTrackingId}.json`),
          JSON.stringify(mapping, null, 2)
        );
        
        console.log(`Stored ID mapping from ${trackingId} to ${formattedTrackingId}`);
      } catch (mappingErr) {
        console.log(`Error storing ID mapping: ${mappingErr.message}`);
        // Continue even if mapping storage fails
      }
    }
    
    // Verify files exist before upload with enhanced error handling
    if (!fsSync.existsSync(pdfPath)) {
      throw new Error(`PDF file does not exist at ${pdfPath}`);
    }
    
    if (!fsSync.existsSync(zipPath)) {
      throw new Error(`ZIP file does not exist at ${zipPath}`);
    }
    
    // Get file sizes for verification
    const pdfStats = fsSync.statSync(pdfPath);
    const zipStats = fsSync.statSync(zipPath);
    console.log(`PDF size: ${pdfStats.size} bytes`);
    console.log(`ZIP size: ${zipStats.size} bytes`);
    
    if (pdfStats.size === 0) {
      throw new Error('PDF file is empty');
    }
    
    if (zipStats.size === 0) {
      throw new Error('ZIP file is empty');
    }
    
    // Initialize Google Drive service if needed
    if (!googleDriveService.initialized) {
      console.log('Initializing Google Drive service...');
      await googleDriveService.initialize();
    }
    
    // Call the Google Drive service directly using the formatted ID
    console.log(`Calling uploadProtestFiles with formattedTrackingId=${formattedTrackingId}, businessName=${businessName}`);
    const driveFiles = await googleDriveService.uploadProtestFiles(
      formattedTrackingId,
      businessName,
      pdfPath,
      zipPath
    );
    
    console.log(`Files uploaded to Drive for ${formattedTrackingId}:`, driveFiles);
    console.log(`- Protest Letter Link: ${driveFiles.protestLetterLink}`);
    console.log(`- ZIP Package Link: ${driveFiles.zipPackageLink}`);
    console.log(`- Folder Link: ${driveFiles.folderLink}`);
    
    // IMPROVED: Update Google Sheet with retry logic
    console.log(`Updating Google Sheet for ${formattedTrackingId} with file links...`);
    let sheetUpdateSuccess = false;
    let sheetAttempts = 0;
    const maxSheetAttempts = 3;
    
    while (!sheetUpdateSuccess && sheetAttempts < maxSheetAttempts) {
      sheetAttempts++;
      try {
        await googleSheetsService.updateSubmission(formattedTrackingId, {
          status: 'PDF done',
          protestLetterPath: driveFiles.protestLetterLink,
          zipPath: driveFiles.zipPackageLink,
          googleDriveLink: driveFiles.folderLink,
          timestamp: new Date().toISOString()
        });
        
        console.log(`Google Sheet updated for ${formattedTrackingId} (attempt ${sheetAttempts})`);
        sheetUpdateSuccess = true;
      } catch (sheetErr) {
        console.error(`Error updating Google Sheet (attempt ${sheetAttempts}):`, sheetErr);
        if (sheetAttempts < maxSheetAttempts) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Try multiple ID formats with the Google Sheet as fallback
    if (!sheetUpdateSuccess) {
      try {
        console.log(`Trying original ID format for Google Sheet update: ${trackingId}`);
        await googleSheetsService.updateSubmission(trackingId, {
          status: 'PDF done',
          protestLetterPath: driveFiles.protestLetterLink,
          zipPath: driveFiles.zipPackageLink,
          googleDriveLink: driveFiles.folderLink,
          timestamp: new Date().toISOString()
        });
        console.log(`Google Sheet updated using original ID: ${trackingId}`);
      } catch (originalIdErr) {
        console.error(`Even original ID update failed:`, originalIdErr);
      }
    }
    
    // Update MongoDB directly to ensure quarter zip paths are set
    try {
      // Try to update MongoDB with the generated zip path
      if (formattedTrackingId && zipPath) {
        const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/mongodb-queue/update-processed-quarters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: formattedTrackingId,
            quarter: 'Quarter 3', // Using the format from the log
            zipPath: driveFiles.zipPackageLink
          })
        });
        
        if (response.ok) {
          console.log('Successfully updated MongoDB with zip path');
        }
      }
    } catch (mongoErr) {
      console.error('Error updating MongoDB:', mongoErr);
    }
    
    // Return with both IDs and the drive files
    return {
      ...driveFiles,
      originalTrackingId: trackingId,
      formattedTrackingId: formattedTrackingId
    };
  } catch (error) {
    console.error(`Error uploading to Drive for ${trackingId}:`, error);
    throw error;
  }
}

// Find a submission by ID with flexible matching
async function findSubmissionById(trackingId) {
  try {
    // Use consistent ID format
    const formattedId = ensureConsistentId(trackingId);
    
    const basePath = path.join(__dirname, '../data/ERC_Disallowances');
    const idFormats = [formattedId, trackingId];
    
    // Try each ID format
    for (const idFormat of idFormats) {
      const submissionPath = path.join(basePath, idFormat, 'submission_info.json');
      
      if (fsSync.existsSync(submissionPath)) {
        const submissionData = await fs.readFile(submissionPath, 'utf8');
        return JSON.parse(submissionData);
      }
    }
    
    // If no submission found locally, try MongoDB query
    try {
      const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/mongodb-queue?id=${encodeURIComponent(trackingId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.queue && data.queue.length > 0) {
          return data.queue[0];
        }
      }
    } catch (queryErr) {
      console.log(`MongoDB query error:`, queryErr);
    }
    
    // No submission found
    return null;
  } catch (error) {
    console.error(`Error finding submission:`, error);
    return null;
  }
}

module.exports = {
  uploadToGoogleDrive,
  ensureConsistentId,
  findSubmissionById
};