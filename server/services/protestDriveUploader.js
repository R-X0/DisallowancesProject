// server/services/protestDriveUploader.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const googleDriveService = require('./googleDriveService');
const googleSheetsService = require('./googleSheetsService');

/**
 * Convert any ID format to a consistent ERC format
 * IMPROVED: More reliable ID conversion that works across the entire application
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
  
  // Extract all numeric characters for numeric-only processing
  const numericPart = idStr.replace(/\D/g, '');
  
  // If we have some numeric part, convert it to hex format
  if (numericPart && numericPart.length > 0) {
    try {
      // Handle very long numbers by using substring to avoid overflow
      const limitedNumeric = numericPart.length > 10 
        ? numericPart.substring(0, 10) 
        : numericPart;
      
      // Convert to hex and pad to 8 characters
      const hexId = parseInt(limitedNumeric).toString(16).toUpperCase().padStart(8, '0');
      const resultId = `ERC-${hexId}`;
      
      console.log(`ID conversion: ${trackingId} → ${resultId} (via numeric ${numericPart})`);
      return resultId;
    } catch (error) {
      console.error(`Error converting ID ${trackingId} to hex:`, error);
    }
  }
  
  // If numeric conversion failed or wasn't possible, try to create a deterministic hash
  try {
    // Simple hashing function
    let hash = 0;
    for (let i = 0; i < idStr.length; i++) {
      const char = idStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Convert to hex, ensure positive, and pad to 8 characters
    const hexHash = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    const resultId = `ERC-${hexHash}`;
    
    console.log(`ID conversion: ${trackingId} → ${resultId} (via hash)`);
    return resultId;
  } catch (hashError) {
    console.error(`Error creating hash for ID ${trackingId}:`, hashError);
  }
  
  // Last resort: prefix the original ID with ERC-
  return `ERC-${idStr.replace(/[^a-zA-Z0-9]/g, '')}`;
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
    
    // IMPROVED: Use consistent ID conversion across the application
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
    
    // IMPROVED: Update the local file with better path handling and multiple format attempts
    try {
      // Try with multiple ID formats and path combinations
      const idFormats = [formattedTrackingId, trackingId, trackingId.replace(/\D/g, '')];
      const basePaths = [
        path.join(__dirname, '../data/ERC_Disallowances'),
        path.join(__dirname, '../../data/ERC_Disallowances')
      ];
      
      let fileUpdateSuccess = false;
      
      // Try each combination of base path and ID format
      for (const basePath of basePaths) {
        for (const idFormat of idFormats) {
          const submissionPath = path.join(basePath, idFormat, 'submission_info.json');
          
          if (fsSync.existsSync(submissionPath)) {
            try {
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
              
              console.log(`Updated local file for ID ${idFormat} with Google Drive links`);
              fileUpdateSuccess = true;
              break;
            } catch (fileErr) {
              console.log(`Error updating file at ${submissionPath}: ${fileErr.message}`);
            }
          }
        }
        
        if (fileUpdateSuccess) break;
      }
      
      if (!fileUpdateSuccess) {
        console.log(`No matching local files found for IDs: ${idFormats.join(', ')}`);
      }
    } catch (fileErr) {
      console.log(`Error updating local files: ${fileErr.message}`);
    }
    
    // Return with both IDs and the drive files
    return {
      ...driveFiles,
      originalTrackingId: trackingId,
      formattedTrackingId: formattedTrackingId
    };
  } catch (error) {
    console.error(`Error uploading to Drive for ${trackingId}:`, error);
    
    // IMPROVED: Try to update MongoDB directly as a fallback
    if (error.message.includes('Google Sheet') && zipPath) {
      try {
        console.log(`Attempting direct MongoDB update as fallback...`);
        const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/mongodb-queue/update-processed-quarters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: trackingId,
            quarter: 'Unknown', // Generic value since we don't know the quarter
            zipPath: zipPath
          })
        });
        
        if (response.ok) {
          console.log(`Direct MongoDB update successful as fallback`);
        }
      } catch (mongoErr) {
        console.error(`MongoDB fallback update also failed:`, mongoErr);
      }
    }
    
    throw error;
  }
}

// IMPROVED: New function to find a submission by ID with flexible matching
async function findSubmissionById(trackingId) {
  try {
    // Try multiple ID formats
    const formattedId = ensureConsistentId(trackingId);
    const numericId = trackingId.toString().replace(/\D/g, '');
    
    const basePath = path.join(__dirname, '../data/ERC_Disallowances');
    const idFormats = [formattedId, trackingId, numericId];
    
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