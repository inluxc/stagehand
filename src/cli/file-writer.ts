import * as fs from 'fs';
import * as path from 'path';

/**
 * Handles file operations with tracking for rollback support.
 * Tracks all files written during a session so they can be removed
 * if an error occurs during scaffolding.
 */
export class FileWriter {
    private writtenFiles: string[] = [];
    private createdDirs: string[] = [];

    /**
     * Write a file to disk, creating parent directories as needed.
     * Tracks the file path for potential rollback.
     */
    write(filePath: string, content: string): void {
        const dir = path.dirname(filePath);
        this.ensureDir(dir);
        fs.writeFileSync(filePath, content, 'utf-8');
        this.writtenFiles.push(filePath);
    }

    /**
     * Create a directory (and parents) if it doesn't already exist.
     * Tracks newly created directories for rollback.
     */
    ensureDir(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            this.createdDirs.push(dirPath);
        }
    }

    /**
     * Check if a file or directory exists at the given path.
     */
    exists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Read a file's content as a UTF-8 string.
     */
    read(filePath: string): string {
        return fs.readFileSync(filePath, 'utf-8');
    }

    /**
     * Read-modify-write operation on an existing file.
     * The modifier function receives the current content and returns the new content.
     * If the modifier throws, the file remains unchanged.
     */
    update(filePath: string, modifier: (content: string) => string): void {
        const original = fs.readFileSync(filePath, 'utf-8');
        const updated = modifier(original);
        fs.writeFileSync(filePath, updated, 'utf-8');
    }

    /**
     * Remove all files written in the current session (in reverse order)
     * and remove any empty directories that were created.
     */
    rollback(): void {
        // Remove files in reverse order (last written first)
        for (let i = this.writtenFiles.length - 1; i >= 0; i--) {
            const filePath = this.writtenFiles[i];
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch {
                // Best-effort removal during rollback
            }
        }

        // Remove created directories in reverse order (deepest first)
        // Sort by depth descending to ensure child dirs are removed before parents
        const sortedDirs = [...this.createdDirs].sort(
            (a, b) => b.split(path.sep).length - a.split(path.sep).length
        );

        for (const dirPath of sortedDirs) {
            try {
                if (fs.existsSync(dirPath)) {
                    const contents = fs.readdirSync(dirPath);
                    if (contents.length === 0) {
                        fs.rmdirSync(dirPath);
                    }
                }
            } catch {
                // Best-effort removal during rollback
            }
        }

        // Reset tracking state
        this.writtenFiles = [];
        this.createdDirs = [];
    }

    /**
     * Get the list of files written in this session (for summary output).
     */
    getWrittenFiles(): string[] {
        return [...this.writtenFiles];
    }
}
