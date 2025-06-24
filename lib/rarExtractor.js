const { createExtractorFromData } = require('node-unrar-js');
const fs = require('fs').promises;
const path = require('path');
const iconv = require('iconv-lite');

class RarExtractor {
    async extractSubtitle(rarPath, outputDir) {
        try {
            const rarData = await fs.readFile(rarPath);
            const extractor = await createExtractorFromData({ data: rarData });
            
            const list = extractor.getFileList();
            const fileHeaders = [...list.fileHeaders];
            
            const subtitleExtensions = ['.srt', '.sub', '.ass', '.ssa', '.vtt'];
            const subtitleFiles = fileHeaders.filter(header => 
                subtitleExtensions.some(ext => header.name.toLowerCase().endsWith(ext))
            );

            if (subtitleFiles.length === 0) {
                console.log('No subtitle files found in RAR archive');
                return [];
            }

            const extractedPaths = [];
            const timestamp = Date.now();

            // Extract ALL subtitle files, not just the largest one
            for (let i = 0; i < subtitleFiles.length; i++) {
                const subtitleFile = subtitleFiles[i];
                console.log(`Extracting subtitle ${i + 1}/${subtitleFiles.length}: ${subtitleFile.name}`);
                
                try {
                    const extracted = extractor.extract({ file: subtitleFile });
                    const files = [...extracted.files];
                    
                    if (files.length > 0) {
                        const file = files[0];
                        const fileData = file.extraction;
                        
                        let content = Buffer.from(fileData);
                        
                        let encoding = this.detectEncoding(content);
                        let decodedContent = iconv.decode(content, encoding);
                        
                        decodedContent = this.fixSubtitleContent(decodedContent);
                        
                        const outputFileName = `extracted_${timestamp}_${i}_${path.basename(subtitleFile.name, path.extname(subtitleFile.name))}.srt`;
                        const outputPath = path.join(outputDir, outputFileName);
                        
                        await fs.writeFile(outputPath, decodedContent, 'utf8');
                        extractedPaths.push(outputPath);
                    }
                } catch (extractError) {
                    console.error(`Error extracting ${subtitleFile.name}:`, extractError);
                }
            }
            
            return extractedPaths;
        } catch (error) {
            console.error('Error extracting RAR:', error);
            return [];
        }
    }

    detectEncoding(buffer) {
        const possibleEncodings = ['utf8', 'utf16le', 'cp1250', 'iso-8859-2', 'windows-1250'];
        
        for (const encoding of possibleEncodings) {
            try {
                const decoded = iconv.decode(buffer, encoding);
                if (!decoded.includes('�') && decoded.includes('ă') || decoded.includes('â')) {
                    return encoding;
                }
            } catch (e) {
                continue;
            }
        }
        
        return 'cp1250';
    }

    fixSubtitleContent(content) {
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        content = content.replace(/^\uFEFF/, '');
        
        const lines = content.split('\n');
        const fixedLines = [];
        let currentIndex = 1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (/^\d+$/.test(line)) {
                fixedLines.push(currentIndex.toString());
                currentIndex++;
            } else {
                fixedLines.push(lines[i]);
            }
        }
        
        return fixedLines.join('\n');
    }
}

module.exports = RarExtractor;