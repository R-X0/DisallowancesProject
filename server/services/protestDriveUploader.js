// server/services/protestDriveUploader.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const googleDriveService = require('./googleDriveService');
const googleSheetsService = require('./googleSheetsService');
const mongoose = require('mongoose');

/**
 * Upload files to Google Drive and update tracking info
 * @param {string} trackingId - Tracking ID for the submission
 * @param {string} businessName - Business name
 * @param {string} pdfPath - Path to the PDF document
 * @param {string} zipPath - Path to the ZIP package
 * @param {string} docxPath - Path to the DOCX document (optional)
 * @returns {Object} - Object with links to the uploaded files
 */
async function uploadToGoogleDrive(trackingId, businessName, pdfPath, zipPath, docxPath = null) {
  try {
    console.log(`Uploading protest files to Google Drive for ${trackingId}...`);
    console.log(`PDF path: ${pdfPath}`);
    console.log(`ZIP path: ${zipPath}`);
    if (docxPath) {
      console.log(`DOCX path: ${docxPath}`);
    }
    
    // Verify files exist before upload
    if (!fsSync.existsSync(pdfPath)) {
      throw new Error(`PDF file does not exist at ${pdfPath}`);
    }
    
    if (!fsSync.existsSync(zipPath)) {
      throw new Error(`ZIP file does not exist at ${zipPath}`);
    }
    
    if (docxPath && !fsSync.existsSync(docxPath)) {
      console.log(`DOCX file does not exist at ${docxPath}, will not upload DOCX`);
      docxPath = null;
    }
    
    // Get file sizes for verification
    const pdfStats = fsSync.statSync(pdfPath);
    const zipStats = fsSync.statSync(zipPath);
    console.log(`PDF size: ${pdfStats.size} bytes`);
    console.log(`ZIP size: ${zipStats.size} bytes`);
    
    let docxStats = null;
    if (docxPath) {
      docxStats = fsSync.statSync(docxPath);
      console.log(`DOCX size: ${docxStats.size} bytes`);
    }
    
    if (pdfStats.size === 0) {
      throw new Error('PDF file is empty');
    }
    
    if (zipStats.size === 0) {
      throw new Error('ZIP file is empty');
    }
    
    if (docxPath && docxStats && docxStats.size === 0) {
      console.log('DOCX file is empty, will not upload DOCX');
      docxPath = null;
    }
    
    // Initialize Google Drive service if needed
    if (!googleDriveService.initialized) {
      console.log('Initializing Google Drive service...');
      await googleDriveService.initialize();
    }
    
    // Create folder for this submission
    const folderResult = await googleDriveService.createSubmissionFolder(trackingId, businessName);
    console.log(`Created folder for ${trackingId} with ID: ${folderResult.folderId}`);
    
    // Upload the PDF letter
    console.log(`Uploading PDF letter from ${pdfPath}...`);
    const pdfFile = await googleDriveService.uploadFile(
      pdfPath,
      `${trackingId}_Protest_Letter.pdf`,
      folderResult.folderId,
      'application/pdf'
    );
    console.log(`PDF letter uploaded with ID: ${pdfFile.id}`);
    
    // Upload the DOCX if provided
    let docxFile = null;
    if (docxPath) {
      console.log(`Uploading DOCX letter from ${docxPath}...`);
      docxFile = await googleDriveService.uploadFile(
        docxPath,
        `${trackingId}_Protest_Letter.docx`,
        folderResult.folderId,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      console.log(`DOCX letter uploaded with ID: ${docxFile.id}`);
    }
    
    // Upload the ZIP package
    console.log(`Uploading ZIP package from ${zipPath}...`);
    const zipFile = await googleDriveService.uploadFile(
      zipPath,
      `${trackingId}_Complete_Package.zip`,
      folderResult.folderId,
      'application/zip'
    );
    console.log(`ZIP package uploaded with ID: ${zipFile.id}`);
    
    // Verify both files are visible in the folder
    console.log(`Verifying files in folder ${folderResult.folderId}...`);
    const filesInFolder = await googleDriveService.drive.files.list({
      q: `'${folderResult.folderId}' in parents`,
      fields: 'files(id, name, webViewLink)'
    });
    
    console.log(`Found ${filesInFolder.data.files.length} files in folder:`);
    filesInFolder.data.files.forEach(file => {
      console.log(`- ${file.name} (${file.id}): ${file.webViewLink}`);
    });
    
    // Return all relevant URLs
    const result = {
      folderLink: folderResult.folderLink,
      protestLetterLink: pdfFile.webViewLink,
      zipPackageLink: zipFile.webViewLink
    };
    
    if (docxFile) {
      result.docxLink = docxFile.webViewLink;
    }
    
    // Update Google Sheet with file links - with better error handling
    try {
      console.log(`Updating Google Sheet for ${trackingId} with file links...`);
      await googleSheetsService.updateSubmission(trackingId, {
        status: 'PDF done',
        protestLetterPath: result.protestLetterLink,
        zipPath: result.zipPackageLink,
        googleDriveLink: result.folderLink,
        timestamp: new Date().toISOString(),
        businessName: businessName // Include business name for new entries
      });
      
      console.log(`Google Sheet updated for ${trackingId}`);
    } catch (sheetError) {
      console.error(`Error updating Google Sheet for ${trackingId}:`, sheetError);
      console.log('Continuing despite Google Sheet error');
      // Continue even if Google Sheet update fails
    }
    
    // Update MongoDB directly - CRITICAL FIX
    try {
      const { Submission } = require('../db-connection');
      if (!Submission) {
        throw new Error('MongoDB Submission model not available');
      }
      
      console.log(`Updating MongoDB for ${trackingId}`);
      
      // Try different formats of ID to find the document
      const possibleIds = [
        trackingId,
        trackingId.toString(),
        `ERC-${trackingId.replace(/^ERC-/, '')}`,
        trackingId.replace(/^ERC-/, '')
      ];
      
      let submission = null;
      
      // Try each format
      for (const id of possibleIds) {
        try {
          const doc = await Submission.findOne({ submissionId: id });
          if (doc) {
            submission = doc;
            console.log(`Found MongoDB document with submissionId=${id}`);
            break;
          }
        } catch (findError) {
          console.log(`Error looking up ${id}:`, findError.message);
        }
      }
      
      // Get current time period from path structure or filename
      let currentTimePeriod = null;
      try {
        // Try to extract from path or filename
        const zipFileName = path.basename(zipPath);
        const pdfFileName = path.basename(pdfPath);
        
        // Look for "Quarter X" or "QX" patterns
        const quarterRegex = /Quarter\s*(\d+)|Q(\d+)/i;
        const zipMatch = zipFileName.match(quarterRegex);
        const pdfMatch = pdfFileName.match(quarterRegex);
        
        if (zipMatch) {
          const num = zipMatch[1] || zipMatch[2];
          currentTimePeriod = `Quarter ${num}`;
        } else if (pdfMatch) {
          const num = pdfMatch[1] || pdfMatch[2];
          currentTimePeriod = `Quarter ${num}`;
        }
        
        // If still not found, try from directory structure
        if (!currentTimePeriod) {
          const dirName = path.basename(path.dirname(zipPath));
          const dirMatch = dirName.match(quarterRegex);
          if (dirMatch) {
            const num = dirMatch[1] || dirMatch[2];
            currentTimePeriod = `Quarter ${num}`;
          }
        }
        
        console.log(`Detected time period: ${currentTimePeriod || 'Unknown'}`);
      } catch (parseError) {
        console.log('Error parsing time period:', parseError.message);
      }
      
      if (!submission) {
        console.log(`No existing MongoDB record found for ${trackingId}, creating new one`);
        
        // Create a new document
        submission = new Submission({
          submissionId: trackingId,
          businessName: businessName,
          status: 'PDF done',
          receivedAt: new Date(),
          submissionData: {
            processedQuarters: currentTimePeriod ? [currentTimePeriod] : [],
            quarterZips: {}
          }
        });
        
        if (currentTimePeriod && result.zipPackageLink) {
          submission.submissionData.quarterZips[currentTimePeriod] = result.zipPackageLink;
        }
        
        await submission.save();
        console.log(`Created new MongoDB record for ${trackingId}`);
      } else {
        console.log(`Updating existing MongoDB record for ${trackingId}`);
        
        // Ensure required nested objects exist
        if (!submission.submissionData) {
          submission.submissionData = {};
        }
        
        if (!submission.submissionData.processedQuarters) {
          submission.submissionData.processedQuarters = [];
        }
        
        if (!submission.submissionData.quarterZips) {
          submission.submissionData.quarterZips = {};
        }
        
        // Update status
        submission.status = 'PDF done';
        
        // Add the current quarter if we have it and it's not already added
        if (currentTimePeriod && !submission.submissionData.processedQuarters.includes(currentTimePeriod)) {
          submission.submissionData.processedQuarters.push(currentTimePeriod);
          console.log(`Added ${currentTimePeriod} to processed quarters`);
        }
        
        // Add the ZIP path for the current quarter
        if (currentTimePeriod && result.zipPackageLink) {
          submission.submissionData.quarterZips[currentTimePeriod] = result.zipPackageLink;
        }
        
        // Store DOCX link if available
        if (result.docxLink) {
          if (!submission.submissionData.documentLinks) {
            submission.submissionData.documentLinks = {};
          }
          submission.submissionData.documentLinks.docxLink = result.docxLink;
        }
        
        await submission.save();
        console.log(`Updated MongoDB record for ${trackingId}`);
      }
    } catch (mongoError) {
      console.error(`Error updating MongoDB for ${trackingId}:`, mongoError);
      console.log('Continuing despite MongoDB error');
      // Continue even if MongoDB update fails
    }
    
    // Update the local file if it exists - with better error handling
    try {
      // Check multiple possible paths
      const possiblePaths = [
        path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`),
        path.join(__dirname, `../data/ERC_Disallowances/ERC-${trackingId.replace(/^ERC-/, '')}/submission_info.json`),
        path.join(__dirname, `../data/ERC_Disallowances/${trackingId.replace(/^ERC-/, '')}/submission_info.json`)
      ];
      
      let updatedFile = false;
      
      for (const filePath of possiblePaths) {
        try {
          if (fsSync.existsSync(filePath)) {
            const submissionData = await fs.readFile(filePath, 'utf8');
            const submissionInfo = JSON.parse(submissionData);
            
            submissionInfo.status = 'PDF done';
            submissionInfo.protestLetterPath = result.protestLetterLink;
            submissionInfo.zipPath = result.zipPackageLink;
            submissionInfo.googleDriveLink = result.folderLink;
            submissionInfo.timestamp = new Date().toISOString();
            
            // Add DOCX path if available
            if (result.docxLink) {
              submissionInfo.docxPath = result.docxLink;
            }
            
            await fs.writeFile(
              filePath,
              JSON.stringify(submissionInfo, null, 2)
            );
            
            console.log(`Updated local file at ${filePath} with Google Drive links`);
            updatedFile = true;
            break;
          }
        } catch (fileError) {
          console.log(`Error with file ${filePath}:`, fileError.message);
        }
      }
      
      if (!updatedFile) {
        console.log(`No local file found for ${trackingId}, skipping file update`);
      }
    } catch (fileErr) {
      console.log(`Error handling local files for ${trackingId}:`, fileErr.message);
    }
    
    return result;
  } catch (error) {
    console.error(`Error uploading to Drive for ${trackingId}:`, error);
    throw error;
  }
}

module.exports = {
  uploadToGoogleDrive
};