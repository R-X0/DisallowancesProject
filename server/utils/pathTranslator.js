// server/utils/pathTranslator.js
const path = require('path');
const fs = require('fs');

// Base directory for the application
const baseDir = path.resolve(__dirname, '../..');

/**
 * Translates Docker container paths to local file system paths
 * @param {string} containerPath - The path stored in the database (e.g., /app/uploads/...)
 * @returns {string} - The translated local file system path
 */
function translatePath(containerPath) {
  if (!containerPath) return null;
  
  // Normalize the path (handles both forward and backslashes)
  const normalizedPath = containerPath.replace(/\\/g, '/');
  
  // Check if this is already a local path - silently
  if (fs.existsSync(normalizedPath)) {
    return normalizedPath;
  }
  
  // Handle Docker-style paths
  if (normalizedPath.startsWith('/app/')) {
    // Replace /app/ with the local base directory
    const localPath = path.join(baseDir, normalizedPath.substring(5));
    
    // Check if the translated path exists - don't log
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    
    // Try a few other common locations
    const pathOptions = [
      // Just the filename (in case it's in the current directory)
      path.join(baseDir, path.basename(normalizedPath)),
      // In server/uploads
      path.join(baseDir, 'server', 'uploads', path.basename(normalizedPath)),
      // In server/reports
      path.join(baseDir, 'server', 'reports', path.basename(normalizedPath)),
    ];
    
    for (const option of pathOptions) {
      if (fs.existsSync(option)) {
        return option;
      }
    }
  }
  
  // If we can't translate it, return the original
  return containerPath;
}

/**
 * Updates file paths in a MongoDB document before sending to client
 * @param {Object} document - MongoDB document with file paths
 * @returns {Object} - Document with updated file paths
 */
function processDocument(document) {
  if (!document) return document;
  
  const result = { ...document };
  
  // Handle receivedFiles array
  if (result.receivedFiles && Array.isArray(result.receivedFiles)) {
    result.receivedFiles = result.receivedFiles.map(file => {
      if (file && file.savedPath) {
        return {
          ...file,
          savedPath: translatePath(file.savedPath),
          // Add a friendly name for display
          fileName: path.basename(file.savedPath || file.originalName || 'unknown-file')
        };
      }
      return file;
    });
  }
  
  // Handle report paths
  if (result.report && result.report.path) {
    result.report.path = translatePath(result.report.path);
    // Add a friendly name for display
    result.report.fileName = path.basename(result.report.path || 'report.xlsx');
  }
  
  return result;
}

module.exports = {
  translatePath,
  processDocument
};