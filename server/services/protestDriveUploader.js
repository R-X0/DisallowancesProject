// server/services/protestDriveUploader.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const googleDriveService = require('./googleDriveService');
const googleSheetsService = require('./googleSheetsService');

/**
 * Convert a numeric ID to a consistent ERC format
 * @param {string} trackingId - The original tracking ID (numeric or formatted)
 * @returns {string} - A consistently formatted ERC ID
 */
function ensureConsistentId(trackingId) {
  // If it's already in ERC-XXXXXXXX format, return it as is
  if (typeof trackingId === 'string' && trackingId.startsWith('ERC-')) {
    return trackingId;
  }
  
  // If it's numeric, format it consistently
  if (/^\d+$/.test(trackingId)) {
    // IMPORTANT: Use a stable algorithm that won't change between calls
    // Use 8 characters for consistency (same as uuid substring)
    const hexId = parseInt(trackingId).toString(16).toUpperCase().padStart(8, '0');
    return `ERC-${hexId}`;
  }
  
  // If we can't determine format, return as is
  return trackingId;
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
    
    // IMPORTANT FIX: Use consistent ID conversion across the application
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
    
    // Verify files exist before upload
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
    
    // Update Google Sheet with the ERC-formatted trackingId
    console.log(`Updating Google Sheet for ${formattedTrackingId} with file links...`);
    await googleSheetsService.updateSubmission(formattedTrackingId, {
      status: 'PDF done',
      protestLetterPath: driveFiles.protestLetterLink,
      zipPath: driveFiles.zipPackageLink,
      googleDriveLink: driveFiles.folderLink,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Google Sheet updated for ${formattedTrackingId}`);
    
    // Update the local file if it exists
    try {
      // Try with formatted ID first
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${formattedTrackingId}/submission_info.json`);
      if (fsSync.existsSync(submissionPath)) {
        const submissionData = await fs.readFile(submissionPath, 'utf8');
        const submissionInfo = JSON.parse(submissionData);
        
        submissionInfo.status = 'PDF done';
        submissionInfo.protestLetterPath = driveFiles.protestLetterLink;
        submissionInfo.zipPath = driveFiles.zipPackageLink;
        submissionInfo.googleDriveLink = driveFiles.folderLink;
        submissionInfo.timestamp = new Date().toISOString();
        
        await fs.writeFile(
          submissionPath,
          JSON.stringify(submissionInfo, null, 2)
        );
        
        console.log(`Updated local file for ${formattedTrackingId} with Google Drive links`);
      } else {
        // Try with original trackingId
        const originalPath = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`);
        if (fsSync.existsSync(originalPath)) {
          const submissionData = await fs.readFile(originalPath, 'utf8');
          const submissionInfo = JSON.parse(submissionData);
          
          submissionInfo.status = 'PDF done';
          submissionInfo.protestLetterPath = driveFiles.protestLetterLink;
          submissionInfo.zipPath = driveFiles.zipPackageLink;
          submissionInfo.googleDriveLink = driveFiles.folderLink;
          submissionInfo.timestamp = new Date().toISOString();
          
          await fs.writeFile(
            originalPath,
            JSON.stringify(submissionInfo, null, 2)
          );
          
          console.log(`Updated local file for original ID ${trackingId} with Google Drive links`);
        } else {
          console.log(`No local file found for either ${formattedTrackingId} or ${trackingId}, skipping update`);
        }
      }
    } catch (fileErr) {
      console.log(`Error updating local file: ${fileErr.message}`);
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

module.exports = {
  uploadToGoogleDrive,
  ensureConsistentId // Export for use in other parts of the app
};