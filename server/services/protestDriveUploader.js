// server/services/protestDriveUploader.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const googleDriveService = require('./googleDriveService');
const googleSheetsService = require('./googleSheetsService');

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
    
    // Call the Google Drive service directly
    console.log(`Calling uploadProtestFiles with trackingId=${trackingId}, businessName=${businessName}`);
    const driveFiles = await googleDriveService.uploadProtestFiles(
      trackingId,
      businessName,
      pdfPath,
      zipPath
    );
    
    console.log(`Files uploaded to Drive for ${trackingId}:`, driveFiles);
    console.log(`- Protest Letter Link: ${driveFiles.protestLetterLink}`);
    console.log(`- ZIP Package Link: ${driveFiles.zipPackageLink}`);
    console.log(`- Folder Link: ${driveFiles.folderLink}`);
    
    // Update Google Sheet with file links
    console.log(`Updating Google Sheet for ${trackingId} with file links...`);
    await googleSheetsService.updateSubmission(trackingId, {
      status: 'PDF done',
      protestLetterPath: driveFiles.protestLetterLink,
      zipPath: driveFiles.zipPackageLink,
      googleDriveLink: driveFiles.folderLink,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Google Sheet updated for ${trackingId}`);
    
    // Update the local file if it exists
    try {
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`);
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
      
      console.log(`Updated local file for ${trackingId} with Google Drive links`);
    } catch (fileErr) {
      console.log(`Local file for ${trackingId} not found, skipping update`);
    }
    
    return driveFiles;
  } catch (error) {
    console.error(`Error uploading to Drive for ${trackingId}:`, error);
    throw error;
  }
}

module.exports = {
  uploadToGoogleDrive
};