// src/services/gitService.js
const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');

const TEMP_REPOS_DIR = './temp_repos'; // Directory to store cloned repos

/**
 * Clones a GitHub repository.
 * @param {string} repoUrl - The GitHub repository URL.
 * @param {string} projectId - Unique ID for the project (used for local directory name).
 * @param {string} branch - The branch to clone (default 'main').
 * @returns {Promise<string>} The local path where the repository was cloned.
 * @throws {Error} If cloning fails.
 */
async function cloneRepository(repoUrl, projectId, branch = 'main') {
    const projectLocalPath = path.join(TEMP_REPOS_DIR, projectId);

    await fs.ensureDir(projectLocalPath); // Ensure the temporary directory exists

    const git = simpleGit();

    console.log(`Cloning ${repoUrl} (branch: ${branch}) to ${projectLocalPath}...`);
    try {
        await git.clone(repoUrl, projectLocalPath, ['--branch', branch, '--single-branch', '--depth', '1']);
        console.log(`Repository cloned to: ${projectLocalPath}`);
        return projectLocalPath;
    } catch (error) {
        console.error(`Failed to clone repository ${repoUrl}:`, error.message);
        throw new Error(`Git clone failed for ${repoUrl}: ${error.message}`);
    }
}

/**
 * Cleans up a cloned repository.
 * @param {string} projectId - The project ID associated with the cloned repo.
 */
async function cleanupRepository(projectId) {
    const projectLocalPath = path.join(TEMP_REPOS_DIR, projectId);
    try {
        if (await fs.pathExists(projectLocalPath)) {
            await fs.remove(projectLocalPath);
            console.log(`Cleaned up temporary repository at: ${projectLocalPath}`);
        }
    } catch (error) {
        console.error(`Error cleaning up repository ${projectLocalPath}:`, error.message);
        // Don't rethrow, cleanup should be best-effort
    }
}

/**
 * Scans a directory for supported code files.
 * @param {string} directory - The directory to scan (e.g., cloned repo root).
 * @returns {Promise<Array<string>>} An array of absolute file paths to supported code files.
 */
async function scanCodeFiles(directory) {
    console.log(`Scanning directory: ${directory} for code files...`);
    const supportedExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.java']); // Matches languageParsers.js

    const allFiles = await fs.readdir(directory, { withFileTypes: true, recursive: true });
    const codeFiles = [];

    for (const dirent of allFiles) {
        const filePath = path.join(dirent.path, dirent.name);
        if (dirent.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            if (supportedExtensions.has(ext)) {
                codeFiles.push(filePath);
            }
        }
    }
    console.log(`Found ${codeFiles.length} supported code files.`);
    return codeFiles;
}

module.exports = {
    cloneRepository,
    cleanupRepository,
    scanCodeFiles
};