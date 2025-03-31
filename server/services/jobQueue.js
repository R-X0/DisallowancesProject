// server/services/jobQueue.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jobsDir = path.join(__dirname, '../data/jobs');
const jobs = new Map();

// Ensure jobs directory exists
const initializeJobsDirectory = async () => {
  try {
    if (!fsSync.existsSync(jobsDir)) {
      await fs.mkdir(jobsDir, { recursive: true });
    }
    console.log('Jobs directory initialized');
    
    // Load existing jobs if there are any
    try {
      const files = await fs.readdir(jobsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const jobData = await fs.readFile(path.join(jobsDir, file), 'utf8');
            const job = JSON.parse(jobData);
            jobs.set(job.id, job);
          } catch (err) {
            console.error(`Error loading job file ${file}:`, err);
          }
        }
      }
      console.log(`Loaded ${jobs.size} existing jobs`);
    } catch (err) {
      console.error('Error loading existing jobs:', err);
    }
  } catch (error) {
    console.error('Error creating jobs directory:', error);
  }
};

// Create a new job
const createJob = async (data) => {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'pending',
    created: new Date().toISOString(),
    data: data,
    result: null,
    error: null
  };
  
  jobs.set(jobId, job);
  
  // Save job to disk for persistence
  try {
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(job, null, 2)
    );
  } catch (error) {
    console.error(`Error saving job ${jobId}:`, error);
  }
  
  return jobId;
};

// Update job status
const updateJob = async (jobId, updates) => {
  const job = jobs.get(jobId);
  if (!job) return null;
  
  const updatedJob = { ...job, ...updates, updated: new Date().toISOString() };
  jobs.set(jobId, updatedJob);
  
  // Save updated job to disk
  try {
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(updatedJob, null, 2)
    );
  } catch (error) {
    console.error(`Error updating job ${jobId}:`, error);
  }
  
  return updatedJob;
};

// Get job status
const getJob = async (jobId) => {
  // Try memory first
  if (jobs.has(jobId)) {
    return jobs.get(jobId);
  }
  
  // If not in memory, try to load from disk
  try {
    const jobData = await fs.readFile(path.join(jobsDir, `${jobId}.json`), 'utf8');
    const job = JSON.parse(jobData);
    jobs.set(jobId, job); // Cache in memory
    return job;
  } catch (error) {
    console.error(`Error loading job ${jobId}:`, error);
    return null;
  }
};

// Clean up old jobs (optional - can be run periodically)
const cleanupOldJobs = async (maxAgeHours = 24) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - (maxAgeHours * 60 * 60 * 1000));
  
  try {
    const files = await fs.readdir(jobsDir);
    let cleaned = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(jobsDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoff) {
            // Remove old file
            await fs.unlink(filePath);
            cleaned++;
            
            // Also remove from memory cache
            const jobId = file.replace('.json', '');
            if (jobs.has(jobId)) {
              jobs.delete(jobId);
            }
          }
        } catch (err) {
          console.error(`Error processing job file ${file}:`, err);
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old job files`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error cleaning up old jobs:', error);
    return 0;
  }
};

module.exports = {
  initializeJobsDirectory,
  createJob,
  updateJob,
  getJob,
  cleanupOldJobs
};