// server/services/packageCreator.js

const AdmZip = require('adm-zip');
const path = require('path');

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
    
    // Add the main document (PDF or DOCX)
    if (!documentPath) {
      throw new Error(`No document path provided for ${outputFormat} document`);
    }
    
    zip.addLocalFile(documentPath);
    console.log(`Added main document to package: ${path.basename(documentPath)}`);
    
    // Add all attachment PDFs
    for (const attachment of attachments) {
      zip.addLocalFile(attachment.path);
      console.log(`Added attachment to package: ${attachment.filename}`);
    }
    
    // Create README content based on document type and format
    const docFileName = path.basename(documentPath);
    const formatDisplay = outputFormat.toUpperCase();
    const readmeContent = documentType === 'form886A' 
      ? `ERC FORM 886-A PACKAGE

Main Document:
- ${docFileName} (The main Form 886-A document in ${formatDisplay} format)

Attachments:
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`
      : `ERC PROTEST PACKAGE

Main Document:
- ${docFileName} (The main protest letter in ${formatDisplay} format)

Attachments:
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