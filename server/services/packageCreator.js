// server/services/packageCreator.js

const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

/**
 * Create a complete package ZIP file with all document components
 * @param {string} documentPath - Path to the main document (PDF or DOCX)
 * @param {Array} attachments - Array of attachment objects
 * @param {string} zipPath - Path where to save the ZIP file
 * @param {string} documentType - Type of document (protestLetter or form886A)
 * @param {string} outputFormat - Format of the main document (pdf or docx)
 * @returns {string} - Path to the created ZIP file
 */
async function createPackage(documentPath, attachments, zipPath, documentType, outputFormat = 'pdf') {
  try {
    console.log(`Creating package at ${zipPath} with main document from ${documentPath}`);
    console.log(`Document format: ${outputFormat}`);
    
    // Create ZIP archive
    const zip = new AdmZip();
    
    // Add the main document (PDF or DOCX) with verification
    if (!documentPath) {
      throw new Error(`No document path provided for ${outputFormat} document`);
    }
    
    // Check if the document exists
    if (!fs.existsSync(documentPath)) {
      console.log(`Document not found at ${documentPath}, waiting 2 seconds...`);
      // Wait a bit and try again
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!fs.existsSync(documentPath)) {
        // If DOCX isn't available, try falling back to PDF
        if (outputFormat === 'docx') {
          const pdfPath = documentPath.replace(/\.docx$/i, '.pdf');
          console.log(`DOCX not found, checking for PDF at: ${pdfPath}`);
          
          if (fs.existsSync(pdfPath)) {
            console.log(`Found PDF instead, using: ${pdfPath}`);
            documentPath = pdfPath;
            outputFormat = 'pdf';
          } else {
            throw new Error(`Document file not found at ${documentPath} and no PDF fallback available`);
          }
        } else {
          throw new Error(`Document file not found at ${documentPath}`);
        }
      }
    }
    
    // Get file stats for logging
    const stats = fs.statSync(documentPath);
    console.log(`Adding document to package: ${documentPath} (${stats.size} bytes)`);
    
    // Now add the document to the ZIP
    zip.addLocalFile(documentPath);
    console.log(`Added main document to package: ${path.basename(documentPath)}`);
    
    // Add all attachment PDFs with verification
    let addedAttachments = 0;
    for (const attachment of attachments) {
      if (!attachment || !attachment.path) {
        console.log(`Skipping invalid attachment entry`);
        continue;
      }
      
      if (!fs.existsSync(attachment.path)) {
        console.log(`Attachment not found: ${attachment.path}, skipping...`);
        continue;
      }
      
      try {
        zip.addLocalFile(attachment.path);
        console.log(`Added attachment to package: ${attachment.filename}`);
        addedAttachments++;
      } catch (attachError) {
        console.log(`Error adding attachment ${attachment.filename}: ${attachError.message}`);
      }
    }
    
    // Create README content based on document type and format
    const docFileName = path.basename(documentPath);
    const formatDisplay = outputFormat.toUpperCase();
    const readmeContent = documentType === 'form886A' 
      ? `ERC FORM 886-A PACKAGE

Main Document:
- ${docFileName} (The main Form 886-A document in ${formatDisplay} format)

Attachments (${addedAttachments} total):
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`
      : `ERC PROTEST PACKAGE

Main Document:
- ${docFileName} (The main protest letter in ${formatDisplay} format)

Attachments (${addedAttachments} total):
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`;
    
    // Add README file
    zip.addFile('README.txt', Buffer.from(readmeContent));
    console.log('Added README.txt to package');
    
    // Write the ZIP file
    zip.writeZip(zipPath);
    console.log(`ZIP package created at: ${zipPath}`);
    
    return zipPath;
  } catch (error) {
    console.error('Error creating package:', error);
    throw new Error(`Failed to create package: ${error.message}`);
  }
}

module.exports = {
  createPackage
};